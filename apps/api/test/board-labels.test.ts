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
import { createBoardLabelsRouter, type BoardLabelRoutesDeps } from "../src/routes/labels.ts";

// TASK-3.6 (02-SPEC C.11) — Board Label endpoints, pola identik Milestone
// Label (3.4) tapi ancestor chain 3-level (Board→Milestone→Project).

const T0 = "2026-08-01T00:00:00.000Z";

interface TestCtx {
  globalClient: Client;
  deps: BoardLabelRoutesDeps;
  projectDbPathValue: string;
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
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-bdlabel-"));
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
  for (const id of ["bl_arc", "bl_res", "bl_patch"]) {
    await projectClient.execute({
      sql: "INSERT INTO board_labels (id, board_id, name, created_at, updated_at, version) VALUES (?, 'bd_1', ?, ?, ?, 1)",
      args: [id, `L ${id}`, now, now],
    });
  }
  await projectClient.execute({ sql: "UPDATE board_labels SET archived_at = ? WHERE id = 'bl_res'", args: [now] });
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
    projectDbPathValue,
    deps: {
      resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
      newBoardLabelId: () => `bl-${Math.random().toString(36).slice(2, 10)}`,
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
  return new Hono().route("/", createBoardLabelsRouter(() => ctx.deps));
}

describe("GET+POST /api/v1/projects/:project_id/boards/:board_id/labels — goal 3.6.1", () => {
  it("[C.11] Owner membuat label → 201 envelope data.label + Activity board_label.created", async () => {
    const res = await makeApp().request(`http://localhost/v1/projects/${projectIdValue}/boards/bd_1/labels`, {
      method: "POST",
      headers: { "x-test-user": "user-a", "content-type": "application/json" },
      body: JSON.stringify({ name: "Bug" }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.label).toMatchObject({ boardId: "bd_1", name: "Bug", version: 1 });

    const projectDb = createClient({ url: ctx.projectDbPathValue });
    try {
      const activity = await projectDb.execute(
        "SELECT entity_type, action FROM activities WHERE entity_id = ?",
        [json.data.label.id],
      );
      expect(activity.rows[0]).toMatchObject({ entity_type: "board_label", action: "board_label.created" });
    } finally {
      await projectDb.close();
    }
  });

  it("[INV-LIFE-001] create pada Board ARCHIVED → INVALID_STATE 409", async () => {
    const projectDb = createClient({ url: ctx.projectDbPathValue });
    try {
      await projectDb.execute("UPDATE boards SET archived_at = ? WHERE id = 'bd_1'", [T0]);
    } finally {
      await projectDb.close();
    }
    const res = await makeApp().request(`http://localhost/v1/projects/${projectIdValue}/boards/bd_1/labels`, {
      method: "POST",
      headers: { "x-test-user": "user-a", "content-type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error?.code).toBe("INVALID_STATE");

    const projectDb2 = createClient({ url: ctx.projectDbPathValue });
    try {
      await projectDb2.execute("UPDATE boards SET archived_at = NULL WHERE id = 'bd_1'");
    } finally {
      await projectDb2.close();
    }
  });

  it("[Authz + boundary] non-member 403; tanpa identitas 401; payload invalid 400; GET tidak Owner-only", async () => {
    const denied = await makeApp().request(`http://localhost/v1/projects/${projectIdValue}/boards/bd_1/labels`, {
      method: "POST",
      headers: { "x-test-user": "user-b", "content-type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(denied.status).toBe(403);
    expect((await denied.json()).error?.code).toBe("PERMISSION_DENIED");

    const noIdentity = await makeApp().request(`http://localhost/v1/projects/${projectIdValue}/boards/bd_1/labels`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(noIdentity.status).toBe(401);

    const invalid = await makeApp().request(`http://localhost/v1/projects/${projectIdValue}/boards/bd_1/labels`, {
      method: "POST",
      headers: { "x-test-user": "user-a", "content-type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(invalid.status).toBe(400);

    // GET oleh member non-Owner (user-b) tetap berhasil — baca-saja bukan Owner-only.
    const getRes = await makeApp().request(`http://localhost/v1/projects/${projectIdValue}/boards/bd_1/labels`, {
      headers: { "x-test-user": "user-b" },
    });
    expect(getRes.status).toBe(200);
  });
});

describe("PATCH .../boards/:board_id/labels/:label_id — goal 3.6.2", () => {
  it("[C.15] Owner update name → 200; field asing ditolak; non-Owner 403", async () => {
    const res = await makeApp().request(
      `http://localhost/v1/projects/${projectIdValue}/boards/bd_1/labels/bl_patch`,
      {
        method: "PATCH",
        headers: { "x-test-user": "user-a", "content-type": "application/json" },
        body: JSON.stringify({ name: "Renamed", expectedVersion: 1 }),
      },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.label).toMatchObject({ name: "Renamed", version: 2 });

    const foreignField = await makeApp().request(
      `http://localhost/v1/projects/${projectIdValue}/boards/bd_1/labels/bl_patch`,
      {
        method: "PATCH",
        headers: { "x-test-user": "user-a", "content-type": "application/json" },
        body: JSON.stringify({ boardId: "other", expectedVersion: 2 }),
      },
    );
    expect(foreignField.status).toBe(400);
    expect((await foreignField.json()).error?.code).toBe("VALIDATION_ERROR");

    const denied = await makeApp().request(
      `http://localhost/v1/projects/${projectIdValue}/boards/bd_1/labels/bl_patch`,
      {
        method: "PATCH",
        headers: { "x-test-user": "user-b", "content-type": "application/json" },
        body: JSON.stringify({ name: "X", expectedVersion: 2 }),
      },
    );
    expect(denied.status).toBe(403);
  });

  it("[AC-020] expected_version salah → VERSION_CONFLICT tanpa perubahan", async () => {
    const res = await makeApp().request(
      `http://localhost/v1/projects/${projectIdValue}/boards/bd_1/labels/bl_patch`,
      {
        method: "PATCH",
        headers: { "x-test-user": "user-a", "content-type": "application/json" },
        body: JSON.stringify({ name: "Gagal", expectedVersion: 999 }),
      },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error?.code).toBe("VERSION_CONFLICT");
  });
});

describe("POST .../boards/:board_id/labels/:label_id/{archive,restore,delete} — goal 3.6.3", () => {
  function post(action: string, labelId: string, body: unknown, user = "user-a"): Promise<Response> {
    return makeApp().request(
      `http://localhost/v1/projects/${projectIdValue}/boards/bd_1/labels/${labelId}/${action}`,
      {
        method: "POST",
        headers: { "x-test-user": user, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  }

  it("[A.3] archive ACTIVE → archivedAt terisi; archive ulang → INVALID_STATE", async () => {
    const res = await post("archive", "bl_arc", { expectedVersion: 1 });
    expect(res.status).toBe(200);
    expect((await res.json()).data.label.archivedAt).toEqual(expect.any(String));

    const again = await post("archive", "bl_arc", { expectedVersion: 2 });
    expect(again.status).toBe(409);
    expect((await again.json()).error?.code).toBe("INVALID_STATE");
  });

  it("[INV-LIFE-002][transitive] restore ARCHIVED saat chain ACTIVE → sukses; Milestone di-archive (bukan Board langsung) → restore tetap ditolak", async () => {
    const okRes = await post("restore", "bl_res", { expectedVersion: 1 });
    expect(okRes.status).toBe(200);
    expect((await okRes.json()).data.label.archivedAt).toBeNull();

    await post("archive", "bl_res", { expectedVersion: 2 });
    const projectDb = createClient({ url: ctx.projectDbPathValue });
    try {
      await projectDb.execute("UPDATE milestones SET archived_at = ? WHERE id = 'ms_1'", [T0]);
    } finally {
      await projectDb.close();
    }
    const blocked = await post("restore", "bl_res", { expectedVersion: 3 });
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error?.code).toBe("INVALID_STATE");

    const projectDb2 = createClient({ url: ctx.projectDbPathValue });
    try {
      await projectDb2.execute("UPDATE milestones SET archived_at = NULL WHERE id = 'ms_1'");
    } finally {
      await projectDb2.close();
    }
  });

  it("[AC-020][Authz] version mismatch → VERSION_CONFLICT; non-Owner → PERMISSION_DENIED; tidak ada → RESOURCE_NOT_FOUND", async () => {
    const res = await post("delete", "bl_arc", { expectedVersion: 9999 });
    expect(res.status).toBe(409);
    expect((await res.json()).error?.code).toBe("VERSION_CONFLICT");

    const denied = await post("archive", "bl_arc", { expectedVersion: 2 }, "user-b");
    expect(denied.status).toBe(403);

    const missing = await post("archive", "bl_none", { expectedVersion: 1 });
    expect(missing.status).toBe(404);
    expect((await missing.json()).error?.code).toBe("RESOURCE_NOT_FOUND");
  });
});
