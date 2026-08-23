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
import { createBoardsRouter, type BoardRoutesDeps } from "../src/routes/boards.ts";

// Goal 2.5.4 (02-SPEC C.6, amandemen 2.11.0) — GET list Board per Milestone,
// seluruh status termasuk ARCHIVED/DELETED, tanpa Owner-only restriction.

const T0 = "2026-08-01T00:00:00.000Z";

interface TestCtx {
  globalClient: Client;
  deps: BoardRoutesDeps;
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
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-bdlist-"));
  const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  const now = T0;
  await globalClient.execute({
    sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES ('user-a', 'user-a@test.local', 1, 'user-a', ?, ?)",
    args: [now, now],
  });

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
    sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_2', 'M2', NULL, 0, ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('bd_1', 'ms_1', 'B1', NULL, ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, archived_at, version) VALUES ('bd_2', 'ms_1', 'B2', NULL, ?, ?, ?, 1)",
    args: [now, now, now],
  });
  // Board di Milestone LAIN — tidak boleh muncul di list ms_1.
  await projectClient.execute({
    sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('bd_other', 'ms_2', 'Other', NULL, ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.close();
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: projectIdValue,
    databaseId: projectDbPathValue,
    ownerUserId: "user-a",
    now,
  });

  ctx = {
    globalClient,
    deps: {
      resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
      newBoardId: () => `bd-${Math.random().toString(36).slice(2, 10)}`,
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
  return new Hono().route("/", createBoardsRouter(() => ctx.deps));
}

describe("GET /api/v1/projects/:project_id/milestones/:milestone_id/boards — goal 2.5.4", () => {
  it("[C.6] mengembalikan seluruh Board Milestone tsb (termasuk ARCHIVED), Board Milestone LAIN tidak muncul", async () => {
    const res = await makeApp().request(
      `http://localhost/api/v1/projects/${projectIdValue}/milestones/ms_1/boards`,
      { headers: { "x-test-user": "user-a" } },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const ids = json.data.boards.map((b: { id: string }) => b.id).sort();
    expect(ids).toEqual(["bd_1", "bd_2"]);
  });

  it("[Boundary/Authz] tanpa membership → PROJECT_ACCESS_DENIED; tanpa identitas → 401", async () => {
    const denied = await makeApp().request(
      `http://localhost/api/v1/projects/${projectIdValue}/milestones/ms_1/boards`,
      { headers: { "x-test-user": "user-stranger" } },
    );
    expect(denied.status).toBe(403);

    const noIdentity = await makeApp().request(
      `http://localhost/api/v1/projects/${projectIdValue}/milestones/ms_1/boards`,
    );
    expect(noIdentity.status).toBe(401);
  });
});
