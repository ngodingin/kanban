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

// Goal 3.9.1 (02-SPEC C.8 amandemen 2.8.1) — GET /cards/:card_id selalu
// menyertakan field labels (array, boleh kosong). Test file terpisah dari
// cards-create-get.test.ts (goal 2.9.1 Phase 2 ✅) agar regresi tidak
// tersentuh.

const T0 = "2026-08-01T00:00:00.000Z";

interface TestCtx {
  globalClient: Client;
  deps: CardRoutesDeps;
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
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-cardlabels-embed-"));
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
    sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('bd_1', 'ms_1', 'B1', NULL, ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('l_1', 'bd_1', 'L1', ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO cards (id, list_id, creator_user_id, title, created_at, updated_at, version) VALUES ('c_bare', 'l_1', 'user-a', 'Bare', ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO cards (id, list_id, creator_user_id, title, created_at, updated_at, version) VALUES ('c_mixed', 'l_1', 'user-a', 'Mixed', ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO milestone_labels (id, milestone_id, name, created_at, updated_at, version) VALUES ('ml_1', 'ms_1', 'Feature', ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO board_labels (id, board_id, name, created_at, updated_at, version) VALUES ('bl_1', 'bd_1', 'Bug', ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO board_labels (id, board_id, name, created_at, updated_at, version) VALUES ('bl_removed', 'bd_1', 'Removed', ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO card_milestone_labels (card_id, label_id, created_at, removed_at) VALUES ('c_mixed', 'ml_1', ?, NULL)",
    args: [now],
  });
  await projectClient.execute({
    sql: "INSERT INTO card_board_labels (card_id, label_id, created_at, removed_at) VALUES ('c_mixed', 'bl_1', ?, NULL)",
    args: [now],
  });
  // Label yang sudah di-remove — TIDAK boleh muncul.
  await projectClient.execute({
    sql: "INSERT INTO card_board_labels (card_id, label_id, created_at, removed_at) VALUES ('c_mixed', 'bl_removed', ?, ?)",
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
    projectDbPathValue,
    deps: {
      resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
      newCardId: () => `c-${Math.random().toString(36).slice(2, 10)}`,
      assertAssigneeActiveMember: async () => {},
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
  return new Hono().route("/", createCardsRouter(() => ctx.deps));
}

describe("GET /api/v1/projects/:project_id/cards/:card_id — field labels (goal 3.9.1)", () => {
  it("[DoD] Card tanpa Label apa pun → labels: [] (bukan null/undefined)", async () => {
    const res = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/cards/c_bare`, {
      headers: { "x-test-user": "user-a" },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.card.labels).toEqual([]);
  });

  it("[C.8] Card dengan campuran Milestone Label + Board Label → keduanya muncul dengan scope benar; Label yang sudah di-remove TIDAK muncul", async () => {
    const res = await makeApp().request(`http://localhost/api/v1/projects/${projectIdValue}/cards/c_mixed`, {
      headers: { "x-test-user": "user-a" },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    const labels = json.data.card.labels as Array<{ id: string; name: string; scope: string }>;
    expect(labels).toHaveLength(2);
    expect(labels).toContainEqual({ id: "ml_1", name: "Feature", scope: "milestone" });
    expect(labels).toContainEqual({ id: "bl_1", name: "Bug", scope: "board" });
    expect(labels.find((l) => l.id === "bl_removed")).toBeUndefined();
  });
});
