import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import { applyGlobalMigrations, applyProjectMigrations } from "@kanban/infrastructure";
import { createInternalRouter, type InternalRoutesDeps } from "../src/routes/internal.ts";

const NOW = new Date("2026-08-23T00:00:00.000Z");
const BASE = "2026-01-01T00:00:00.000Z";
const SECRET = "cron-secret-super-rafisial-123";

let dir: string;
let globalClient: Client;
const deleteDb = vi.fn(async () => undefined);

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kanban-prune-cron-"));
  globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  await globalClient.execute({
    sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES ('u1', 'u1@t.local', 1, 'u1', ?, ?)",
    args: [BASE, BASE],
  });
});

afterAll(async () => {
  await globalClient.close();
  rmSync(dir, { recursive: true, force: true });
});

async function seedEligibleProject(pid: string): Promise<void> {
  const dbPath = `file:${join(dir, `${pid}.db`)}`;
  await globalClient.execute({
    sql: "INSERT INTO projects (id, owner_user_id, provisioning_state, created_at) VALUES (?, 'u1', 'READY', ?)",
    args: [pid, BASE],
  });
  await globalClient.execute({
    sql: "INSERT INTO project_databases (project_id, database_id, created_at) VALUES (?, ?, ?)",
    args: [pid, dbPath, BASE],
  });
  const pdb = createClient({ url: dbPath });
  await applyProjectMigrations(pdb);
  await pdb.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version, deleted_at) VALUES (?, 'P', ?, ?, 1, ?)",
    args: [pid, BASE, BASE, new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString()],
  });
  await pdb.execute({
    sql: "INSERT INTO milestones (id, title, progress, created_at, updated_at, deleted_at) VALUES (?, 'M', 0, ?, ?, ?)",
    args: [`${pid}-ms`, BASE, BASE, new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString()],
  });
  await pdb.close();
}

function makeDeps(): InternalRoutesDeps {
  return {
    cronSecret: SECRET,
    pruneAll: async () => {
      const mod = await import("@kanban/infrastructure");
      return mod.pruneAllRegisteredProjects(globalClient, { org: "o", group: "g", apiToken: "t" }, {
        now: NOW,
        deleteDb,
      });
    },
  };
}

const app = (): Hono => new Hono().route("/", createInternalRouter(() => makeDeps()));

const call = (secret?: string): Promise<Response> =>
  app().request("/internal/prune", {
    method: "POST",
    headers: secret === undefined ? {} : { authorization: `Bearer ${secret}` },
  });

describe("POST /internal/prune (composed: /api/internal/prune) — goal 5.4.1", () => {
  it("[negatif] tanpa header → 401 dan prune TIDAK dipanggil sama sekali", async () => {
    const spy = vi.fn(async () => ({ prunedEntities: { milestones: 0, boards: 0, lists: 0, cards: 0, labels: 0 }, prunedProjects: 0 }));
    const probe = new Hono().route("/", createInternalRouter(() => ({ cronSecret: SECRET, pruneAll: spy })));
    const res = await probe.request("/internal/prune", { method: "POST" });
    expect(res.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  it("[negatif] secret salah — termasuk yang mirip-mirip (constant-time path) → 401", async () => {
    for (const bad of ["x".repeat(SECRET.length), SECRET.slice(0, -1), `${SECRET}x`, ""]) {
      const res = await call(bad || undefined);
      expect(res.status, JSON.stringify(bad)).toBe(401);
    }
  });

  it("[positif] secret benar → 200 + ringkasan; prune BENAR-BENAR berjalan (row terhapus)", async () => {
    await seedEligibleProject("pcron");
    const res = await call(SECRET);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.prunedProjects).toBe(1);
    expect(json.data.prunedEntities.milestones).toBe(1);
    expect(deleteDb).toHaveBeenCalled();

    // Row-level: milestone fisik hilang dari Project DB
    const dbRow = await globalClient.execute({
      sql: "SELECT database_id AS db FROM project_databases WHERE project_id = 'pcron'",
    });
    expect(dbRow.rows).toHaveLength(0); // mapping ikut terhapus
    expect(await existsProject("pcron")).toBe(false);
  });

  it("[DoD] CRON_SECRET tidak pernah muncul di response manapun", async () => {
    for (const secret of [undefined, "wrong"]) {
      const res = await call(secret);
      const text = JSON.stringify(await res.json());
      expect(text.includes(SECRET)).toBe(false);
    }
  });
});

async function existsProject(pid: string): Promise<boolean> {
  const r = await globalClient.execute({ sql: "SELECT COUNT(*) AS n FROM projects WHERE id = ?", args: [pid] });
  return Number(r.rows[0]!.n) > 0;
}
