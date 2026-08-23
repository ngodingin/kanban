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

const NOW = "2026-08-01T00:00:00.000Z";

let ctx: { globalClient: Client; deps: CardRoutesDeps };
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

interface SeedCard {
  id: string;
  creatorUserId: string;
  assigneeUserId: string | null;
}

const cards: SeedCard[] = [
  { id: "cd_own", creatorUserId: "user-vis", assigneeUserId: null },
  { id: "cd_other_plain", creatorUserId: "user-owner", assigneeUserId: null },
  { id: "cd_assigned", creatorUserId: "user-owner", assigneeUserId: "user-vis" },
];

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "kanban-card-visibility-"));
  const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  for (const user of ["user-owner", "user-vis"]) {
    await globalClient.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
      args: [user, `${user}@t.local`, user, NOW, NOW],
    });
  }
  projectIdValue = `a-${newProjectId()}`;
  projectDbPathValue = `file:${join(dir, `${projectIdValue}.db`)}`;
  const projectClient = createClient({ url: projectDbPathValue });
  await applyProjectMigrations(projectClient);
  await projectClient.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, 'P', ?, ?, 1)",
    args: [projectIdValue, NOW, NOW],
  });
  await projectClient.execute({
    sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_v', 'M', NULL, 0, ?, ?, 1)",
    args: [NOW, NOW],
  });
  await projectClient.execute({
    sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('bd_v', 'ms_v', 'B', NULL, ?, ?, 1)",
    args: [NOW, NOW],
  });
  await projectClient.execute({
    sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('ls_v', 'bd_v', 'L', ?, ?, 1)",
    args: [NOW, NOW],
  });
  for (const card of cards) {
    await projectClient.execute({
      sql: "INSERT INTO cards (id, list_id, title, description, creator_user_id, assignee_user_id, created_at, updated_at, version) VALUES (?, 'ls_v', ?, NULL, ?, ?, ?, ?, 1)",
      args: [card.id, `T ${card.id}`, card.creatorUserId, card.assigneeUserId, NOW, NOW],
    });
  }
  await projectClient.close();

  await registerProjectWithOwnerMembership(globalClient, {
    projectId: projectIdValue,
    databaseId: projectDbPathValue,
    ownerUserId: "user-owner",
    now: NOW,
  });
  // Membership pembaca visibility + direct grant card.read @project dgn visibility dinamis.
  await globalClient.execute({
    sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES ('m-vis', ?, 'user-vis', ?, NULL)",
    args: [projectIdValue, NOW],
  });
  await globalClient.execute("INSERT OR IGNORE INTO permissions (id, key) VALUES ('p_cr', 'card.read')");
  await globalClient.execute({
    sql: "SELECT id FROM permissions WHERE key = 'card.read'",
  });

  ctx = {
    globalClient,
    deps: makeDeps(),
  };

  function makeDeps(): CardRoutesDeps {
    return {
      resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
      assertAssigneeActiveMember: async () => undefined,
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
    } as unknown as CardRoutesDeps;
  }

  async function setVisibility(visibility: string): Promise<void> {
    await globalClient.execute("DELETE FROM membership_permission_assignments WHERE id = 'da_vis'");
    if (visibility === "") return; // tanpa grant sama sekali
    const row = await globalClient.execute({ sql: "SELECT id FROM permissions WHERE key = 'card.read'" });
    const pid = String(row.rows[0]!.id);
    await globalClient.execute({
      sql: "INSERT INTO membership_permission_assignments (id, membership_id, permission_id, scope_type, scope_id, card_read_visibility, created_at, revoked_at) VALUES ('da_vis', 'm-vis', ?, 'project', ?, ?, ?, NULL)",
      args: [pid, projectIdValue, visibility, NOW],
    });
  }
  void setVisibility;
});

afterAll(async () => {
  await ctx.globalClient.close();
});

const app = (): Hono => new Hono().route("/", createCardsRouter(() => ctx.deps));

const listCards = (user: string): Promise<Response> =>
  app().request(`http://localhost/v1/projects/${projectIdValue}/lists/ls_v/cards`, {
    headers: { "x-test-user": user },
  });

const getCard = (cid: string, user: string): Promise<Response> =>
  app().request(`http://localhost/v1/projects/${projectIdValue}/cards/${cid}`, {
    headers: { "x-test-user": user },
  });

const setVisibilityGlobal = async (visibility: string): Promise<void> => {
  await ctx.globalClient.execute("DELETE FROM membership_permission_assignments WHERE id = 'da_vis'");
  if (visibility === "") return;
  const row = await ctx.globalClient.execute({ sql: "SELECT id FROM permissions WHERE key = 'card.read'" });
  const pid = String(row.rows[0]!.id);
  await ctx.globalClient.execute({
    sql: "INSERT INTO membership_permission_assignments (id, membership_id, permission_id, scope_type, scope_id, card_read_visibility, created_at, revoked_at) VALUES ('da_vis', 'm-vis', ?, 'project', ?, ?, ?, NULL)",
    args: [pid, projectIdValue, visibility, NOW],
  });
};

describe("Card visibility scope — GET endpoints (goal 4.5.1)", () => {
  it("[BR-047][D.3 default] tanpa grant visibility eksplisit → CREATED_BY_ME: hanya cd_own di list; cd lain → 404 (bukan 403)", async () => {
    await setVisibilityGlobal("CREATED_BY_ME");
    const listRes = await listCards("user-vis");
    expect(listRes.status).toBe(200);
    const ids = (await listRes.json()).data.cards.map((c: { id: string }) => c.id);
    expect(ids).toEqual(["cd_own"]);

    const hidden = await getCard("cd_other_plain", "user-vis");
    expect(hidden.status).toBe(404);
    expect((await hidden.json()).error?.code).toBe("RESOURCE_NOT_FOUND");

    const own = await getCard("cd_own", "user-vis");
    expect(own.status).toBe(200);
  });

  it("[BR-047 union OR] ASSIGNED_TO_ME → cd_own ATAU cd_assigned terlihat; Owner → ALL tetap lihat semua", async () => {
    await setVisibilityGlobal("ASSIGNED_TO_ME");
    const ids = (await (await listCards("user-vis")).json()).data.cards.map((c: { id: string }) => c.id);
    expect(ids.sort()).toEqual(["cd_assigned", "cd_own"].sort());

    const ownerIds = (await (await listCards("user-owner")).json()).data.cards.map((c: { id: string }) => c.id);
    expect(ownerIds).toHaveLength(3);

    const assignedSingle = await getCard("cd_assigned", "user-vis");
    expect(assignedSingle.status).toBe(200);
  });

  it("[BR-048] ALL → seluruh Card tanpa filter", async () => {
    await setVisibilityGlobal("ALL");
    const ids = (await (await listCards("user-vis")).json()).data.cards.map((c: { id: string }) => c.id);
    expect(ids).toHaveLength(3);
  });

  it("[BR-049] ganti assignee → visibility ASSIGNED_TO_ME langsung applicable dari state TERKINI", async () => {
    await setVisibilityGlobal("ASSIGNED_TO_ME");
    const db = createClient({ url: projectDbPathValue });
    try {
      await db.execute("UPDATE cards SET assignee_user_id = 'user-vis' WHERE id = 'cd_other_plain'");
    } finally {
      await db.close();
    }
    const nowVisible = await getCard("cd_other_plain", "user-vis");
    expect(nowVisible.status).toBe(200);

    const db2 = createClient({ url: projectDbPathValue });
    try {
      await db2.execute("UPDATE cards SET assignee_user_id = NULL WHERE id = 'cd_other_plain'");
    } finally {
      await db2.close();
    }
    const hiddenAgain = await getCard("cd_other_plain", "user-vis");
    expect(hiddenAgain.status).toBe(404);
  });
});
