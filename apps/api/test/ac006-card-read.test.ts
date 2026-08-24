import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import {
  applyGlobalMigrations,
  newProjectId,
  registerProjectWithOwnerMembership,
  RequestPipeline,
  SqliteProjectDatabaseResolver,
  createEntityPermissionResolver,
} from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";
import { createCardsRouter, type CardRoutesDeps } from "../src/routes/cards.ts";

const BASE = "2026-01-01T00:00:00.000Z";

let dir: string;
let globalClient: Client;
let deps: CardRoutesDeps;
let pid: string;

const identityFor = (userId: string | null): Promise<ResolvedIdentity | null> =>
  userId === null
    ? Promise.resolve(null)
    : Promise.resolve({ type: "session", userId, email: `${userId}@t.local`, name: userId, emailVerified: true, image: null });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kanban-ac006-007-"));
  globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  for (const u of ["u-owner", "u-creator", "u-assignee"]) {
    await globalClient.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
      args: [u, `${u}@t.local`, u, BASE, BASE],
    });
  }
  pid = `a-${newProjectId()}`;
  const dbPath = `file:${join(dir, `${pid}.db`)}`;
  const pdb = createClient({ url: dbPath });
  const mod = await import("@kanban/infrastructure");
  await mod.applyProjectMigrations(pdb);
  await pdb.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, 'P', ?, ?, 1)",
    args: [pid, BASE, BASE],
  });
  await pdb.execute({
    sql: "INSERT INTO milestones (id, title, progress, created_at, updated_at, version) VALUES ('ms1', 'M', 0, ?, ?, 1)",
    args: [BASE, BASE],
  });
  await pdb.execute({
    sql: "INSERT INTO boards (id, milestone_id, title, created_at, updated_at, version) VALUES ('bd1', 'ms1', 'B', ?, ?, 1)",
    args: [BASE, BASE],
  });
  await pdb.execute({
    sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('ls1', 'bd1', 'L', ?, ?, 1)",
    args: [BASE, BASE],
  });
  // Card dibuat OWNER, di-assign ke u-assignee
  await pdb.execute({
    sql: "INSERT INTO cards (id, list_id, title, creator_user_id, assignee_user_id, created_at, updated_at, version) VALUES ('cd1', 'ls1', 'T', 'u-owner', 'u-assignee', ?, ?, 1)",
    args: [BASE, BASE],
  });
  // Card milik u-creator (creator TANPA card.read)
  await pdb.execute({
    sql: "INSERT INTO cards (id, list_id, title, creator_user_id, assignee_user_id, created_at, updated_at, version) VALUES ('cd-cr', 'ls1', 'TC', 'u-creator', NULL, ?, ?, 1)",
    args: [BASE, BASE],
  });
  await pdb.close();

  await registerProjectWithOwnerMembership(globalClient, {
    projectId: pid, databaseId: dbPath, ownerUserId: "u-owner", now: BASE,
  });

  // Membership untuk creator & assignee — Group khusus HANYA card.create
  // (TANPA card.read apapun — inilah inti AC-006/AC-007).
  for (const [mid, uid] of [["m-cr", "u-creator"], ["m-as", "u-assignee"]] as const) {
    await globalClient.execute({
      sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at) VALUES (?, ?, ?, ?)",
      args: [mid, pid, uid, BASE],
    });
  }
  await globalClient.execute({
    sql: "INSERT OR IGNORE INTO permissions (id, key) VALUES ('p-cc', 'card.create')",
  });

  deps = {
    resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
    assertAssigneeActiveMember: async () => undefined,
    openProjectContext: async (request, projectId) => {
      const pipeline = new RequestPipeline({
        identityResolver: { resolveIdentity: (req) => identityFor(req.headers.get("x-test-user")) },
        globalClient,
        databaseResolver: new SqliteProjectDatabaseResolver(globalClient),
        projectClientFactory: { create: (databaseId) => createClient({ url: databaseId }) },
      });
      const resolved = await pipeline.run(request, projectId as string);
      return {
        userId: resolved.identity.userId,
        ownerUserId: resolved.project.ownerUserId,
        database: resolved.database,
        permission: resolved.permission,
        effectiveFor: createEntityPermissionResolver({
          globalClient,
          membershipId: resolved.membership.id,
          projectId: projectId as string,
          isOwner: resolved.project.ownerUserId === resolved.identity.userId,
        }),
      };
    },
  } as unknown as CardRoutesDeps;
});

afterAll(async () => {
  await globalClient.close();
  rmSync(dir, { recursive: true, force: true });
});

const app = (): Hono => new Hono().route("/", createCardsRouter(() => deps));
const getCard = (cid: string, user: string): Promise<Response> =>
  app().request(`http://localhost/v1/projects/${pid}/cards/${cid}`, { headers: { "x-test-user": user } });
const getList = (user: string): Promise<Response> =>
  app().request(`http://localhost/v1/projects/${pid}/lists/ls1/cards`, { headers: { "x-test-user": user } });

describe("AC-006 — creator tanpa grant card.read → baca ditolak (goal 6.8.1)", () => {
  it("[negatif] member tanpa card.read GET Card miliknya sendiri → RESOURCE_NOT_FOUND", async () => {
    // u-assignee punya membership + Group yang HANYA beri card.create;
    // status assignee TIDAK otomatis memberi akses baca (BR-045).
    const res = await getCard("cd1", "u-assignee");
    expect(res.status).toBe(404);
    expect((await res.json()).error?.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("[negatif] GET list tanpa card.read → array kosong (anti-enumeration)", async () => {
    const res = await getList("u-assignee");
    expect(res.status).toBe(200);
    expect((await res.json()).data.cards).toEqual([]);
  });

  it("[negatif inti AC-006] CREATOR tanpa card.read GET kartunya sendiri → ditolak", async () => {
    const res = await getCard("cd-cr", "u-creator");
    expect(res.status).toBe(404);
    expect((await res.json()).error?.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("[kontrol positif] Owner (katalog penuh) tetap membaca Card", async () => {
    const res = await getCard("cd1", "u-owner");
    expect(res.status).toBe(200);
    expect((await res.json()).data.card.id).toBe("cd1");
  });
});
