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
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-bd-patch-"));
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
    sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_p', 'M', NULL, 0, ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('bd_patch', 'ms_p', 'Awal', 'desk', ?, ?, 1)",
    args: [now, now],
  });
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

function patch(body: unknown, user = "user-a"): Promise<Response> {
  return makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/boards/bd_patch`, {
    method: "PATCH",
    headers: { "x-test-user": user, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/v1/projects/:project_id/boards/:board_id — goal 2.5.2", () => {
  it("[C.6][B.5] Owner update title/description → 200 + Activity changes {before, after}", async () => {
    const res = await patch({ expected_version: 1, title: "Baru", description: null });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.board).toMatchObject({
      id: "bd_patch",
      title: "Baru",
      description: null,
      version: 2,
    });
  });

  it("[C.15][FR-019] field di luar title/description → VALIDATION_ERROR", async () => {
    for (const body of [
      { expected_version: 2, progress: 50 },
      { expected_version: 2, wip_limit: 3 },
      { expected_version: 2, status: "ACTIVE" },
      { expected_version: 2, milestone_id: "ms_lain" },
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

  it("[Authz interim] non-Owner member → PERMISSION_DENIED 403", async () => {
    const res = await patch({ expected_version: 2, title: "Bukan milikku" }, "user-b");
    expect(res.status).toBe(403);
    expect((await res.json()).error?.code).toBe("PERMISSION_DENIED");
  });

  it("[C.5] expected_version hilang → VALIDATION_ERROR; board tidak ada → RESOURCE_NOT_FOUND", async () => {
    const res = await patch({ title: "X" });
    expect(res.status).toBe(400);

    const resMissing = await makeApp().request(
      `http://localhost/api/v1/projects/${projectIdValue}/boards/bd_none`,
      {
        method: "PATCH",
        headers: { "x-test-user": "user-a", "content-type": "application/json" },
        body: JSON.stringify({ expected_version: 1, title: "X" }),
      },
    );
    expect(resMissing.status).toBe(404);
  });
});
