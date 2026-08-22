import { mkdtemp, rm } from "node:fs/promises";
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
} from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";
import { createBoardsRouter, type BoardRoutesDeps } from "../src/routes/boards.ts";

interface TestCtx {
  globalClient: Client;
  deps: BoardRoutesDeps;
  dir: string;
}

let ctx: TestCtx;

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
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-boards-"));
  const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  const now = new Date().toISOString();
  for (const user of ["user-a", "user-b"]) {
    await globalClient.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
      args: [user, `${user}@test.local`, user, now, now],
    });
  }

  const provision = async (projectId: string, _ownerUserId: string): Promise<string> => {
    const dbPath = `file:${join(dir, `${projectId}.db`)}`;
    const projectClient = createClient({ url: dbPath });
    await applyProjectMigrations(projectClient);
    await projectClient.execute({
      sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, ?, ?, ?, 1)",
      args: [projectId, `P ${projectId}`, now, now],
    });
    return dbPath;
  };

  const idA = `a-${newProjectId()}`;
  const idB = `b-${newProjectId()}`;
  const pathA = await provision(idA, "user-a");
  const pathB = await provision(idB, "user-b");
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: idA,
    databaseId: pathA,
    ownerUserId: "user-a",
    now,
  });
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: idB,
    databaseId: pathB,
    ownerUserId: "user-b",
    now,
  });
  const projectDb = createClient({ url: pathA });
  for (const [id, archived] of [
    ["ms_live", null],
    ["ms_arc", now],
  ] as const) {
    await projectDb.execute({
      sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, archived_at, version) VALUES (?, ?, NULL, 0, ?, ?, ?, 1)",
      args: [id, `M ${id}`, now, now, archived],
    });
  }
  await projectDb.execute({
    sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('bd_get', 'ms_live', 'Papan Get', NULL, ?, ?, 1)",
    args: [now, now],
  });
  await projectDb.close();

  ctx = {
    globalClient,
    dir,
    deps: {
      resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
      newBoardId: () => `bd-${Math.random().toString(36).slice(2, 10)}`,
      openProjectContext: async (request, projectId) => {
        const pipeline = new RequestPipeline({
          identityResolver: {
            resolveIdentity: (req) => identityFor(req.headers.get("x-test-user")),
          },
          globalClient,
          databaseResolver: new SqliteProjectDatabaseResolver(globalClient),
          projectClientFactory: {
            create: (databaseId) => createClient({ url: databaseId }),
          },
        });
        const resolved = await pipeline.run(request, projectId);
        return {
          userId: resolved.identity.userId,
          ownerUserId: resolved.project.ownerUserId,
          database: resolved.database,
        };
      },
    },
  };
});

afterAll(async () => {
  await ctx.globalClient.close();
  await rm(ctx.dir, { recursive: true, force: true });
});

function makeApp(): Hono {
  return new Hono().route("/", createBoardsRouter(() => ctx.deps));
}

async function projectIdOwnedBy(owner: string): Promise<string> {
  const rows = await ctx.globalClient.execute({
    sql: "SELECT id FROM projects WHERE owner_user_id = ? LIMIT 1",
    args: [owner],
  });
  return String(rows.rows[0]!.id);
}

describe("POST /api/v1/projects/:project_id/milestones/:milestone_id/boards — goal 2.5.1", () => {
  it("[FR-018][C.6][C.2] Owner membuat board → 201 envelope data.board + Activity board.created", async () => {
    const projectId = await projectIdOwnedBy("user-a");
    const res = await makeApp().request(`http://localhost/api/v1/projects/${projectId}/milestones/ms_live/boards`, {
      method: "POST",
      headers: { "x-test-user": "user-a", "content-type": "application/json" },
      body: JSON.stringify({ title: "Papan Baru", description: "desc" }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.board).toMatchObject({
      title: "Papan Baru",
      description: "desc",
      version: 1,
      archivedAt: null,
      deletedAt: null,
    });
    const boardId = json.data.board.id as string;
    const dbRow = await ctx.globalClient.execute({
      sql: "SELECT d.database_id AS db FROM project_databases d WHERE d.project_id = ?",
      args: [projectId],
    });
    const projectDb = createClient({ url: String(dbRow.rows[0]!.db) });
    try {
      const row = await projectDb.execute({
        sql: "SELECT milestone_id, title FROM boards WHERE id = ?",
        args: [boardId],
      });
      expect(row.rows[0]).toMatchObject({ milestone_id: "ms_live", title: "Papan Baru" });
      const activity = await projectDb.execute({
        sql: "SELECT action FROM activities WHERE entity_id = ? AND entity_type = 'board'",
        args: [boardId],
      });
      expect(activity.rows[0]).toMatchObject({ action: "board.created" });
    } finally {
      await projectDb.close();
    }
  });

  it("[Project-boundary] create dengan milestone Project lain / tidak ada → RESOURCE_NOT_FOUND", async () => {
    const projectIdA = await projectIdOwnedBy("user-a");
    const resOther = await makeApp().request(`http://localhost/api/v1/projects/${projectIdA}/milestones/ms_milik_b/boards`, {
      method: "POST",
      headers: { "x-test-user": "user-a", "content-type": "application/json" },
      body: JSON.stringify({ title: "X" }),
    });
    expect(resOther.status).toBe(404);
    expect((await resOther.json()).error?.code).toBe("RESOURCE_NOT_FOUND");

    const rowsB = await ctx.globalClient.execute({
      sql: "SELECT id FROM projects WHERE owner_user_id = 'user-b' LIMIT 1",
    });
    const projectIdB = String(rowsB.rows[0]!.id);
    const resCrossDb = await makeApp().request(`http://localhost/api/v1/projects/${projectIdB}/milestones/ms_live/boards`, {
      method: "POST",
      headers: { "x-test-user": "user-b", "content-type": "application/json" },
      body: JSON.stringify({ title: "X" }),
    });
    expect(resCrossDb.status).toBe(404);
    expect((await resCrossDb.json()).error?.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("[INV-LIFE-001][TASK-2.5 Test] create pada Milestone ARCHIVED → INVALID_STATE 409", async () => {
    const projectId = await projectIdOwnedBy("user-a");
    const res = await makeApp().request(`http://localhost/api/v1/projects/${projectId}/milestones/ms_arc/boards`, {
      method: "POST",
      headers: { "x-test-user": "user-a", "content-type": "application/json" },
      body: JSON.stringify({ title: "X" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error?.code).toBe("INVALID_STATE");
  });

  it("[Authz interim] non-member → PROJECT_ACCESS_DENIED; tanpa identitas → TOKEN_EXPIRED; payload invalid → VALIDATION_ERROR", async () => {
    const projectId = await projectIdOwnedBy("user-a");
    const denied = await makeApp().request(`http://localhost/api/v1/projects/${projectId}/milestones/ms_live/boards`, {
      method: "POST",
      headers: { "x-test-user": "user-b", "content-type": "application/json" },
      body: JSON.stringify({ title: "X" }),
    });
    expect(denied.status).toBe(403);
    expect((await denied.json()).error?.code).toBe("PROJECT_ACCESS_DENIED");

    const noIdentity = await makeApp().request(`http://localhost/api/v1/projects/${projectId}/milestones/ms_live/boards`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "X" }),
    });
    expect(noIdentity.status).toBe(401);

    for (const body of [{}, { title: "" }, { title: 42 }, "bukan-json"]) {
      const res = await makeApp().request(`http://localhost/api/v1/projects/${projectId}/milestones/ms_live/boards`, {
        method: "POST",
        headers: { "x-test-user": "user-a", "content-type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error?.code).toBe("VALIDATION_ERROR");
    }
  });
});

describe("GET /api/v1/projects/:project_id/boards/:board_id — goal 2.5.1", () => {
  it("[C.6][C.2] member membaca board via pipeline", async () => {
    const projectId = await projectIdOwnedBy("user-a");
    const res = await makeApp().request(`http://localhost/api/v1/projects/${projectId}/boards/bd_get`, {
      headers: { "x-test-user": "user-a" },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.board).toMatchObject({ id: "bd_get", milestoneId: "ms_live", title: "Papan Get" });
  });

  it("[INV-04] non-member → PROJECT_ACCESS_DENIED tanpa isi board terungkap", async () => {
    const projectId = await projectIdOwnedBy("user-a");
    const res = await makeApp().request(`http://localhost/api/v1/projects/${projectId}/boards/bd_get`, {
      headers: { "x-test-user": "user-b" },
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error?.code).toBe("PROJECT_ACCESS_DENIED");
    expect(json.data?.board).toBeUndefined();
  });

  it("[C.2] board tidak ada → RESOURCE_NOT_FOUND 404", async () => {
    const projectId = await projectIdOwnedBy("user-a");
    const res = await makeApp().request(`http://localhost/api/v1/projects/${projectId}/boards/bd_none`, {
      headers: { "x-test-user": "user-a" },
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error?.code).toBe("RESOURCE_NOT_FOUND");
  });
});
