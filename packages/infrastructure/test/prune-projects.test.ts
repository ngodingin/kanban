import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { applyGlobalMigrations, applyProjectMigrations, pruneEligibleProjects } from "../src/index.ts";
import { TursoApiError, projectDatabaseName } from "../src/provisioning/turso.ts";

const NOW = new Date("2026-08-23T00:00:00.000Z");
const BASE = "2026-01-01T00:00:00.000Z";
const daysAgoIso = (days: number): string =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

let dir: string;
let globalClient: Client;

interface SeedOpts {
  deletedAt: string | null;
}

async function seedProject(projectId: string, opts: SeedOpts): Promise<string> {
  const dbPath = `file:${join(dir, `${projectId}.db`)}`;
  await globalClient.execute({
    sql: "INSERT INTO projects (id, owner_user_id, provisioning_state, created_at) VALUES (?, 'u-owner', 'READY', ?)",
    args: [projectId, BASE],
  });
  await globalClient.execute({
    sql: "INSERT INTO project_databases (project_id, database_id, created_at) VALUES (?, ?, ?)",
    args: [projectId, dbPath, BASE],
  });
  for (const user of [`u-${projectId}`]) {
    await globalClient.execute({
      sql: "INSERT OR IGNORE INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
      args: [user, `${user}@t.local`, user, BASE, BASE],
    });
    await globalClient.execute({
      sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES (?, ?, ?, ?, NULL)",
      args: [`m-${projectId}`, projectId, user, BASE],
    });
  }
  await globalClient.execute({
    sql: "INSERT INTO permission_groups (id, project_id, name, created_at, updated_at) VALUES (?, ?, 'G', ?, ?)",
    args: [`g-${projectId}`, projectId, BASE, BASE],
  });
  const pRow = await globalClient.execute({
    sql: "INSERT INTO permissions (id, key) VALUES (?, ?) ON CONFLICT (key) DO NOTHING RETURNING id",
    args: [`perm-${projectId}`, `key.${projectId}`],
  });
  const permId = pRow.rows[0] ? String(pRow.rows[0].id) : "";
  if (permId) {
    await globalClient.execute({
      sql: "INSERT INTO group_permissions (group_id, permission_id, created_at) VALUES (?, ?, ?)",
      args: [`g-${projectId}`, permId, BASE],
    });
  }
  await globalClient.execute({
    sql: "INSERT INTO membership_group_assignments (id, membership_id, group_id, scope_type, scope_id, created_at) VALUES (?, ?, ?, 'project', ?, ?)",
    args: [`ga-${projectId}`, `m-${projectId}`, `g-${projectId}`, projectId, BASE],
  });
  if (permId) {
    await globalClient.execute({
      sql: "INSERT INTO membership_permission_assignments (id, membership_id, permission_id, scope_type, scope_id, created_at) VALUES (?, ?, ?, 'project', ?, ?)",
      args: [`da-${projectId}`, `m-${projectId}`, permId, projectId, BASE],
    });
  }
  // Project DB fisik + project_state
  const pdb = createClient({ url: dbPath });
  await applyProjectMigrations(pdb);
  await pdb.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version, deleted_at) VALUES (?, 'P', ?, ?, 1, ?)",
    args: [projectId, BASE, BASE, opts.deletedAt],
  });
  await pdb.close();
  return dbPath;
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kanban-prune-proj-"));
  globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  await globalClient.execute({
    sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES ('u-owner', 'o@t.local', 1, 'o', ?, ?)",
    args: [BASE, BASE],
  });
});

afterAll(async () => {
  await globalClient.close();
  rmSync(dir, { recursive: true, force: true });
});

const exists = async (table: string, id: string, col = "id"): Promise<boolean> => {
  const r = await globalClient.execute({ sql: `SELECT COUNT(*) AS n FROM ${table} WHERE ${col} = ?`, args: [id] });
  return Number(r.rows[0]!.n) > 0;
};

describe("pruneEligibleProjects — goal 5.3.1", () => {
  it("[BR-016A] Project DELETED 31 hari → deleteDatabase dipanggil dgn nama benar + Global DB bersih leaf-to-root", async () => {
    const pid = "pold";
    await seedProject(pid, { deletedAt: daysAgoIso(31) });
    const turso = { org: "org", group: "g", apiToken: "t" };
    const deleteDb = vi.fn(async () => undefined);

    const result = await pruneEligibleProjects(globalClient, turso, {
      now: NOW,
      deleteDb,
    });

    expect(deleteDb).toHaveBeenCalledTimes(1);
    expect(deleteDb.mock.calls[0]![1]).toBe(projectDatabaseName(pid));
    expect(result.prunedProjects).toBe(1);
    expect(await exists("projects", pid)).toBe(false);
    expect(await exists("project_databases", pid, "project_id")).toBe(false);
    expect(await exists("project_memberships", `m-${pid}`)).toBe(false);
    expect(await exists("permission_groups", `g-${pid}`)).toBe(false);
    expect(await exists("membership_group_assignments", `ga-${pid}`)).toBe(false);
    expect(await exists("membership_permission_assignments", `da-${pid}`)).toBe(false);
  });

  it("[negatif BR-016A] 29 hari & ARCHIVED → tidak disentuh sama sekali", async () => {
    await seedProject("pfresh", { deletedAt: daysAgoIso(29) });
    await seedProject("parch", { deletedAt: null }); // ARCHIVED simulasi: deleted_at NULL
    const turso = { org: "org", group: "g", apiToken: "t" };
    const result = await pruneEligibleProjects(globalClient, turso, { now: NOW });
    expect(result.prunedProjects).toBe(0);
    expect(await exists("projects", "pfresh")).toBe(true);
    expect(await exists("projects", "parch")).toBe(true);
  });

  it("[idempotency 404] DB sudah hilang di Turso → tetap lanjut cleanup Global", async () => {
    const pid = "p404";
    await seedProject(pid, { deletedAt: daysAgoIso(31) });
    const turso = { org: "org", group: "g", apiToken: "t" };
    const deleteDb = vi.fn(async () => {
      throw new TursoApiError(404, "gone");
    });

    const result = await pruneEligibleProjects(globalClient, turso, { now: NOW, deleteDb });
    expect(result.prunedProjects).toBe(1);
    expect(await exists("projects", pid)).toBe(false);
  });

  it("[gagal non-404] Turso error → row Global TETAP ADA (dicoba run berikutnya)", async () => {
    const pid = "pfail";
    await seedProject(pid, { deletedAt: daysAgoIso(31) });
    const turso = { org: "org", group: "g", apiToken: "t" };
    const deleteDb = vi.fn(async () => {
      throw new TursoApiError(500, "boom");
    });

    const result = await pruneEligibleProjects(globalClient, turso, { now: NOW, deleteDb });
    expect(result.prunedProjects).toBe(0);
    expect(await exists("projects", pid)).toBe(true);
    expect(await exists("project_databases", pid, "project_id")).toBe(true);
    expect(await exists("project_memberships", `m-${pid}`)).toBe(true);
    void result;
  });

  it("[isolasi] hanya Project eligible yang terhapus; lainnya utuh dalam satu run", async () => {
    await seedProject("pmix1", { deletedAt: daysAgoIso(45) });
    await seedProject("pmix2", { deletedAt: daysAgoIso(3) });
    const turso = { org: "org", group: "g", apiToken: "t" };
    expect(await exists("projects", "pmix2")).toBe(true);
    const result = await pruneEligibleProjects(globalClient, turso, {
      now: NOW,
      deleteDb: async () => undefined,
    });
    expect(await exists("projects", "pmix1")).toBe(false);
    expect(await exists("projects", "pmix2")).toBe(true);
    expect(result.prunedProjects).toBeGreaterThanOrEqual(1);
  });
});
