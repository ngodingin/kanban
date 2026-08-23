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

// Goal 2.9.4 (02-SPEC C.8, amandemen 2.11.0) — GET list Card per List,
// seluruh status termasuk ARCHIVED/DELETED, field labels sama seperti GET
// tunggal, TANPA filter visibility (Phase 4).

const T0 = "2026-08-01T00:00:00.000Z";

interface TestCtx {
  globalClient: Client;
  deps: CardRoutesDeps;
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
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-cardlist-"));
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
    sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('l_other', 'bd_1', 'Other', ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO cards (id, list_id, creator_user_id, title, created_at, updated_at, version) VALUES ('c_1', 'l_1', 'user-a', 'C1', ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO cards (id, list_id, creator_user_id, title, created_at, updated_at, archived_at, version) VALUES ('c_2', 'l_1', 'user-a', 'C2', ?, ?, ?, 1)",
    args: [now, now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO cards (id, list_id, creator_user_id, title, created_at, updated_at, version) VALUES ('c_other', 'l_other', 'user-a', 'Other', ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO board_labels (id, board_id, name, created_at, updated_at, version) VALUES ('bl_1', 'bd_1', 'Bug', ?, ?, 1)",
    args: [now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO card_board_labels (card_id, label_id, created_at, removed_at) VALUES ('c_1', 'bl_1', ?, NULL)",
    args: [now],
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

describe("GET /api/v1/projects/:project_id/lists/:list_id/cards — goal 2.9.4", () => {
  it("[C.8] mengembalikan seluruh Card List tsb (termasuk ARCHIVED) dengan field labels; Card List LAIN tidak muncul", async () => {
    const res = await makeApp().request(`http://localhost/v1/projects/${projectIdValue}/lists/l_1/cards`, {
      headers: { "x-test-user": "user-a" },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    const cards = json.data.cards as Array<{ id: string; labels: unknown[] }>;
    expect(cards.map((c) => c.id).sort()).toEqual(["c_1", "c_2"]);
    const c1 = cards.find((c) => c.id === "c_1")!;
    expect(c1.labels).toEqual([{ id: "bl_1", name: "Bug", scope: "board" }]);
    const c2 = cards.find((c) => c.id === "c_2")!;
    expect(c2.labels).toEqual([]);
  });

  it("[Boundary/Authz] tanpa membership → PROJECT_ACCESS_DENIED; tanpa identitas → 401", async () => {
    const denied = await makeApp().request(`http://localhost/v1/projects/${projectIdValue}/lists/l_1/cards`, {
      headers: { "x-test-user": "user-stranger" },
    });
    expect(denied.status).toBe(403);

    const noIdentity = await makeApp().request(`http://localhost/v1/projects/${projectIdValue}/lists/l_1/cards`);
    expect(noIdentity.status).toBe(401);
  });
});
