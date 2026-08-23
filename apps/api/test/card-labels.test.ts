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
import { createCardLabelsRouter, type CardLabelRoutesDeps } from "../src/routes/card-labels.ts";

// Goal 3.8.1 (02-SPEC C.11) — POST assign + POST remove Label ke Card,
// otorisasi menumpang card.update (Owner-only interim, BUKAN permission
// Label tersendiri).

const T0 = "2026-08-01T00:00:00.000Z";

interface TestCtx {
  globalClient: Client;
  deps: CardLabelRoutesDeps;
  projectDbPathValue: string;
}

let ctx: TestCtx;
let projectIdValue: string;
let otherProjectIdValue: string;

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
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-cardlabel-"));
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
    sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_1', 'M1', NULL, 0, ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('bd_1', 'ms_1', 'B1', NULL, ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('l_1', 'bd_1', 'L1', ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO cards (id, list_id, creator_user_id, title, created_at, updated_at, version) VALUES ('c_1', 'l_1', 'user-a', 'C1', ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO board_labels (id, board_id, name, created_at, updated_at, version) VALUES ('bl_1', 'bd_1', 'Bug', ?, ?, 1)",
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

  otherProjectIdValue = `b-${newProjectId()}`;
  const otherDbPath = `file:${join(dir, `${otherProjectIdValue}.db`)}`;
  const otherClient = createClient({ url: otherDbPath });
  await applyProjectMigrations(otherClient);
  await otherClient.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, ?, ?, ?, 1)",
    args: [otherProjectIdValue, "Proj B", now, now],
  });
  await otherClient.close();
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: otherProjectIdValue,
    databaseId: otherDbPath,
    ownerUserId: "user-a",
    now,
  });

  ctx = {
    globalClient,
    projectDbPathValue,
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
        return { userId: resolved.identity.userId, ownerUserId: resolved.project.ownerUserId, database: resolved.database };
      },
    },
  };
});

afterAll(async () => {
  await ctx.globalClient.close();
});

function makeApp(): Hono {
  return new Hono().route("/", createCardLabelsRouter(() => ctx.deps));
}

describe("POST .../cards/:card_id/labels (assign) — goal 3.8.1", () => {
  it("[C.11] Owner assign Board Label → 201, envelope data.association", async () => {
    const res = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/cards/c_1/labels`, {
      method: "POST",
      headers: { "x-test-user": "user-a", "content-type": "application/json" },
      body: JSON.stringify({ label_id: "bl_1" }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.association).toMatchObject({ cardId: "c_1", labelId: "bl_1", labelScope: "board", labelName: "Bug" });
  });

  it("[Boundary] assign pada Card yang tidak ada di Project ini → RESOURCE_NOT_FOUND (bukan bocor lintas-Project)", async () => {
    const res = await makeApp().request(`http://localhost/api/v1/projects/${otherProjectIdValue}/cards/c_missing/labels`, {
      method: "POST",
      headers: { "x-test-user": "user-a", "content-type": "application/json" },
      body: JSON.stringify({ label_id: "bl_1" }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error?.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("[Authz] non-Owner member → PERMISSION_DENIED (sama card.update); tanpa identitas 401; payload invalid 400", async () => {
    const denied = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/cards/c_1/labels`, {
      method: "POST",
      headers: { "x-test-user": "user-b", "content-type": "application/json" },
      body: JSON.stringify({ label_id: "bl_1" }),
    });
    expect(denied.status).toBe(403);
    expect((await denied.json()).error?.code).toBe("PERMISSION_DENIED");

    const noIdentity = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/cards/c_1/labels`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label_id: "bl_1" }),
    });
    expect(noIdentity.status).toBe(401);

    const invalid = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/cards/c_1/labels`, {
      method: "POST",
      headers: { "x-test-user": "user-a", "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error?.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST .../cards/:card_id/labels/:label_id/remove — goal 3.8.1", () => {
  it("[C.11] Owner remove asosiasi aktif → 200, removed_at terisi", async () => {
    const res = await makeApp().request(
      `http://localhost/api/v1/projects/${projectIdValue}/cards/c_1/labels/bl_1/remove`,
      { method: "POST", headers: { "x-test-user": "user-a" } },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.association).toMatchObject({ cardId: "c_1", labelId: "bl_1" });

    const projectDb = createClient({ url: ctx.projectDbPathValue });
    try {
      const row = await projectDb.execute(
        "SELECT removed_at FROM card_board_labels WHERE card_id = 'c_1' AND label_id = 'bl_1'",
      );
      expect(row.rows[0]!.removed_at).not.toBeNull();
    } finally {
      await projectDb.close();
    }
  });

  it("[Card ARCHIVED/DELETED ditolak] remove pada Card ARCHIVED → INVALID_STATE 409", async () => {
    const projectDb = createClient({ url: ctx.projectDbPathValue });
    try {
      await projectDb.execute("INSERT INTO card_board_labels (card_id, label_id, created_at, removed_at) VALUES ('c_1', 'bl_1', ?, NULL)", [T0]);
      await projectDb.execute("UPDATE cards SET archived_at = ? WHERE id = 'c_1'", [T0]);
    } finally {
      await projectDb.close();
    }
    const res = await makeApp().request(
      `http://localhost/api/v1/projects/${projectIdValue}/cards/c_1/labels/bl_1/remove`,
      { method: "POST", headers: { "x-test-user": "user-a" } },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error?.code).toBe("INVALID_STATE");

    const projectDb2 = createClient({ url: ctx.projectDbPathValue });
    try {
      await projectDb2.execute("UPDATE cards SET archived_at = NULL WHERE id = 'c_1'");
    } finally {
      await projectDb2.close();
    }
  });

  it("[Authz] non-Owner member → PERMISSION_DENIED", async () => {
    const res = await makeApp().request(
      `http://localhost/api/v1/projects/${projectIdValue}/cards/c_1/labels/bl_1/remove`,
      { method: "POST", headers: { "x-test-user": "user-b" } },
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error?.code).toBe("PERMISSION_DENIED");
  });
});
