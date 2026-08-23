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
import { createBoardsRouter, type BoardRoutesDeps } from "../src/routes/boards.ts";

const NOW = "2026-08-01T00:00:00.000Z";

interface Ctx {
  globalClient: Client;
  msDeps: MilestoneRoutesDeps;
  bdDeps: BoardRoutesDeps;
}

let ctx: Ctx;
let projectIdValue: string;
let projectDbPath: string;

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
  const dir = await mkdtemp(join(tmpdir(), "kanban-authz-scoped-"));
  const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  for (const user of ["user-owner", "user-ms", "user-bd", "user-none"]) {
    await globalClient.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
      args: [user, `${user}@t.local`, user, NOW, NOW],
    });
  }
  projectIdValue = `a-${newProjectId()}`;
  projectDbPath = `file:${join(dir, `${projectIdValue}.db`)}`;
  const projectClient = createClient({ url: projectDbPath });
  await applyProjectMigrations(projectClient);
  await projectClient.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, 'P', ?, ?, 1)",
    args: [projectIdValue, NOW, NOW],
  });
  await projectClient.execute({
    sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_x', 'X', NULL, 0, ?, ?, 1), ('ms_y', 'Y', NULL, 0, ?, ?, 1)",
    args: [NOW, NOW, NOW, NOW],
  });
  await projectClient.execute({
    sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('bd_x', 'ms_x', 'BX', NULL, ?, ?, 1)",
    args: [NOW, NOW],
  });
  await projectClient.close();

  await registerProjectWithOwnerMembership(globalClient, {
    projectId: projectIdValue,
    databaseId: projectDbPath,
    ownerUserId: "user-owner",
    now: NOW,
  });
  for (const [mid, uid] of [
    ["m-ms", "user-ms"],
    ["m-bd", "user-bd"],
    ["m-none", "user-none"],
  ] as const) {
    await globalClient.execute({
      sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES (?, ?, ?, ?, NULL)",
      args: [mid, projectIdValue, uid, NOW],
    });
  }
  // Group G: milestone.update + board.update, di-scope di Milestone X saja.
  await globalClient.execute({
    sql: "INSERT INTO permission_groups (id, project_id, name, created_at, updated_at) VALUES ('g_scoped', ?, 'G', ?, ?)",
    args: [projectIdValue, NOW, NOW],
  });
  await globalClient.execute("INSERT OR IGNORE INTO permissions (id, key) VALUES ('p_mu', 'milestone.update')");
  await globalClient.execute("INSERT OR IGNORE INTO permissions (id, key) VALUES ('p_bu', 'board.update')");
  const idOf = async (key: string): Promise<string> => {
    const r = await globalClient.execute({ sql: "SELECT id FROM permissions WHERE key = ?", args: [key] });
    return String(r.rows[0]!.id);
  };
  await globalClient.execute({
    sql: "INSERT INTO group_permissions (group_id, permission_id, created_at) VALUES ('g_scoped', ?, ?), ('g_scoped', ?, ?)",
    args: [await idOf("milestone.update"), NOW, await idOf("board.update"), NOW],
  });
  await globalClient.execute({
    sql: "INSERT INTO membership_group_assignments (id, membership_id, group_id, scope_type, scope_id, created_at, revoked_at) VALUES ('ga_ms', 'm-ms', 'g_scoped', 'milestone', 'ms_x', ?, NULL), ('ga_bd', 'm-bd', 'g_scoped', 'milestone', 'ms_x', ?, NULL)",
    args: [NOW, NOW],
  });

  const makeDeps = <T>(): T =>
    ({
      resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
      newMilestoneId: newProjectId,
      newBoardId: newProjectId,
      openProjectContext: async (request, pid) => {
        const pipeline = new RequestPipeline({
          identityResolver: { resolveIdentity: (req) => identityFor(req.headers.get("x-test-user")) },
          globalClient,
          databaseResolver: new SqliteProjectDatabaseResolver(globalClient),
          projectClientFactory: { create: (databaseId) => createClient({ url: databaseId }) },
        });
        const resolved = await pipeline.run(request, pid as string);
        return {
          userId: resolved.identity.userId,
          ownerUserId: resolved.project.ownerUserId,
          database: resolved.database,
          permission: resolved.permission,
          effectiveFor: createEntityPermissionResolver({
            globalClient,
            membershipId: resolved.membership.id,
            projectId: pid as string,
            isOwner: resolved.project.ownerUserId === resolved.identity.userId,
          }),
        };
      },
    }) as unknown as T;

  ctx = { globalClient, msDeps: makeDeps<MilestoneRoutesDeps>(), bdDeps: makeDeps<BoardRoutesDeps>() };
});

afterAll(async () => {
  await ctx.globalClient.close();
});

const patchMs = (mid: string, user: string): Promise<Response> =>
  new Hono().route("/", createMilestonesRouter(() => ctx.msDeps)).request(
    `http://localhost/api/v1/projects/${projectIdValue}/milestones/${mid}`,
    {
      method: "PATCH",
      headers: { "x-test-user": user, "content-type": "application/json" },
      body: JSON.stringify({ expected_version: 1, title: `${mid} by ${user}` }),
    },
  );

const patchBd = (bid: string, user: string): Promise<Response> =>
  new Hono().route("/", createBoardsRouter(() => ctx.bdDeps)).request(
    `http://localhost/api/v1/projects/${projectIdValue}/boards/${bid}`,
    {
      method: "PATCH",
      headers: { "x-test-user": user, "content-type": "application/json" },
      body: JSON.stringify({ expected_version: 1, title: `${bid} by ${user}` }),
    },
  );

describe("Formula ALLOW per-entity scope (goal 4.4.1)", () => {
  it("[BR-042 positif] grant milestone.update @ms_x → user-ms BOLEH update ms_x", async () => {
    const res = await patchMs("ms_x", "user-ms");
    expect(res.status).toBe(200);
  });

  it("[negatif] grant @ms_x TIDAK berlaku untuk ms_y (Project sama) → PERMISSION_DENIED", async () => {
    const res = await patchMs("ms_y", "user-ms");
    expect(res.status).toBe(403);
    expect((await res.json()).error?.code).toBe("PERMISSION_DENIED");
  });

  it("[negatif] Membership tanpa assignment apa pun → 403", async () => {
    const res = await patchMs("ms_x", "user-none");
    expect(res.status).toBe(403);
  });

  it("[BR-042 pewarisan] grant board.update @ms_x → user-bd BOLEH update Board bd_x (descendant)", async () => {
    const res = await patchBd("bd_x", "user-bd");
    expect(res.status).toBe(200);
  });

  it("[regresi BR-035/037] Owner tetap berhasil tanpa assignment apa pun", async () => {
    const res = await patchMs("ms_y", "user-owner");
    expect(res.status).toBe(200);
  });
});
