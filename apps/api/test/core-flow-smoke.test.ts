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
import { createMilestonesRouter, type MilestoneRoutesDeps } from "../src/routes/milestones.ts";
import { createBoardsRouter, type BoardRoutesDeps } from "../src/routes/boards.ts";
import { createListsRouter, type ListRoutesDeps } from "../src/routes/lists.ts";
import { createCardsRouter, type CardRoutesDeps } from "../src/routes/cards.ts";

const BASE = "2026-01-01T00:00:00.000Z";

let dir: string;
let globalClient: Client;
let msDeps: MilestoneRoutesDeps;
let bdDeps: BoardRoutesDeps;
let lsDeps: ListRoutesDeps;
let cdDeps: CardRoutesDeps;
let pid: string;

const identityFor = (u: string | null): Promise<ResolvedIdentity | null> =>
  u ? Promise.resolve({ type: "session", userId: u, email: `${u}@t`, name: u, emailVerified: true, image: null }) : null;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "core-flow-"));
  globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  const mod = await import("@kanban/infrastructure");
  await mod.applyGlobalMigrations(globalClient);
  await globalClient.execute({
    sql: "INSERT INTO users (id,email,email_verified,name,created_at,updated_at) VALUES ('u1','o@t',1,'o',?,?)",
    args: [BASE, BASE],
  });

  pid = newProjectId();
  const dbPath = `file:${join(dir, `${pid}.db`)}`;
  const pdb = createClient({ url: dbPath });
  await mod.applyProjectMigrations(pdb);
  await pdb.execute({
    sql: "INSERT INTO project_state (project_id,name,created_at,updated_at,version) VALUES (?, 'P', ?, ?, 1)",
    args: [pid, BASE, BASE],
  });
  await pdb.close();
  await mod.registerProjectWithOwnerMembership(globalClient, {
    projectId: pid, databaseId: dbPath, ownerUserId: "u1", now: BASE,
  });

  // Gunakan pola persis dari ac006-card-read.test.ts yang SUDAH TERBUKTI bekerja
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

beforeAll(async () => {
  msApp = new Hono().route("/", createMilestonesRouter(() => msDeps));
  bdApp = new Hono().route("/", createBoardsRouter(() => bdDeps));
  lsApp = new Hono().route("/", createListsRouter(() => lsDeps));
  cdApp = new Hono().route("/", createCardsRouter(() => cdDeps));
});

describe("F.6 poin 2 — Smoke alur inti end-to-end API-level (goal 6.9.2)", () => {
  let msId = "";
  let bdId = "";
  let lsId = "";
  let cdId = "";

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

  it("create list → 201", async () => {
    const r = await lsApp.request(`/v1/projects/${pid}/boards/${bdId}/lists`, {
      method: "POST",
      headers: { "x-test-user": "u1", "content-type": "application/json" },
      body: JSON.stringify({ title: "LS" }),
    });
    expect(r.status).toBe(201);
    lsId = (await r.json()).data.list.id;
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

  it("archive card → 200", async () => {
    const r = await cdApp.request(`/v1/projects/${pid}/cards/${cdId}/archive`, {
      method: "POST",
      headers: { "x-test-user": "u1", "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 1 }),
    });
    expect(r.status).toBe(200);
  });

  it("restore card → 200", async () => {
    const r = await cdApp.request(`/v1/projects/${pid}/cards/${cdId}/restore`, {
      method: "POST",
      headers: { "x-test-user": "u1", "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 2 }),
    });
    expect(r.status).toBe(200);
  });

  it("delete card terminal → 200 + GET 404", async () => {
    const r = await cdApp.request(`/v1/projects/${pid}/cards/${cdId}/delete`, {
      method: "POST",
      headers: { "x-test-user": "u1", "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 3 }),
    });
    expect(r.status).toBe(200);
    const check = await cdApp.request(`/v1/projects/${pid}/cards/${cdId}`, {
      headers: { "x-test-user": "u1" },
    });
    expect(check.status).toBe(404);
  });
});
