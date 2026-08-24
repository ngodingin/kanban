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

describe("TASK-5.4 rework — trigger memproses journal existing (SOT 4.1.0)", () => {
  it("[recovery] job PENDING existing → diproses trigger; DATABASE_DELETED tanpa buka DB", async () => {
    // Project A: crash point DATABASE_DELETED (DB fisik dihapus)
    await seedEligibleProject("pa");
    const dbRow = await globalClient.execute({
      sql: "SELECT database_id AS db FROM project_databases WHERE project_id = 'pa'",
    });
    const dbPath = String(dbRow.rows[0]!.db).replace("file:", "");
    rmSync(dbPath, { force: true });
    await globalClient.execute({
      sql: `INSERT INTO project_deprovision_jobs
            (id, project_id, database_id, database_name, state, attempts, created_at, updated_at)
            VALUES ('pdj-pa', 'pa', ?, ?, 'DATABASE_DELETED', 1, ?, ?)`,
      args: [dbPath, `proj-pa`, BASE, BASE],
    });
    // Project B: eligible normal (akan dibuatkan job oleh scan)
    await seedEligibleProject("pb");

    deleteDb.mockClear();
    const res = await call(SECRET);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.jobsRecovered).toBe(1); // hanya pa (DATABASE_DELETED); pb = job baru via scan
    expect(json.data.prunedProjects).toBe(1); // pb lewat jalur scan eligibility
    // Provider delete HANYA untuk pb (scan baru) — pa direcovery dari state
    // journal TANPA menyentuh provider maupun membuka Project DB yang hilang.
    expect(deleteDb).toHaveBeenCalledTimes(1);
    expect(deleteDb.mock.calls[0]![1]).not.toContain("pa");
    expect(await existsProject("pa")).toBe(false);
    expect(await existsProject("pb")).toBe(false);

    // Semua job berakhir COMPLETED (tombstone)
    const jobs = await globalClient.execute(
      "SELECT state FROM project_deprovision_jobs WHERE project_id IN ('pa','pb') ORDER BY project_id",
    );
    for (const row of jobs.rows) expect(row.state).toBe("COMPLETED");
  });

  it("[isolasi kegagalan] satu job gagal provider TIDAK menghentikan project lain", async () => {
    await seedEligibleProject("pc-fail");
    await seedEligibleProject("pd-ok");
    // Paksa pc-fail gagal provider: deleteDb throw untuk nama yang mengandung 'pc'
    const deps = makeDeps();
    const failingDeps: InternalRoutesDeps = {
      ...deps,
      pruneAll: async () => {
        const mod = await import("@kanban/infrastructure");
        return mod.pruneAllRegisteredProjects(globalClient, { org: "o", group: "g", apiToken: "t" }, {
          now: NOW,
          deleteDb: async (_env, name) => {
            if (name.includes("pc")) throw new Error("provider down");
          },
        });
      },
    };
    const probe = new Hono().route("/", createInternalRouter(() => failingDeps));
    const res = await probe.request("/internal/prune", {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}` },
    });
    expect(res.status).toBe(200);
    expect(await existsProject("pc-fail")).toBe(true);  // tetap terdaftar (PENDING)
    expect(await existsProject("pd-ok")).toBe(false);   // tetap selesai
    const st = await globalClient.execute({
      sql: "SELECT * FROM project_deprovision_jobs WHERE project_id = 'pc-fail'",
    });
    expect(st.rows[0]!.state).toBe("PENDING");
    expect(Number(st.rows[0]!.attempts)).toBe(1);
  });
});
