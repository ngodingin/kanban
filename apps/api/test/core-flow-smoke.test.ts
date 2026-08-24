import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { buildProjectAdminDeps } from "../src/project-deps.ts";
import { createProjectAdminRouter } from "../src/routes/project-admin.ts";
import { createMilestonesRouter, type MilestoneRoutesDeps } from "../src/routes/milestones.ts";
import { createBoardsRouter, type BoardRoutesDeps } from "../src/routes/boards.ts";
import { createListsRouter, type ListRoutesDeps } from "../src/routes/lists.ts";
import { createCardsRouter, type CardRoutesDeps } from "../src/routes/cards.ts";
import { createCommentsRouter, type CommentRoutesDeps } from "../src/routes/comments.ts";
import { createActivitiesRouter, type ActivityRoutesDeps } from "../src/routes/activities.ts";

const BASE = "2026-01-01T00:00:00.000Z";

let dir: string;
let globalClient: Client;
let msDeps: MilestoneRoutesDeps;
let bdDeps: BoardRoutesDeps;
let lsDeps: ListRoutesDeps;
let cdDeps: CardRoutesDeps;
let cmDeps: CommentRoutesDeps;
let actDeps: ActivityRoutesDeps;
let pid: string;

const identityFor = (u: string | null): Promise<ResolvedIdentity | null> =>
  u ? Promise.resolve({ type: "session", userId: u, email: `${u}@test.local`, name: u, emailVerified: true, image: null }) : null;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "core-flow-"));
  globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  for (const [u, email] of [["u1", "u1@test.local"], ["u2", "u2@test.local"]] as const) {
    await globalClient.execute({
      sql: "INSERT INTO users (id,email,email_verified,name,created_at,updated_at) VALUES (?, ?,1,?,?,?)",
      args: [u, email, u, BASE, BASE],
    });
  }

  // Langkah 1 dari rantai wajib F.6 poin 2: create Project + provisioning.
  pid = newProjectId();
  const dbPath = `file:${join(dir, `${pid}.db`)}`;
  const pdb = createClient({ url: dbPath });
  await applyProjectMigrations(pdb);
  await pdb.execute({
    sql: "INSERT INTO project_state (project_id,name,created_at,updated_at,version) VALUES (?, 'P', ?, ?, 1)",
    args: [pid, BASE, BASE],
  });
  await pdb.close();
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: pid, databaseId: dbPath, ownerUserId: "u1", now: BASE,
  });

  const makeOpenCtx = async (request: Request, projectId: string) => {
    const pipeline = new RequestPipeline({
      identityResolver: { resolveIdentity: (req: Request) => identityFor(req.headers.get("x-test-user")) },
      globalClient,
      databaseResolver: new SqliteProjectDatabaseResolver(globalClient),
      projectClientFactory: { create: (databaseId: string) => createClient({ url: databaseId }) },
    });
    const resolved = await pipeline.run(request, projectId);
    return {
      userId: resolved.identity.userId,
      ownerUserId: resolved.project.ownerUserId,
      database: resolved.database,
      permission: resolved.permission,
      effectiveFor: createEntityPermissionResolver({
        globalClient, membershipId: resolved.membership.id, projectId,
        isOwner: resolved.project.ownerUserId === resolved.identity.userId,
      }),
    };
  };

  const baseDeps = () => ({
    resolveIdentity: (request: Request) => identityFor(request.headers.get("x-test-user")),
    openProjectContext: makeOpenCtx,
  });

  msDeps = { ...baseDeps(), newMilestoneId: newProjectId } as unknown as MilestoneRoutesDeps;
  bdDeps = { ...baseDeps(), newBoardId: newProjectId } as unknown as BoardRoutesDeps;
  lsDeps = { ...baseDeps(), newListId: newProjectId } as unknown as ListRoutesDeps;
  cdDeps = {
    ...baseDeps(),
    newCardId: newProjectId,
    assertAssigneeActiveMember: async () => undefined,
  } as unknown as CardRoutesDeps;
  cmDeps = baseDeps() as unknown as CommentRoutesDeps;
  actDeps = baseDeps() as unknown as ActivityRoutesDeps;
});

afterAll(async () => {
  await globalClient.close();
  rmSync(dir, { recursive: true, force: true });
});

// Router instances
let msApp: Hono;
let bdApp: Hono;
let lsApp: Hono;
let cdApp: Hono;
let cmApp: Hono;
let actApp: Hono;
let admApp: Hono;

beforeAll(async () => {
  const adminDeps = buildProjectAdminDeps({
    identityResolver: { resolveIdentity: (req: Request) => identityFor(req.headers.get("x-test-user")) },
    globalClient,
  });
  admApp = new Hono().route("/", createProjectAdminRouter(() => adminDeps));
  msApp = new Hono().route("/", createMilestonesRouter(() => msDeps));
  bdApp = new Hono().route("/", createBoardsRouter(() => bdDeps));
  lsApp = new Hono().route("/", createListsRouter(() => lsDeps));
  cdApp = new Hono().route("/", createCardsRouter(() => cdDeps));
  cmApp = new Hono().route("/", createCommentsRouter(() => cmDeps));
  actApp = new Hono().route("/", createActivitiesRouter(() => actDeps));
});

describe("F.6 poin 2 — Smoke alur inti end-to-end API-level 9 langkah (goal 6.9.2)", () => {
  let msId = "";
  let bdId = "";
  let lsId = "";
  let lsDstId = "";
  let cdId = "";
  let commentActivityId = "";

  it("[langkah 2-3] scoped invite → accept: u2 menjadi member dengan Group ter-scope", async () => {
    const group = await adminDepsCreateGroup("G-smoke-commenter", ["card.comment", "card.read"]);
    const invRes = await admApp.request(`/v1/projects/${pid}/invitations`, {
      method: "POST",
      headers: { "x-test-user": "u1", "content-type": "application/json" },
      body: JSON.stringify({
        email: "u2@test.local",
        assignments: [{ groupId: group.id, scopeType: "project", scopeId: pid }],
      }),
    });
    expect(invRes.status).toBe(201);
    const invitationId = (await invRes.json()).data.invitation.id;

    const accRes = await admApp.request(`/v1/invitations/${invitationId}/accept`, {
      method: "POST",
      headers: { "x-test-user": "u2" },
    });
    expect(accRes.status).toBe(200);
    expect(((await accRes.json()) as { data: { invitation: { acceptedAt: string | null } } }).data.invitation.acceptedAt).not.toBeNull();
    const member = await globalClient.execute({
      sql: "SELECT id FROM project_memberships WHERE project_id = ? AND user_id = 'u2' AND revoked_at IS NULL",
      args: [pid],
    });
    expect(member.rows).toHaveLength(1);
  });

  it("create milestone → 201", async () => {
    const r = await msApp.request(`/v1/projects/${pid}/milestones`, {
      method: "POST",
      headers: { "x-test-user": "u1", "content-type": "application/json" },
      body: JSON.stringify({ title: "MS" }),
    });
    expect(r.status).toBe(201);
    msId = (await r.json()).data.milestone.id;
  });

  it("create board → 201", async () => {
    const r = await bdApp.request(`/v1/projects/${pid}/milestones/${msId}/boards`, {
      method: "POST",
      headers: { "x-test-user": "u1", "content-type": "application/json" },
      body: JSON.stringify({ title: "BD" }),
    });
    expect(r.status).toBe(201);
    bdId = (await r.json()).data.board.id;
  });

  it("create list sumber + list tujuan move → 201", async () => {
    const r1 = await lsApp.request(`/v1/projects/${pid}/boards/${bdId}/lists`, {
      method: "POST",
      headers: { "x-test-user": "u1", "content-type": "application/json" },
      body: JSON.stringify({ title: "LS" }),
    });
    expect(r1.status).toBe(201);
    lsId = (await r1.json()).data.list.id;
    const r2 = await lsApp.request(`/v1/projects/${pid}/boards/${bdId}/lists`, {
      method: "POST",
      headers: { "x-test-user": "u1", "content-type": "application/json" },
      body: JSON.stringify({ title: "LS-DST" }),
    });
    expect(r2.status).toBe(201);
    lsDstId = (await r2.json()).data.list.id;
  });

  it("create card → 201", async () => {
    const r = await cdApp.request(`/v1/projects/${pid}/lists/${lsId}/cards`, {
      method: "POST",
      headers: { "x-test-user": "u1", "content-type": "application/json" },
      body: JSON.stringify({ title: "CD" }),
    });
    expect(r.status).toBe(201);
    cdId = (await r.json()).data.card.id;
  });

  it("[langkah comment] u2 (member hasil invite) create comment → 201 + terbaca via activities per-entity", async () => {
    const c = await cmApp.request(`/v1/projects/${pid}/cards/${cdId}/comments`, {
      method: "POST",
      headers: { "x-test-user": "u2", "content-type": "application/json" },
      body: JSON.stringify({ body: "komentar dari member invite" }),
    });
    expect(c.status).toBe(201);
    commentActivityId = (await c.json()).data.comment.commentActivityId;
    expect(commentActivityId).not.toBe("");

    const acts = await actApp.request(`/v1/projects/${pid}/cards/${cdId}/activities`, {
      headers: { "x-test-user": "u2" },
    });
    expect(acts.status).toBe(200);
    const actions = ((await acts.json()) as { data: { activities: Array<{ action: string }> } }).data.activities.map(
      (a) => a.action,
    );
    expect(actions).toContain("comment.added");
  });

  it("[langkah move] move card ke list kedua dalam Board sama → 200 + listId berubah", async () => {
    const r = await cdApp.request(`/v1/projects/${pid}/cards/${cdId}/move`, {
      method: "POST",
      headers: { "x-test-user": "u1", "content-type": "application/json" },
      body: JSON.stringify({ destinationListId: lsDstId, expectedVersion: 1 }),
    });
    if (r.status !== 200) throw new Error(`MOVE ${r.status}: ${await r.text()}`);
    const get = await cdApp.request(`/v1/projects/${pid}/cards/${cdId}`, { headers: { "x-test-user": "u1" } });
    expect(((await get.json()) as { data: { card: { listId: string; version: number } } }).data.card.listId).toBe(lsDstId);
  });

  it("archive card → 200", async () => {
    const r = await cdApp.request(`/v1/projects/${pid}/cards/${cdId}/archive`, {
      method: "POST",
      headers: { "x-test-user": "u1", "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 2 }),
    });
    expect(r.status).toBe(200);
  });

  it("restore card → 200", async () => {
    const r = await cdApp.request(`/v1/projects/${pid}/cards/${cdId}/restore`, {
      method: "POST",
      headers: { "x-test-user": "u1", "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 3 }),
    });
    expect(r.status).toBe(200);
  });

  it("delete card terminal → 200 + GET tetap 200 (Deleted/Audit view — perilaku by-design sesuai 02-SPEC:79 & :448, BUKAN gap)", async () => {
    const r = await cdApp.request(`/v1/projects/${pid}/cards/${cdId}/delete`, {
      method: "POST",
      headers: { "x-test-user": "u1", "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 4 }),
    });
    if (r.status !== 200) {
      const bodyText = await r.clone().text();
      throw new Error(`DELETE ${r.status}: ${bodyText}`);
    }
    expect(r.status).toBe(200);
    // Card DELETED MAY dibaca melalui view audit/historis (02-SPEC A.3 baris 79,
    // FR list baris 448: GET mengembalikan seluruh Card termasuk ARCHIVED/DELETED).
    const check = await cdApp.request(`/v1/projects/${pid}/cards/${cdId}`, {
      headers: { "x-test-user": "u1" },
    });
    expect(check.status).toBe(200);

    // Konsistensi akhir rantai: comment historis TETAP terbaca setelah Card DELETED
    const acts = await actApp.request(`/v1/projects/${pid}/cards/${cdId}/activities`, {
      headers: { "x-test-user": "u1" },
    });
    const rows = ((await acts.json()) as { data: { activities: Array<{ id: string; action: string }> } }).data.activities;
    expect(rows.some((a) => a.id === commentActivityId && a.action === "comment.added")).toBe(true);
  });

  /** Resolve permission KEY menjadi id row tabel `permissions`, lalu buat Group via endpoint asli. */
  async function adminDepsCreateGroup(name: string, keys: string[]): Promise<{ id: string }> {
    const placeholders = keys.map(() => "?").join(",");
    const permRows = await globalClient.execute({
      sql: `SELECT id, key FROM permissions WHERE key IN (${placeholders})`,
      args: keys,
    });
    const idByKey = new Map(permRows.rows.map((r) => [String(r.key), String(r.id)]));
    const permissions = keys.map((k) => {
      const permissionId = idByKey.get(k);
      if (permissionId === undefined) throw new Error(`permission key tidak ditemukan di katalog: ${k}`);
      return { permissionId };
    });
    const res = await admApp.request(`/v1/projects/${pid}/permission-groups`, {
      method: "POST",
      headers: { "x-test-user": "u1", "content-type": "application/json" },
      body: JSON.stringify({ name, permissions }),
    });
    if (res.status !== 201) throw new Error(`create group ${res.status}: ${await res.text()}`);
    return ((await res.json()) as { data: { group: { id: string } } }).data.group;
  }
});
