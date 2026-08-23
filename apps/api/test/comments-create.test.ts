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
import { createCommentsRouter, type CommentRoutesDeps } from "../src/routes/comments.ts";

// Goal 3.11.1 (02-SPEC C.10, BR-030/033/034) — POST comment sebagai Activity
// Card, tanpa tabel Comment terpisah.

const T0 = "2026-08-01T00:00:00.000Z";

interface TestCtx {
  globalClient: Client;
  deps: CommentRoutesDeps;
  projectDbPathValue: string;
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
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-comments-"));
  const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  const now = T0;
  for (const user of ["user-a", "user-b"]) {
    await globalClient.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
      args: [user, `${user}@test.local`, user, now, now],
    });
  }

  projectIdValue = `a-${newProjectId()}`;
  const projectDbPathValue = `file:${join(dir, `${projectIdValue}.db`)}`;
  const projectClient = createClient({ url: projectDbPathValue });
  await applyProjectMigrations(projectClient);
  await projectClient.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, ?, ?, ?, 1)",
    args: [projectIdValue, "Proj A", now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_1', 'M1', NULL, 0, ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('b_1', 'ms_1', 'B1', NULL, ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('l_1', 'b_1', 'L1', ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO cards (id, list_id, creator_user_id, title, created_at, updated_at, version) VALUES ('c_active', 'l_1', 'user-a', 'C active', ?, ?, 3)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO cards (id, list_id, creator_user_id, title, created_at, updated_at, archived_at, version) VALUES ('c_archived', 'l_1', 'user-a', 'C archived', ?, ?, ?, 1)",
    args: [now, now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO cards (id, list_id, creator_user_id, title, created_at, updated_at, deleted_at, version) VALUES ('c_deleted', 'l_1', 'user-a', 'C deleted', ?, ?, ?, 1)",
    args: [now, now, now],
  });
  await projectClient.close();
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: projectIdValue,
    databaseId: projectDbPathValue,
    ownerUserId: "user-a",
    now,
  });
  await globalClient.execute({
    sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES ('m-extra-b', ?, 'user-b', ?, NULL)",
    args: [projectIdValue, now],
  });

  ctx = {
    globalClient,
    projectDbPathValue,
    deps: {
      resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
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
    },
  };
});

afterAll(async () => {
  await ctx.globalClient.close();
});

function makeApp(): Hono {
  return new Hono().route("/", createCommentsRouter(() => ctx.deps));
}

describe("POST /api/v1/projects/:project_id/cards/:card_id/comments — goal 3.11.1", () => {
  it("[C.10][BR-030] Owner comment pada Card ACTIVE → 201, Activity comment.added dengan entity_version = versi Card TERKINI", async () => {
    const res = await makeApp().request(
      `http://localhost/v1/projects/${projectIdValue}/cards/c_active/comments`,
      {
        method: "POST",
        headers: { "x-test-user": "user-a", "content-type": "application/json" },
        body: JSON.stringify({ body: "Sudah saya cek." }),
      },
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.comment).toMatchObject({ cardId: "c_active", entityVersion: 3, body: "Sudah saya cek." });
    expect(json.data.comment.commentActivityId).toBe(json.data.comment.id);

    const projectDb = createClient({ url: ctx.projectDbPathValue });
    try {
      const row = (
        await projectDb.execute("SELECT action, entity_type, entity_version, data FROM activities WHERE id = ?", [
          json.data.comment.id,
        ])
      ).rows[0];
      expect(row).toMatchObject({ action: "comment.added", entity_type: "card", entity_version: 3 });
      expect(JSON.parse(String(row!.data))).toEqual({ body: "Sudah saya cek." });
      // Comment TIDAK menaikkan version Card (bukan field Card).
      const card = (await projectDb.execute("SELECT version FROM cards WHERE id = 'c_active'")).rows[0];
      expect(Number(card!.version)).toBe(3);
    } finally {
      await projectDb.close();
    }
  });

  it("[BR-033] Comment pada Card ARCHIVED ditolak — INVALID_STATE 409", async () => {
    const res = await makeApp().request(
      `http://localhost/v1/projects/${projectIdValue}/cards/c_archived/comments`,
      {
        method: "POST",
        headers: { "x-test-user": "user-a", "content-type": "application/json" },
        body: JSON.stringify({ body: "X" }),
      },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error?.code).toBe("INVALID_STATE");
  });

  it("[BR-033] Comment pada Card DELETED ditolak — INVALID_STATE 409", async () => {
    const res = await makeApp().request(
      `http://localhost/v1/projects/${projectIdValue}/cards/c_deleted/comments`,
      {
        method: "POST",
        headers: { "x-test-user": "user-a", "content-type": "application/json" },
        body: JSON.stringify({ body: "X" }),
      },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error?.code).toBe("INVALID_STATE");
  });

  it("[INV-LIFE-001][BR-034] Card local-ACTIVE tapi ancestor Milestone ARCHIVED → ditolak (validasi state saat request, bukan snapshot UI)", async () => {
    const projectDb = createClient({ url: ctx.projectDbPathValue });
    try {
      await projectDb.execute("UPDATE milestones SET archived_at = ? WHERE id = 'ms_1'", [T0]);
    } finally {
      await projectDb.close();
    }
    const res = await makeApp().request(
      `http://localhost/v1/projects/${projectIdValue}/cards/c_active/comments`,
      {
        method: "POST",
        headers: { "x-test-user": "user-a", "content-type": "application/json" },
        body: JSON.stringify({ body: "X" }),
      },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error?.code).toBe("INVALID_STATE");

    const projectDb2 = createClient({ url: ctx.projectDbPathValue });
    try {
      await projectDb2.execute("UPDATE milestones SET archived_at = NULL WHERE id = 'ms_1'");
    } finally {
      await projectDb2.close();
    }
  });

  it("[Validasi + Authz] body kosong 400; non-Owner 403; tanpa identitas 401; Card tidak ada 404", async () => {
    const emptyBody = await makeApp().request(
      `http://localhost/v1/projects/${projectIdValue}/cards/c_active/comments`,
      {
        method: "POST",
        headers: { "x-test-user": "user-a", "content-type": "application/json" },
        body: JSON.stringify({ body: "" }),
      },
    );
    expect(emptyBody.status).toBe(400);
    expect((await emptyBody.json()).error?.code).toBe("VALIDATION_ERROR");

    const denied = await makeApp().request(
      `http://localhost/v1/projects/${projectIdValue}/cards/c_active/comments`,
      {
        method: "POST",
        headers: { "x-test-user": "user-b", "content-type": "application/json" },
        body: JSON.stringify({ body: "X" }),
      },
    );
    expect(denied.status).toBe(403);
    expect((await denied.json()).error?.code).toBe("PERMISSION_DENIED");

    const noIdentity = await makeApp().request(
      `http://localhost/v1/projects/${projectIdValue}/cards/c_active/comments`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "X" }),
      },
    );
    expect(noIdentity.status).toBe(401);

    const notFound = await makeApp().request(
      `http://localhost/v1/projects/${projectIdValue}/cards/c_missing/comments`,
      {
        method: "POST",
        headers: { "x-test-user": "user-a", "content-type": "application/json" },
        body: JSON.stringify({ body: "X" }),
      },
    );
    expect(notFound.status).toBe(404);
    expect((await notFound.json()).error?.code).toBe("RESOURCE_NOT_FOUND");
  });
});
