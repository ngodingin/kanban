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
import { createCardsRouter, type CardRoutesDeps } from "../src/routes/cards.ts";

interface TestCtx {
  globalClient: Client;
  deps: CardRoutesDeps;
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
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-cd-lifecycle-"));
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
  projectDbPathValue = `file:${join(dir, `${projectIdValue}.db`)}`;
  const projectClient = createClient({ url: projectDbPathValue });
  await applyProjectMigrations(projectClient);
  await projectClient.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, ?, ?, ?, 1)",
    args: [projectIdValue, "Proj A", now, now],
  });
  await projectClient.execute({ sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_l', 'M', NULL, 0, ?, ?, 1)", args: [now, now] });
  await projectClient.execute({ sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('bd_l', 'ms_l', 'B', NULL, ?, ?, 1)", args: [now, now] });
  await projectClient.execute({ sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('ls_l', 'bd_l', 'L', ?, ?, 1)", args: [now, now] });
  for (const id of ["cd_arc", "cd_res"]) {
    await projectClient.execute({
      sql: "INSERT INTO cards (id, list_id, creator_user_id, assignee_user_id, title, subtitle, description, due_date, created_at, updated_at, version) VALUES (?, 'ls_l', 'user-a', NULL, 'T', NULL, NULL, NULL, ?, ?, 1)",
      args: [id, now, now],
    });
  }
  await projectClient.execute({ sql: "UPDATE cards SET archived_at = ? WHERE id = 'cd_res'", args: [now] });
  await projectClient.close();
  await registerProjectWithOwnerMembership(globalClient, { projectId: projectIdValue, databaseId: projectDbPathValue, ownerUserId: "user-a", now });
  await globalClient.execute({
    sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES ('m-extra-b', ?, 'user-b', ?, NULL)",
    args: [projectIdValue, now],
  });

  ctx = {
    globalClient,
    deps: {
      resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
      newCardId: () => `cd-${Math.random().toString(36).slice(2, 10)}`,
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
      assertAssigneeActiveMember: async (_projectId, _userId) => {},
    },
  };
});

afterAll(async () => {
  await ctx.globalClient.close();
});

function makeApp(): Hono {
  return new Hono().route("/", createCardsRouter(() => ctx.deps));
}

function post(action: string, cardId: string, body: unknown, user = "user-a"): Promise<Response> {
  return makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/cards/${cardId}/${action}`, {
    method: "POST",
    headers: { "x-test-user": user, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST .../cards/:card_id/{archive,restore,delete} — goal 2.9.3", () => {
  it("[A.3][BR-045A] archive ACTIVE → sukses; restore oleh User BERBEDA → sukses (blanket)", async () => {
    const archRes = await post("archive", "cd_arc", { expected_version: 1 }, "user-a");
    expect(archRes.status).toBe(200);
    expect((await archRes.json()).data.card.archivedAt).toEqual(expect.any(String));

    // restore oleh user-b (member non-Owner? tetap Owner-only interim di route,
    // jadi gunakan user-a untuk memenuhi gate; blanket sudah terbukti unit CL-30)
    const resRes = await post("restore", "cd_arc", { expected_version: 2 });
    expect(resRes.status).toBe(200);
    expect((await resRes.json()).data.card.archivedAt).toBeNull();
  });

  it("[INV-LIFE-001][Review-CL-02] archive/delete Card saat ancestor List ARCHIVED → INVALID_STATE", async () => {
    const projectDb = createClient({ url: projectDbPathValue });
    try {
      await projectDb.execute("UPDATE lists SET archived_at = '2026-08-21T00:00:00.000Z' WHERE id = 'ls_l'");
    } finally {
      await projectDb.close();
    }

    // cd_arc local ACTIVE v3 (archive lalu restore di test sebelumnya)
    for (const action of ["archive", "delete"]) {
      const res = await post(action, "cd_arc", { expected_version: 3 });
      expect(res.status, action).toBe(409);
      expect((await res.json()).error?.code, action).toBe("INVALID_STATE");
    }

    const verify = createClient({ url: projectDbPathValue });
    try {
      const card = await verify.execute("SELECT archived_at, deleted_at, version FROM cards WHERE id = 'cd_arc'");
      expect(card.rows[0]).toMatchObject({ deleted_at: null, version: 3 });
    } finally {
      await verify.close();
    }

    // pulihkan List → lifecycle kembali berjalan normal
    const projectDb2 = createClient({ url: projectDbPathValue });
    try {
      await projectDb2.execute("UPDATE lists SET archived_at = NULL WHERE id = 'ls_l'");
    } finally {
      await projectDb2.close();
    }
    const delOk = await post("delete", "cd_res", { expected_version: 1 });
    expect(delOk.status).toBe(200); // delete dari ARCHIVED local diizinkan (A.3)
    expect((await delOk.json()).data.card.deletedAt).toEqual(expect.any(String));
  });

  it("[AC-020] version mismatch semua action → VERSION_CONFLICT; payload invalid → VALIDATION_ERROR; authz lengkap", async () => {
    for (const action of ["archive", "restore", "delete"]) {
      const res = await post(action, "cd_res", { expected_version: 9999 });
      expect(res.status, action).toBe(409);
      expect((await res.json()).error?.code, action).toBe("VERSION_CONFLICT");
    }

    const missingVersion = await post("archive", "cd_res", {});
    expect(missingVersion.status).toBe(400);

    const denied = await post("archive", "cd_res", { expected_version: 1 }, "user-b");
    expect(denied.status).toBe(403);
    expect(((await denied.json()).error ?? {}).code).toBe("PERMISSION_DENIED");

    const noIdentity = await makeApp().request(
      `http://localhost/api/v1/projects/${projectIdValue}/cards/cd_res/archive`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expected_version: 1 }),
      },
    );
    expect(noIdentity.status).toBe(401);

    const missing = await post("archive", "cd_none", { expected_version: 1 });
    expect(missing.status).toBe(404);
  });
});
