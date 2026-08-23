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
import { createActivitiesRouter, type ActivityRoutesDeps } from "../src/routes/activities.ts";

// Goal 3.10.1 (02-SPEC C.9) — GET /activities generic + 4 convenience route.
// Baca-saja, membership aktif cukup (bukan Owner-only).

const T0 = "2026-08-01T00:00:00.000Z";

interface TestCtx {
  globalClient: Client;
  deps: ActivityRoutesDeps;
}

let ctx: TestCtx;
let projectIdValue: string;
let projectDbPathValue: string;
let otherProjectIdValue: string;
let otherProjectDbPathValue: string;

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
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-activities-"));
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
  projectDbPathValue = `file:${join(dir, `${projectIdValue}.db`)}`;
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
    sql: "INSERT INTO cards (id, list_id, creator_user_id, title, created_at, updated_at, version) VALUES ('c_1', 'l_1', 'user-a', 'C1', ?, ?, 1)",
    args: [now, now],
  });

  // Activity per entity_type, timestamp berurutan agar filter from/to teruji.
  const seed: Array<{ id: string; entityType: string; entityId: string; action: string; actor: string; createdAt: string }> = [
    { id: "act_1", entityType: "milestone", entityId: "ms_1", action: "milestone.created", actor: "user-a", createdAt: "2026-08-01T00:00:01.000Z" },
    { id: "act_2", entityType: "board", entityId: "b_1", action: "board.created", actor: "user-a", createdAt: "2026-08-01T00:00:02.000Z" },
    { id: "act_3", entityType: "list", entityId: "l_1", action: "list.created", actor: "user-a", createdAt: "2026-08-01T00:00:03.000Z" },
    { id: "act_4", entityType: "card", entityId: "c_1", action: "card.created", actor: "user-a", createdAt: "2026-08-01T00:00:04.000Z" },
    { id: "act_5", entityType: "card", entityId: "c_1", action: "card.updated", actor: "user-b", createdAt: "2026-08-01T00:00:05.000Z" },
  ];
  for (const a of seed) {
    await projectClient.execute({
      sql: "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, ?, ?, 1, ?, ?, '{}', ?)",
      args: [a.id, a.entityType, a.entityId, a.actor, a.action, a.createdAt],
    });
  }
  await projectClient.close();
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: projectIdValue,
    databaseId: projectDbPathValue,
    ownerUserId: "user-a",
    now,
  });

  // Project kedua (Project-boundary) — punya Activity sendiri, non-Owner user-a tidak member.
  otherProjectIdValue = `b-${newProjectId()}`;
  otherProjectDbPathValue = `file:${join(dir, `${otherProjectIdValue}.db`)}`;
  const otherClient = createClient({ url: otherProjectDbPathValue });
  await applyProjectMigrations(otherClient);
  await otherClient.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, ?, ?, ?, 1)",
    args: [otherProjectIdValue, "Proj B", now, now],
  });
  await otherClient.execute({
    sql: "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES ('act_other', 'project', ?, 1, 'user-b', 'project.updated', '{}', ?)",
    args: [otherProjectIdValue, now],
  });
  await otherClient.close();
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: otherProjectIdValue,
    databaseId: otherProjectDbPathValue,
    ownerUserId: "user-b",
    now,
  });

  ctx = {
    globalClient,
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
  return new Hono().route("/", createActivitiesRouter(() => ctx.deps));
}

describe("GET /api/v1/projects/:project_id/activities — goal 3.10.1", () => {
  it("[C.9] generic tanpa filter mengembalikan seluruh 5 Activity Project ini, terurut created_at ASC", async () => {
    const res = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/activities`, {
      headers: { "x-test-user": "user-a" },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.activities).toHaveLength(5);
    expect(json.data.activities.map((a: { id: string }) => a.id)).toEqual(["act_1", "act_2", "act_3", "act_4", "act_5"]);
  });

  it("[C.9] filter entity_type+entity_id mengembalikan HANYA Activity entity tsb", async () => {
    const res = await makeApp().request(
      `http://localhost/api/v1/projects/${projectIdValue}/activities?entity_type=card&entity_id=c_1`,
      { headers: { "x-test-user": "user-a" } },
    );
    const json = await res.json();
    expect(json.data.activities).toHaveLength(2);
    expect(json.data.activities.every((a: { entityType: string }) => a.entityType === "card")).toBe(true);
  });

  it("[C.9] filter actor+action+from/to menyempitkan hasil dengan benar", async () => {
    const byActor = await makeApp().request(
      `http://localhost/api/v1/projects/${projectIdValue}/activities?actor=user-b`,
      { headers: { "x-test-user": "user-a" } },
    );
    expect((await byActor.json()).data.activities).toHaveLength(1);

    const byAction = await makeApp().request(
      `http://localhost/api/v1/projects/${projectIdValue}/activities?action=card.created`,
      { headers: { "x-test-user": "user-a" } },
    );
    expect((await byAction.json()).data.activities).toHaveLength(1);

    const byRange = await makeApp().request(
      `http://localhost/api/v1/projects/${projectIdValue}/activities?from=2026-08-01T00:00:02.000Z&to=2026-08-01T00:00:03.000Z`,
      { headers: { "x-test-user": "user-a" } },
    );
    expect((await byRange.json()).data.activities.map((a: { id: string }) => a.id)).toEqual(["act_2", "act_3"]);
  });

  it("[Convenience routes] card/milestone/board/list mengembalikan subset identik dengan generic+filter manual", async () => {
    const routes: Array<[string, string]> = [
      [`cards/c_1`, "card"],
      [`milestones/ms_1`, "milestone"],
      [`boards/b_1`, "board"],
      [`lists/l_1`, "list"],
    ];
    for (const [path, entityType] of routes) {
      const res = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/${path}/activities`, {
        headers: { "x-test-user": "user-a" },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.activities.length).toBeGreaterThan(0);
      expect(json.data.activities.every((a: { entityType: string }) => a.entityType === entityType)).toBe(true);
    }
  });

  it("[Authz + boundary] tanpa identitas 401; non-member 403; Activity Project lain tidak pernah muncul", async () => {
    const noIdentity = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/activities`);
    expect(noIdentity.status).toBe(401);

    // user-a bukan member Project B (Owner-nya user-b).
    const denied = await makeApp().request(`http://localhost/api/v1/projects/${otherProjectIdValue}/activities`, {
      headers: { "x-test-user": "user-a" },
    });
    expect(denied.status).toBe(403);
    expect((await denied.json()).error?.code).toBe("PROJECT_ACCESS_DENIED");

    // GET biasa tetap tidak Owner-only: member non-Owner (user-b bukan member Project A) tetap ditolak
    // karena bukan member, BUKAN karena non-Owner — buktikan lewat Project B: user-a (bukan member) ditolak,
    // sementara isolasi struktural per-Project-DB memastikan act_other tidak pernah muncul di Project A manapun.
    const projA = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/activities`, {
      headers: { "x-test-user": "user-a" },
    });
    const ids = (await projA.json()).data.activities.map((a: { id: string }) => a.id);
    expect(ids).not.toContain("act_other");
  });

  it("[BR-024/invariant #8] tidak ada endpoint PUT/PATCH/DELETE pada /activities", async () => {
    for (const method of ["PUT", "PATCH", "DELETE", "POST"]) {
      const res = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/activities`, {
        method,
        headers: { "x-test-user": "user-a" },
      });
      expect(res.status).toBe(404);
    }
  });
});
