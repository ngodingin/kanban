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
import { createListsRouter, type ListRoutesDeps } from "../src/routes/lists.ts";

interface TestCtx {
  globalClient: Client;
  deps: ListRoutesDeps;
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
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-ls-patch-"));
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
  await projectClient.execute({ sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_p', 'M', NULL, 0, ?, ?, 1)", args: [now, now] });
  await projectClient.execute({ sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('bd_p', 'ms_p', 'B', NULL, ?, ?, 1)", args: [now, now] });
  await projectClient.execute({ sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('ls_patch', 'bd_p', 'Awal', ?, ?, 1)", args: [now, now] });
  await projectClient.close();
  await registerProjectWithOwnerMembership(globalClient, { projectId: projectIdValue, databaseId: dbPath, ownerUserId: "user-a", now });
  await globalClient.execute({
    sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES ('m-extra-b', ?, 'user-b', ?, NULL)",
    args: [projectIdValue, now],
  });

  ctx = {
    globalClient,
    deps: {
      resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
      newListId: () => `ls-${Math.random().toString(36).slice(2, 10)}`,
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
  return new Hono().route("/", createListsRouter(() => ctx.deps));
}

function patch(body: unknown, user = "user-a"): Promise<Response> {
  return makeApp().request(`http://localhost/v1/projects/${projectIdValue}/lists/ls_patch`, {
    method: "PATCH",
    headers: { "x-test-user": user, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/v1/projects/:project_id/lists/:list_id — goal 2.7.2", () => {
  it("[C.7][B.5] Owner update title → 200 + Activity changes {before, after}", async () => {
    const res = await patch({ expected_version: 1, title: "Baru" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.list).toMatchObject({ id: "ls_patch", title: "Baru", version: 2 });
  });

  it("[C.15][FR-023] field selain title → VALIDATION_ERROR", async () => {
    for (const body of [
      { expected_version: 2, board_id: "bd_lain" },
      { expected_version: 2, status: "ACTIVE" },
      { expected_version: 2, position: 3 },
      { expected_version: 2, wip_limit: 5 },
    ]) {
      const res = await patch(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await res.json()).error?.code, JSON.stringify(body)).toBe("VALIDATION_ERROR");
    }
  });

  it("[AC-020] version mismatch → VERSION_CONFLICT 409 tanpa perubahan", async () => {
    const res = await patch({ expected_version: 999, title: "Tabrak" });
    expect(res.status).toBe(409);
    expect((await res.json()).error?.code).toBe("VERSION_CONFLICT");
  });

  it("[Authz interim] non-Owner member → PERMISSION_DENIED 403; tanpa identitas → TOKEN_EXPIRED", async () => {
    const denied = await patch({ expected_version: 2, title: "X" }, "user-b");
    expect(denied.status).toBe(403);

    const noIdentity = await makeApp().request(`http://localhost/v1/projects/${projectIdValue}/lists/ls_patch`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expected_version: 2, title: "X" }),
    });
    expect(noIdentity.status).toBe(401);
  });

  it("[Review-CL-02][INV-LIFE-001] PATCH saat ancestor Board ARCHIVED → INVALID_STATE 409 tanpa perubahan", async () => {
    const dbRow = await ctx.globalClient.execute({
      sql: "SELECT d.database_id AS db FROM project_databases d WHERE d.project_id = ?",
      args: [projectIdValue],
    });
    const projectDb = createClient({ url: String(dbRow.rows[0]!.db) });
    try {
      await projectDb.execute("UPDATE boards SET archived_at = '2026-08-21T00:00:00.000Z' WHERE id = 'bd_p'");
    } finally {
      await projectDb.close();
    }
    const res = await patch({ expected_version: 2, title: "Gagal" });
    expect(res.status).toBe(409);
    expect((await res.json()).error?.code).toBe("INVALID_STATE");
  });

  it("[C.7] list tidak ada → RESOURCE_NOT_FOUND 404", async () => {
    const res = await makeApp().request(`http://localhost/v1/projects/${projectIdValue}/lists/ls_none`, {
      method: "PATCH",
      headers: { "x-test-user": "user-a", "content-type": "application/json" },
      body: JSON.stringify({ expected_version: 1, title: "X" }),
    });
    expect(res.status).toBe(404);
  });
});
