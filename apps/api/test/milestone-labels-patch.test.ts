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
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-mslabel-patch-"));
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
  await projectClient.execute({
    sql: "INSERT INTO milestone_labels (id, milestone_id, name, created_at, updated_at, version) VALUES ('ml_patch', 'ms_l', 'Awal', ?, ?, 1)",
    args: [now, now],
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
      newMilestoneLabelId: () => `ml-${Math.random().toString(36).slice(2, 10)}`,
      openProjectContext: async (request, pid) => {
        const pipeline = new RequestPipeline({
          identityResolver: { resolveIdentity: (req) => identityFor(req.headers.get("x-test-user")) },
          globalClient,
          databaseResolver: new SqliteProjectDatabaseResolver(globalClient),
          projectClientFactory: { create: (databaseId) => createClient({ url: databaseId }) },
        });
        const resolved = await pipeline.run(request, pid);
        return { userId: resolved.identity.userId, ownerUserId: resolved.project.ownerUserId, database: resolved.database };
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

function patch(body: unknown, user = "user-a"): Promise<Response> {
  return makeApp().request(
    `http://localhost/api/v1/projects/${projectIdValue}/milestones/ms_l/labels/ml_patch`,
    {
      method: "PATCH",
      headers: { "x-test-user": user, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("PATCH .../milestones/:milestone_id/labels/:label_id — goal 3.4.2", () => {
  it("[C.11][B.5] Owner update name → 200 + Activity milestone_label.updated changes", async () => {
    const res = await patch({ expected_version: 1, name: "Baru" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.label).toMatchObject({ id: "ml_patch", name: "Baru", version: 2 });

    const projectDb = createClient({ url: projectDbPathValue });
    try {
      const activity = await projectDb.execute(
        "SELECT data FROM activities WHERE entity_id = 'ml_patch' AND action = 'milestone_label.updated'",
      );
      expect(JSON.parse(String(activity.rows[0]!.data))).toEqual({
        changes: { name: { before: "Awal", after: "Baru" } },
      });
    } finally {
      await projectDb.close();
    }
  });

  it("[C.15] field selain name → VALIDATION_ERROR; payload invalid bentuk → VALIDATION_ERROR", async () => {
    for (const body of [
      { expected_version: 2, milestone_id: "ms_lain" },
      { expected_version: 2, color: "#ff0000" },
      {},
      { name: "" },
      "bukan-json",
    ]) {
      const res = await patch(body);
      expect(res.status).toBe(400);
      expect((await res.json()).error?.code).toBe("VALIDATION_ERROR");
    }
  });

  it("[AC-020] version mismatch → VERSION_CONFLICT 409 tanpa perubahan", async () => {
    const res = await patch({ expected_version: 999, name: "Tabrak" });
    expect(res.status).toBe(409);
    expect((await res.json()).error?.code).toBe("VERSION_CONFLICT");
  });

  it("[Authz interim] non-Owner member → PERMISSION_DENIED 403; label tidak ada → RESOURCE_NOT_FOUND 404", async () => {
    const denied = await patch({ expected_version: 2, name: "X" }, "user-b");
    expect(denied.status).toBe(403);

    const missing = await makeApp().request(
      `http://localhost/api/v1/projects/${projectIdValue}/milestones/ms_l/labels/ml_none`,
      {
        method: "PATCH",
        headers: { "x-test-user": "user-a", "content-type": "application/json" },
        body: JSON.stringify({ expected_version: 1, name: "X" }),
      },
    );
    expect(missing.status).toBe(404);
    expect(((await missing.json()).error ?? {}).code).toBe("RESOURCE_NOT_FOUND");
  });
});
