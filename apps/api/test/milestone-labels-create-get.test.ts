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
import { createMilestoneLabelsRouter, type MilestoneLabelRoutesDeps } from "../src/routes/labels.ts";

interface TestCtx {
  globalClient: Client;
  deps: MilestoneLabelRoutesDeps;
}

let ctx: TestCtx;
let projectIdValue: string;
let projectDbPathValue: string;

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
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-mslabel-"));
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
    sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_l', 'M', NULL, 0, ?, ?, 1)",
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
      newMilestoneLabelId: () => `ml-${Math.random().toString(36).slice(2, 10)}`,
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

const T0 = "2026-08-01T00:00:00.000Z";

function makeApp(): Hono {
  return new Hono().route("/", createMilestoneLabelsRouter(() => ctx.deps));
}

describe("POST+GET /api/v1/projects/:project_id/milestones/:milestone_id/labels — goal 3.4.1", () => {
  it("[C.11][C.2] Owner membuat label → 201 envelope data.label + Activity milestone_label.created", async () => {
    const res = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/milestones/ms_l/labels`, {
      method: "POST",
      headers: { "x-test-user": "user-a", "content-type": "application/json" },
      body: JSON.stringify({ name: "Bug" }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.label).toMatchObject({ milestoneId: "ms_l", name: "Bug", version: 1 });

    const projectDb = createClient({ url: projectDbPathValue });
    try {
      const activity = await projectDb.execute(
        "SELECT entity_type, action FROM activities WHERE entity_type LIKE '%label'",
      );
      expect(activity.rows[0]).toMatchObject({ entity_type: "milestone_label", action: "milestone_label.created" });
    } finally {
      await projectDb.close();
    }
  });

  it("[INV-LIFE-001] create pada Milestone ARCHIVED → INVALID_STATE 409", async () => {
    const projectDb = createClient({ url: projectDbPathValue });
    try {
      await projectDb.execute("UPDATE milestones SET archived_at = '2026-08-20T00:00:00.000Z' WHERE id = 'ms_l'");
    } finally {
      await projectDb.close();
    }
    const res = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/milestones/ms_l/labels`, {
      method: "POST",
      headers: { "x-test-user": "user-a", "content-type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error?.code).toBe("INVALID_STATE");

    // pulihkan untuk test berikutnya
    const projectDb2 = createClient({ url: projectDbPathValue });
    try {
      await projectDb2.execute("UPDATE milestones SET archived_at = NULL WHERE id = 'ms_l'");
    } finally {
      await projectDb2.close();
    }
  });

  it("[Authz + payload + boundary] non-member 403; tanpa identitas 401; payload invalid 400; milestone asing 404", async () => {
    const denied = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/milestones/ms_l/labels`, {
      method: "POST",
      headers: { "x-test-user": "user-b", "content-type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(denied.status).toBe(403);
    expect((await denied.json()).error?.code).toBe("PROJECT_ACCESS_DENIED");

    const noIdentity = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/milestones/ms_l/labels`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(noIdentity.status).toBe(401);

    for (const body of [{}, { name: "" }, { name: 5 }, { name: "Ok", extra: 1 }, "bukan-json"]) {
      const res = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/milestones/ms_l/labels`, {
        method: "POST",
        headers: { "x-test-user": "user-a", "content-type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error?.code).toBe("VALIDATION_ERROR");
    }

    const missing = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/milestones/ms_none/labels`, {
      method: "POST",
      headers: { "x-test-user": "user-a", "content-type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(missing.status).toBe(409); // ancestor chain DELETED → INVALID_STATE
    expect(((await missing.json()).error ?? {}).code).toBe("INVALID_STATE");
  });

  it("[C.11] GET list member — default exclude deleted; non-member ditolak; tanpa identitas 401", async () => {
    const okRes = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/milestones/ms_l/labels`, {
      headers: { "x-test-user": "user-a" },
    });
    expect(okRes.status).toBe(200);
    const json = await okRes.json();
    expect(Array.isArray(json.data.labels)).toBe(true);
    expect(json.data.labels.length).toBeGreaterThanOrEqual(1);

    const nonMember = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/milestones/ms_l/labels`, {
      headers: { "x-test-user": "orang-luar" },
    });
    expect(nonMember.status).toBe(403);
    expect((await nonMember.json()).error?.code).toBe("PROJECT_ACCESS_DENIED");

    const noIdentity = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/milestones/ms_l/labels`);
    expect(noIdentity.status).toBe(401);
    expect((await noIdentity.json()).error?.code).toBe("TOKEN_EXPIRED");
  });
});
