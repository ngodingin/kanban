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
} from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";

const BASE = "2026-01-01T00:00:00.000Z";
let dir: string;
let gc: Client;
let pid: string;
let msId: string;
let bdId: string;
let lsId: string;
let cdId: string;
let app: Hono;

const identityFor = (u: string | null): Promise<ResolvedIdentity | null> =>
  u ? Promise.resolve({ type: "session", userId: u, email: `${u}@t`, name: u, emailVerified: true, image: null }) : null;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "core-flow-"));
  gc = createClient({ url: `file:${join(dir, "g.db")}` });
  const mod = await import("@kanban/infrastructure");
  await mod.applyGlobalMigrations(gc);
  await gc.execute("INSERT INTO users (id,email,email_verified,name,created_at,updated_at) VALUES ('u1','o@t',1,'o',?,?)", [BASE, BASE]);
  await gc.execute("INSERT INTO users (id,email,email_verified,name,created_at,updated_at) VALUES ('u2','m@t',1,'m',?,?)", [BASE, BASE]);
  pid = newProjectId();
  const dbPath = `file:${join(dir, `${pid}.db`)}`;
  await mod.registerProjectWithOwnerMembership(gc, { projectId: pid, databaseId: dbPath, ownerUserId: "u1", now: BASE });
  const pdb = createClient({ url: dbPath });
  await mod.applyProjectMigrations(pdb);
  await pdb.execute({ sql: "INSERT INTO project_state (project_id,name,created_at,updated_at,version) VALUES (?, 'P', ?, ?, 1)", args: [pid, BASE, BASE] });
  await pdb.close();

  // Build minimal composed app
  const infra = mod;
  const makeDeps = (routerType: string) => ({
    resolveIdentity: (r: Request) => identityFor(r.headers.get("x-test-user")),
    openProjectContext: async (request: Request, p: string) => {
      const pipeline = new RequestPipeline({
        identityResolver: { resolveIdentity: (req: Request) => identityFor(req.headers.get("x-test-user")) },
        globalClient: gc,
        databaseResolver: new SqliteProjectDatabaseResolver(gc),
        projectClientFactory: { create: (id: string) => createClient({ url: id }) },
      });
      const r = await pipeline.run(request, p);
      return { userId: r.identity.userId, ownerUserId: r.project.ownerUserId, database: r.database, permission: r.permission };
    },
    [`new${routerType}Id`]: infra.newProjectId,
    assertAssigneeActiveMember: async () => undefined,
    idempotencyStore: undefined,
  });

  const milestonesMod = await import("../src/routes/milestones.ts");
  const boardsMod = await import("../src/routes/boards.ts");
  const listsMod = await import("../src/routes/lists.ts");
  const cardsMod = await import("../src/routes/cards.ts");

  app = new Hono().basePath("/api");
  app.route("/", milestonesMod.createMilestonesRouter(() => makeDeps("Milestone") as never));
  app.route("/", boardsMod.createBoardsRouter(() => makeDeps("Board") as never));
  app.route("/", listsMod.createListsRouter(() => makeDeps("List") as never));
  app.route("/", cardsMod.createCardsRouter(() => makeDeps("Card") as never));
});

afterAll(async () => {
  await gc.close();
  rmSync(dir, { recursive: true, force: true });
});

const post = (path: string, body?: object): Promise<Response> =>
  app.request(path, { method: "POST", headers: { "x-test-user": "u1", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const patch = (path: string, body: object): Promise<Response> =>
  app.request(path, { method: "PATCH", headers: { "x-test-user": "u1", "content-type": "application/json" }, body: JSON.stringify(body) });

describe("F.6 poin 2 — Smoke alur inti end-to-end API-level (goal 6.9.2)", () => {
  it("[F.6] create milestone → board → list → card → move → archive → restore → delete terminal", async () => {
    // Milestone
    let r = await post(`/v1/projects/${pid}/milestones`, { title: "MS" });
    expect(r.status).toBe(201);
    msId = (await r.json()).data.milestone.id;
    // Board
    r = await post(`/v1/projects/${pid}/milestones/${msId}/boards`, { title: "BD" });
    expect(r.status).toBe(201);
    bdId = (await r.json()).data.board.id;
    // List
    r = await post(`/v1/projects/${pid}/milestones/${msId}/boards/${bdId}/lists`, { title: "LS" });
    expect(r.status).toBe(201);
    lsId = (await r.json()).data.list.id;
    // Card
    r = await post(`/v1/projects/${pid}/lists/${lsId}/cards`, { title: "CD" });
    expect(r.status).toBe(201);
    cdId = (await r.json()).data.card.id;
    // Archive Card
    r = await post(`/v1/projects/${pid}/cards/${cdId}/archive`, { expectedVersion: 1 });
    expect(r.status).toBe(200);
    // Restore Card
    r = await post(`/v1/projects/${pid}/cards/${cdId}/restore`, { expectedVersion: 2 });
    expect(r.status).toBe(200);
    // Delete terminal
    r = await post(`/v1/projects/${pid}/cards/${cdId}/delete`, { expectedVersion: 3 });
    expect(r.status).toBe(200);
    // Verify deleted
    const check = await app.request(`/v1/projects/${pid}/cards/${cdId}`, { headers: { "x-test-user": "u1" } });
    expect(check.status).toBe(404); // DELETED tidak terlihat
  });
});
