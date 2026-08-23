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
import { createMilestonesRouter, type MilestoneRoutesDeps } from "../src/routes/milestones.ts";

// Goal 2.3.4 (02-SPEC C.5, amandemen 2.11.0) — GET list Milestone, seluruh
// status termasuk ARCHIVED/DELETED, tanpa Owner-only restriction.

const T0 = "2026-08-01T00:00:00.000Z";

interface TestCtx {
  globalClient: Client;
  deps: MilestoneRoutesDeps;
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
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-mslist-"));
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
    sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_active', 'Active', NULL, 0, ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, archived_at, version) VALUES ('ms_archived', 'Archived', NULL, 0, ?, ?, ?, 1)",
    args: [now, now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, deleted_at, version) VALUES ('ms_deleted', 'Deleted', NULL, 0, ?, ?, ?, 1)",
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
    deps: {
      resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
      newMilestoneId: () => `ms-${Math.random().toString(36).slice(2, 10)}`,
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
  return new Hono().route("/", createMilestonesRouter(() => ctx.deps));
}

describe("GET /api/v1/projects/:project_id/milestones — goal 2.3.4", () => {
  it("[C.5] mengembalikan SELURUH Milestone termasuk ARCHIVED/DELETED, tanpa filter server-side", async () => {
    const res = await makeApp().request(`http://localhost/v1/projects/${projectIdValue}/milestones`, {
      headers: { "x-test-user": "user-a" },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    const ids = json.data.milestones.map((m: { id: string }) => m.id).sort();
    expect(ids).toEqual(["ms_active", "ms_archived", "ms_deleted"]);
  });

  it("[Bukan Owner-only] member non-Owner tetap 200 (baca-saja)", async () => {
    const res = await makeApp().request(`http://localhost/v1/projects/${projectIdValue}/milestones`, {
      headers: { "x-test-user": "user-b" },
    });
    expect(res.status).toBe(200);
  });

  it("[Boundary/Authz] tanpa membership → PROJECT_ACCESS_DENIED; tanpa identitas → 401", async () => {
    const denied = await makeApp().request(`http://localhost/v1/projects/${projectIdValue}/milestones`, {
      headers: { "x-test-user": "user-stranger" },
    });
    expect(denied.status).toBe(403);
    expect((await denied.json()).error?.code).toBe("PROJECT_ACCESS_DENIED");

    const noIdentity = await makeApp().request(`http://localhost/v1/projects/${projectIdValue}/milestones`);
    expect(noIdentity.status).toBe(401);
  });
});
