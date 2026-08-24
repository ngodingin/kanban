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
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-cd-patch-"));
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
  await projectClient.execute({ sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_p', 'M', NULL, 0, ?, ?, 1)", args: [now, now] });
  await projectClient.execute({ sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('bd_p', 'ms_p', 'B', NULL, ?, ?, 1)", args: [now, now] });
  await projectClient.execute({ sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('ls_p', 'bd_p', 'L', ?, ?, 1)", args: [now, now] });
  await projectClient.execute({
    sql: "INSERT INTO cards (id, list_id, creator_user_id, assignee_user_id, title, subtitle, description, due_date, created_at, updated_at, version) VALUES ('cd_patch', 'ls_p', 'user-a', NULL, 'Awal', 'sub', 'desc', NULL, ?, ?, 1)",
    args: [now, now],
  });
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
      assertAssigneeActiveMember: async (_projectId, userId) => {
        if (!["user-a", "user-b", "user-member"].includes(userId)) {
          throw Object.assign(new Error(`User ${userId} bukan member aktif`), { code: "PERMISSION_DENIED" });
        }
      },
    },
  };
});

afterAll(async () => {
  await ctx.globalClient.close();
});

function makeApp(): Hono {
  return new Hono().route("/", createCardsRouter(() => ctx.deps));
}

function patch(body: unknown, user = "user-a"): Promise<Response> {
  return makeApp().request(`http://localhost/v1/projects/${projectIdValue}/cards/cd_patch`, {
    method: "PATCH",
    headers: { "x-test-user": user, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/v1/projects/:project_id/cards/:card_id — goal 2.9.2", () => {
  it("[C.8][B.5] Owner update field + assignee → 200 + Activity changes", async () => {
    const res = await patch({
      expectedVersion: 1,
      title: "Diperbarui",
      dueDate: "2026-10-01",
      assignee: "user-member",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.card).toMatchObject({
      title: "Diperbarui",
      assigneeUserId: "user-member",
      listId: "ls_p",
      creatorUserId: "user-a",
      version: 2,
    });
  });

  it("[BR-017][BR-061][uji eksplisit] PATCH dengan list_id di body → DITOLAK VALIDATION_ERROR", async () => {
    const res = await patch({ expectedVersion: 2, list_id: "ls_lain" });
    expect(res.status).toBe(400);
    expect((await res.json()).error?.code).toBe("VALIDATION_ERROR");

    const row = await ctx.globalClient.execute({
      sql: "SELECT d.database_id AS db FROM project_databases d WHERE d.project_id = ?",
      args: [projectIdValue],
    });
    const projectDb = createClient({ url: String(row.rows[0]!.db) });
    try {
      const card = await projectDb.execute("SELECT list_id FROM cards WHERE id = 'cd_patch'");
      expect(card.rows[0]).toMatchObject({ list_id: "ls_p" }); // tidak berubah
    } finally {
      await projectDb.close();
    }
  });

  it("[03-ENG A.5] negatif: ganti assignee ke non-member → PERMISSION_DENIED 403", async () => {
    const res = await patch({ expectedVersion: 2, assignee: "orang-luar" });
    expect(res.status).toBe(403);
    expect((await res.json()).error?.code).toBe("PERMISSION_DENIED");
  });

  it("[AC-020] version mismatch → VERSION_CONFLICT 409; [Authz interim] non-Owner → PERMISSION_DENIED", async () => {
    const conflict = await patch({ expectedVersion: 999, title: "Tabrak" });
    expect(conflict.status).toBe(409);

    const denied = await patch({ expectedVersion: 2, title: "X" }, "user-b");
    expect(denied.status).toBe(403);
    expect((await denied.json()).error?.code).toBe("PERMISSION_DENIED");
  });
});
