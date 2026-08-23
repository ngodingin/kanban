import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import {
  applyGlobalMigrations,
  applyProjectMigrations,
  newProjectId,
  registerProjectWithOwnerMembership,
  RequestPipeline,
  SqliteProjectDatabaseResolver,
  createEntityPermissionResolver,
} from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";
import { createCardsRouter, type CardRoutesDeps } from "../src/routes/cards.ts";

interface TestCtx {
  globalClient: Client;
  deps: CardRoutesDeps;
}

let ctx: TestCtx;
let projectIdValue: string;

const identityFor = (userId: string | null): Promise<ResolvedIdentity | null> =>
  userId === null
    ? Promise.resolve(null)
    : Promise.resolve({
        type: "session",
        userId,
        email: `${userId}@test.local`,
        name: userId,
        emailVerified: true,
        image: null,
      });

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-cards-"));
  const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  const now = new Date().toISOString();
  for (const user of ["user-a", "user-b", "user-member"]) {
    await globalClient.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
      args: [user, `${user}@test.local`, user, now, now],
    });
  }

  projectIdValue = `a-${newProjectId()}`;
  const dbPath = `file:${join(dir, `${projectIdValue}.db`)}`;
  const projectClient = createClient({ url: dbPath });
  await applyProjectMigrations(projectClient);
  await projectClient.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, ?, ?, ?, 1)",
    args: [projectIdValue, "Proj A", now, now],
  });
  await projectClient.execute({ sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_c', 'M', NULL, 0, ?, ?, 1)", args: [now, now] });
  await projectClient.execute({ sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('bd_c', 'ms_c', 'B', NULL, ?, ?, 1)", args: [now, now] });
  await projectClient.execute({ sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('ls_c', 'bd_c', 'L', ?, ?, 1)", args: [now, now] });
  await projectClient.close();
  await registerProjectWithOwnerMembership(globalClient, { projectId: projectIdValue, databaseId: dbPath, ownerUserId: "user-a", now });
  for (const member of ["user-b", "user-member"]) {
    await globalClient.execute({
      sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES (?, ?, ?, ?, NULL)",
      args: [`m-${member}`, projectIdValue, member, now],
    });
  }

  ctx = {
    globalClient,
    deps: {
      resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
      newCardId: () => `cd-${Math.random().toString(36).slice(2, 10)}`,
      openProjectContext: async (request, pid) => {
        const pipeline = new RequestPipeline({
          identityResolver: { resolveIdentity: (req) => identityFor(req.headers.get("x-test-user")) },
          globalClient,
          databaseResolver: new SqliteProjectDatabaseResolver(globalClient),
          projectClientFactory: { create: (databaseId) => createClient({ url: databaseId }) },
        });
        const resolved = await pipeline.run(request, pid);
        return {
          userId: resolved.identity.userId,
          ownerUserId: resolved.project.ownerUserId,
          database: resolved.database,
          permission: resolved.permission,
          effectiveFor: createEntityPermissionResolver({
            globalClient,
            membershipId: resolved.membership.id,
            projectId: pid,
            isOwner: resolved.project.ownerUserId === resolved.identity.userId,
          }),
        };
      },
      assertAssigneeActiveMember: (projectId, userId) =>
        requireActive(globalClient, projectId, userId),
    },
  };
});

async function requireActive(globalClient: Client, projectId: string, userId: string): Promise<void> {
  const rows = await globalClient.execute({
    sql: "SELECT m.id FROM project_memberships m WHERE m.project_id = ? AND m.user_id = ? AND m.revoked_at IS NULL",
    args: [projectId, userId],
  });
  if (rows.rows.length === 0) {
    throw Object.assign(new Error(`User ${userId} bukan member aktif`), { code: "PERMISSION_DENIED" });
  }
}

afterAll(async () => {
  await ctx.globalClient.close();
});

function makeApp(): Hono {
  return new Hono().route("/", createCardsRouter(() => ctx.deps));
}

describe("POST /api/v1/projects/:project_id/lists/:list_id/cards — goal 2.9.1", () => {
  it("[FR-024][FR-025][C.8] Owner membuat card dengan assignee → 201 + creator=actor + Activity", async () => {
    const res = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/lists/ls_c/cards`, {
      method: "POST",
      headers: { "x-test-user": "user-a", "content-type": "application/json" },
      body: JSON.stringify({
        title: "Kartu Pertama",
        subtitle: "sub",
        description: "desc",
        due_date: "2026-09-15",
        assignee: "user-member",
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.card).toMatchObject({
      listId: "ls_c",
      creatorUserId: "user-a",
      assigneeUserId: "user-member",
      title: "Kartu Pertama",
      dueDate: "2026-09-15",
      version: 1,
    });

    const dbRow = await ctx.globalClient.execute({
      sql: "SELECT d.database_id AS db FROM project_databases d WHERE d.project_id = ?",
      args: [projectIdValue],
    });
    const projectDb = createClient({ url: String(dbRow.rows[0]!.db) });
    try {
      const activity = await projectDb.execute(
        "SELECT action FROM activities WHERE entity_type = 'card'",
      );
      expect(activity.rows[0]).toMatchObject({ action: "card.created" });
    } finally {
      await projectDb.close();
    }
  });

  it("[03-ENG A.5][FR-026] negatif: assignee bukan member aktif → PERMISSION_DENIED 403", async () => {
    const res = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/lists/ls_c/cards`, {
      method: "POST",
      headers: { "x-test-user": "user-a", "content-type": "application/json" },
      body: JSON.stringify({ title: "X", assignee: "orang-luar" }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error?.code).toBe("PERMISSION_DENIED");
  });

  it("[Project-boundary] list tidak ada di Project ini → RESOURCE_NOT_FOUND 404", async () => {
    const missing = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/lists/ls_none/cards`, {
      method: "POST",
      headers: { "x-test-user": "user-a", "content-type": "application/json" },
      body: JSON.stringify({ title: "X" }),
    });
    expect(missing.status).toBe(404);
    expect((await missing.json()).error?.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("[Authz interim + payload] non-member 403; tanpa identitas 401; payload invalid → VALIDATION_ERROR", async () => {
    const denied = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/lists/ls_c/cards`, {
      method: "POST",
      headers: { "x-test-user": "non-member-z", "content-type": "application/json" },
      body: JSON.stringify({ title: "X" }),
    });
    expect(denied.status).toBe(403);
    expect((await denied.json()).error?.code).toBe("PROJECT_ACCESS_DENIED");

    const noIdentity = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/lists/ls_c/cards`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "X" }),
    });
    expect(noIdentity.status).toBe(401);

    for (const body of [{}, { title: "" }, { title: 7 }, "bukan-json"]) {
      const res = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/lists/ls_c/cards`, {
        method: "POST",
        headers: { "x-test-user": "user-a", "content-type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error?.code).toBe("VALIDATION_ERROR");
    }
  });
});

describe("GET /api/v1/projects/:project_id/cards/:card_id — goal 2.9.1", () => {
  it("[C.8][C.2][Prinsip #5] member membaca card TANPA filter visibility; tidak ada → 404", async () => {
    const dbRow = await ctx.globalClient.execute({
      sql: "SELECT d.database_id AS db FROM project_databases d WHERE d.project_id = ?",
      args: [projectIdValue],
    });
    const projectDb = createClient({ url: String(dbRow.rows[0]!.db) });
    try {
      const cards = await projectDb.execute("SELECT id FROM cards LIMIT 1");
      const cardId = String(cards.rows[0]!.id);

      const res = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/cards/${cardId}`, {
        headers: { "x-test-user": "user-b" }, // member biasa — visibility filter belum ada (Phase 4)
      });
      expect(res.status).toBe(200);
      expect((await res.json()).data.card).toMatchObject({ id: cardId, creatorUserId: "user-a" });

      const missing = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/cards/cd_none`, {
        headers: { "x-test-user": "user-a" },
      });
      expect(missing.status).toBe(404);
    } finally {
      await projectDb.close();
    }
  });
});
