import type { Client } from "@libsql/client";
import { createClient } from "@libsql/client";
import { isPruneEligible } from "@kanban/domain";
import type { TursoEnv } from "../provisioning/turso.ts";
import { deleteDatabase, projectDatabaseName, TursoApiError } from "../provisioning/turso.ts";
import { runInWriteTransaction } from "./transaction.ts";
import { pruneDescendantSubtrees, type PruneResult } from "./prune.ts";

export interface PruneProjectsResult {
  prunedProjects: number;
}

export interface PruneProjectsOptions {
  /** Deterministik untuk test; default new Date(). */
  now?: Date;
  /** Injeksi pembuka Project DB (default createClient(databaseId)). */
  openProjectDb?: (databaseId: string) => Promise<Client>;
  /** Injeksi penghapus Turso DB (default deleteDatabase produksi). */
  deleteDb?: (env: TursoEnv, name: string) => Promise<void>;
}

async function readDeletedAt(
  openProjectDb: (databaseId: string) => Promise<Client>,
  databaseId: string,
): Promise<string | null> {
  const client = await openProjectDb(databaseId);
  try {
    const state = await client.execute("SELECT deleted_at FROM project_state LIMIT 1");
    const raw = state.rows[0]?.deleted_at;
    return raw === null || raw === undefined ? null : String(raw);
  } finally {
    try {
      await client.close();
    } catch {
      // ignore
    }
  }
}

/**
 * Prune Project-level (BR-016/016A, F.2 symmetry): seluruh Project dengan
 * `project_state.deleted_at` eligible (>= 30 hari) di-deprovision — Turso DB
 * dihapus DULU, baru baris Global DB (urutan ketat; kegagalan non-404 pada
 * step Turso = project DILEWATI dan tetap terdaftar untuk run berikutnya).
 * 404 dari Turso = DB sudah tidak ada → lanjut cleanup Global (idempotent).
 */
export async function pruneEligibleProjects(
  globalClient: Client,
  turso: TursoEnv,
  opts: PruneProjectsOptions = {},
): Promise<PruneProjectsResult> {
  const now = opts.now ?? new Date();
  const openProjectDb =
    opts.openProjectDb ??
    ((databaseId: string) => Promise.resolve(createClient({ url: databaseId })));
  const deleteDb = opts.deleteDb ?? deleteDatabase;

  const projects = await globalClient.execute("SELECT id FROM projects ORDER BY created_at, id");
  let prunedProjects = 0;

  for (const row of projects.rows) {
    const projectId = String(row.id);

    const mapping = await globalClient.execute({
      sql: "SELECT database_id FROM project_databases WHERE project_id = ? LIMIT 1",
      args: [projectId],
    });
    if (!mapping.rows[0]) continue;
    const databaseId = String(mapping.rows[0].database_id);

    // Baca deleted_at dari project_state di Project DB-nya.
    let deletedAt: string | null;
    try {
      deletedAt = await readDeletedAt(openProjectDb, databaseId);
    } catch {
      // DB tidak bisa dibuka → jangan hapus apa pun; coba lagi run berikutnya.
      continue;
    }

    if (!isPruneEligible(deletedAt, now)) continue;

    // (1) Deprovision Turso DULU.
    try {
      await deleteDb(turso, projectDatabaseName(projectId));
    } catch (error) {
      if (error instanceof TursoApiError && error.status === 404) {
        // Sudah tidak ada — idempotent, lanjut cleanup Global.
      } else {
        continue; // gagal transient → biarkan terdaftar, coba lagi nanti
      }
    }

    // (2) Baru hapus baris Global DB — leaf-to-root, SATU transaksi.
    await runInWriteTransaction(globalClient, async (tx) => {
      for (const sql of [
        "DELETE FROM membership_group_assignments WHERE membership_id IN (SELECT id FROM project_memberships WHERE project_id = ?)",
        "DELETE FROM membership_permission_assignments WHERE membership_id IN (SELECT id FROM project_memberships WHERE project_id = ?)",
        "DELETE FROM group_permissions WHERE group_id IN (SELECT id FROM permission_groups WHERE project_id = ?)",
        // invitation_group_assignments referensi invitations.id DAN permission_groups.id
        // (global-schema.ts) — WAJIB dihapus SEBELUM keduanya (QA-CL-01: FK constraint
        // failure, tabel ini terlewat dari delete list semula).
        "DELETE FROM invitation_group_assignments WHERE invitation_id IN (SELECT id FROM invitations WHERE project_id = ?)",
        "DELETE FROM permission_groups WHERE project_id = ?",
        "DELETE FROM invitations WHERE project_id = ?",
        "DELETE FROM api_keys WHERE project_id = ?",
        "DELETE FROM project_memberships WHERE project_id = ?",
        "DELETE FROM project_databases WHERE project_id = ?",
        "DELETE FROM projects WHERE id = ?",
      ]) {
        await tx.execute(sql, [projectId]);
      }
    });
    prunedProjects += 1;
  }

  return { prunedProjects };
}

export interface CombinedPruneSummary {
  prunedEntities: PruneResult;
  prunedProjects: number;
}

/** Daftar seluruh Project DB terdaftar (sistem-lebar, tanpa filter membership). */
export async function listRegisteredProjectDatabases(
  globalClient: Client,
): Promise<Array<{ projectId: string; databaseId: string }>> {
  const result = await globalClient.execute(
    "SELECT d.project_id AS projectId, d.database_id AS databaseId FROM project_databases d JOIN projects p ON p.id = d.project_id ORDER BY p.created_at, d.project_id",
  );
  return result.rows.map((row) => ({
    projectId: String(row.projectId),
    databaseId: String(row.databaseId),
  }));
}

/**
 * Orkestrasi prune lengkap untuk trigger internal (TASK-5.4): descendant-level
 * DULU untuk setiap Project DB yang MASIH terdaftar, baru Project-level
 * (deprovision). Kegagalan satu Project DB tidak menggagalkan yang lain.
 */
export async function pruneAllRegisteredProjects(
  globalClient: Client,
  turso: TursoEnv,
  opts: PruneProjectsOptions = {},
): Promise<CombinedPruneSummary> {
  const now = opts.now ?? new Date();
  const openProjectDb =
    opts.openProjectDb ??
    ((databaseId: string) => Promise.resolve(createClient({ url: databaseId })));

  const entities: PruneResult = { milestones: 0, boards: 0, lists: 0, cards: 0, labels: 0 };
  for (const registered of await listRegisteredProjectDatabases(globalClient)) {
    try {
      const client = await openProjectDb(registered.databaseId);
      try {
        const partial = await pruneDescendantSubtrees(client, now);
        entities.milestones += partial.milestones;
        entities.boards += partial.boards;
        entities.lists += partial.lists;
        entities.cards += partial.cards;
        entities.labels += partial.labels;
      } finally {
        try {
          await client.close();
        } catch {
          // ignore
        }
      }
    } catch {
      // Project DB gagal dibuka → lanjut Project berikutnya.
    }
  }

  const projects = await pruneEligibleProjects(globalClient, turso, { ...opts, now });
  return { prunedEntities: entities, prunedProjects: projects.prunedProjects };
}
