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
  createEntityPermissionResolver,
} from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";
import { createBoardsRouter, type BoardRoutesDeps } from "../src/routes/boards.ts";

interface TestCtx {
  globalClient: Client;
  deps: BoardRoutesDeps;
  dir: string;
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
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-bd-lifecycle-"));
  const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  const now = new Date().toISOString();
  for (const user of ["user-a", "user-b"]) {
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
  await projectClient.execute({
    sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_l', 'M', NULL, 0, ?, ?, 1)",
    args: [now, now],
  });
  for (const id of ["bd_arc", "bd_res", "bd_del"]) {
    await projectClient.execute({
      sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES (?, 'ms_l', ?, NULL, ?, ?, 1)",
      args: [id, `B ${id}`, now, now],
    });
  }
  await projectClient.execute({ sql: "UPDATE boards SET archived_at = ? WHERE id = 'bd_res'", args: [now] });
  await projectClient.close();
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: projectIdValue,
    databaseId: dbPath,
    ownerUserId: "user-a",
    now,
  });
  await globalClient.execute({
    sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES ('m-extra-b', ?, 'user-b', ?, NULL)",
    args: [projectIdValue, now],
  });

  ctx = {
    globalClient,
    dir,
    deps: {
      resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
      newBoardId: () => `bd-${Math.random().toString(36).slice(2, 10)}`,
      openProjectContext: async (request, pid) => {
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
  await rm(ctx.dir, { recursive: true, force: true });
});

function makeApp(): Hono {
  return new Hono().route("/", createBoardsRouter(() => ctx.deps));
}

function post(action: string, boardId: string, body: unknown, user = "user-a"): Promise<Response> {
  return makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/boards/${boardId}/${action}`, {
    method: "POST",
    headers: { "x-test-user": user, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST .../boards/:board_id/{archive,restore,delete} — goal 2.5.3", () => {
  it("[A.3] archive ACTIVE → archivedAt terisi; archive ulang → INVALID_STATE", async () => {
    const res = await post("archive", "bd_arc", { expected_version: 1 });
    expect(res.status).toBe(200);
    expect((await res.json()).data.board.archivedAt).toEqual(expect.any(String));

    const again = await post("archive", "bd_arc", { expected_version: 2 });
    expect(again.status).toBe(409);
    expect((await again.json()).error?.code).toBe("INVALID_STATE");
  });

  it("[INV-LIFE-002][TASK-2.5 Test] restore Board saat Milestone ARCHIVED → ditolak INVALID_STATE", async () => {
    const dbRow = await ctx.globalClient.execute({
      sql: "SELECT d.database_id AS db FROM project_databases d WHERE d.project_id = ?",
      args: [projectIdValue],
    });
    const projectDb = createClient({ url: String(dbRow.rows[0]!.db) });
    try {
      await projectDb.execute("UPDATE milestones SET archived_at = '2026-08-20T00:00:00.000Z' WHERE id = 'ms_l'");
    } finally {
      await projectDb.close();
    }
    const res = await post("restore", "bd_res", { expected_version: 1 });
    expect(res.status).toBe(409);
    expect((await res.json()).error?.code).toBe("INVALID_STATE");
  });

  it("[INV-LIFE-002] restore Board setelah Milestone dipulihkan → sukses", async () => {
    const dbRow = await ctx.globalClient.execute({
      sql: "SELECT d.database_id AS db FROM project_databases d WHERE d.project_id = ?",
      args: [projectIdValue],
    });
    const projectDb = createClient({ url: String(dbRow.rows[0]!.db) });
    try {
      await projectDb.execute("UPDATE milestones SET archived_at = NULL WHERE id = 'ms_l'");
    } finally {
      await projectDb.close();
    }
    const res = await post("restore", "bd_res", { expected_version: 1 });
    expect(res.status).toBe(200);
    expect((await res.json()).data.board.archivedAt).toBeNull();
  });

  it("[A.3] delete ACTIVE → deletedAt terisi; delete ulang → INVALID_STATE", async () => {
    const res = await post("delete", "bd_del", { expected_version: 1 });
    expect(res.status).toBe(200);
    expect((await res.json()).data.board.deletedAt).toEqual(expect.any(String));

    const again = await post("delete", "bd_del", { expected_version: 2 });
    expect(again.status).toBe(409);
  });

  it("[AC-020] version mismatch pada semua action → VERSION_CONFLICT 409", async () => {
    for (const action of ["archive", "restore", "delete"]) {
      const res = await post(action, "bd_arc", { expected_version: 9999 });
      expect(res.status, action).toBe(409);
      expect((await res.json()).error?.code, action).toBe("VERSION_CONFLICT");
    }
  });

  it("[C.6] expected_version hilang → VALIDATION_ERROR; tanpa identitas → TOKEN_EXPIRED; non-Owner → PERMISSION_DENIED", async () => {
    const missing = await post("archive", "bd_arc", {});
    expect(missing.status).toBe(400);

    const noIdentity = await makeApp().request(
      `http://localhost/api/v1/projects/${projectIdValue}/boards/bd_arc/archive`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expected_version: 2 }),
      },
    );
    expect(noIdentity.status).toBe(401);

    const denied = await post("archive", "bd_arc", { expected_version: 2 }, "user-b");
    expect(denied.status).toBe(403);
    expect((await denied.json()).error?.code).toBe("PERMISSION_DENIED");
  });

  it("[C.2] board tidak ada → RESOURCE_NOT_FOUND 404", async () => {
    const res = await post("archive", "bd_none", { expected_version: 1 });
    expect(res.status).toBe(404);
    expect((await res.json()).error?.code).toBe("RESOURCE_NOT_FOUND");
  });
});
