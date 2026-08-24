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

type DeprovisionState = "PENDING" | "DATABASE_DELETED" | "COMPLETED";

interface DeprovisionJob {
  id: string;
  projectId: string;
  databaseId: string;
  databaseName: string;
  state: DeprovisionState;
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
 * BR-016B langkah 1 — create-or-load job unik per project_id (UNIQUE constraint;
 * dua worker konkuren menghasilkan TEPAT SATU row — yang kalah load existing).
 * DIPANGGIL SEBELUM provider delete.
 */
async function createOrLoadJob(
  globalClient: Client,
  projectId: string,
  databaseId: string,
  now: Date,
): Promise<DeprovisionJob> {
  const id = `pdj-${projectId}-${now.getTime()}`;
  const createdAt = now.toISOString();
  const name = projectDatabaseName(projectId);
  await globalClient.execute({
    sql: `INSERT INTO project_deprovision_jobs
          (id, project_id, database_id, database_name, state, attempts, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'PENDING', 0, ?, ?)
          ON CONFLICT (project_id) DO NOTHING`,
    args: [id, projectId, databaseId, name, createdAt, createdAt],
  });
  const row = (
    await globalClient.execute({
      sql: "SELECT id, project_id AS projectId, database_id AS databaseId, database_name AS databaseName, state FROM project_deprovision_jobs WHERE project_id = ?",
      args: [projectId],
    })
  ).rows[0]!;
  return {
    id: String(row.id),
    projectId: String(row.projectId),
    databaseId: String(row.databaseId),
    databaseName: String(row.databaseName),
    state: String(row.state) as DeprovisionJob["state"],
  };
}

/** Transisi conditional — worker kedua yang kehilangan race mendapat 0 row (tanpa efek). */
async function transitionJob(
  globalClient: Client,
  projectId: string,
  from: DeprovisionState,
  to: DeprovisionState,
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const setCompleted = to === "COMPLETED" ? ", completed_at = ?" : "";
  const args =
    to === "COMPLETED"
      ? [to, nowIso, nowIso, projectId, from]
      : [to, nowIso, projectId, from];
  await globalClient.execute({
    sql: `UPDATE project_deprovision_jobs SET state = ?, updated_at = ?${setCompleted} WHERE project_id = ? AND state = ?`,
    args,
  });
  // Verifikasi eksplisit — rowsAffected tidak konsisten antar driver libsql.
  const after = await globalClient.execute({
    sql: "SELECT state FROM project_deprovision_jobs WHERE project_id = ?",
    args: [projectId],
  });
  return String(after.rows[0]?.state ?? "") === to;
}

/**
 * BR-016B langkah 3 — cleanup registry Global leaf-to-root + COMPLETED dalam
 * SATU commit; TIDAK menyentuh Project DB sama sekali (dipanggil dari
 * DATABASE_DELETED).
 */
async function finalizeProjectCleanup(globalClient: Client, projectId: string): Promise<boolean> {
  return runInWriteTransaction(globalClient, async (tx) => {
    for (const sql of [
      // Leaf-to-root sesuai FK aktual Global DB (invitation_group_assignments
      // merujuk invitations + permission_groups → harus sebelum keduanya).
      "DELETE FROM membership_group_assignments WHERE membership_id IN (SELECT id FROM project_memberships WHERE project_id = ?)",
      "DELETE FROM membership_permission_assignments WHERE membership_id IN (SELECT id FROM project_memberships WHERE project_id = ?)",
      "DELETE FROM invitation_group_assignments WHERE invitation_id IN (SELECT id FROM invitations WHERE project_id = ?)",
      "DELETE FROM group_permissions WHERE group_id IN (SELECT id FROM permission_groups WHERE project_id = ?)",
      "DELETE FROM permission_groups WHERE project_id = ?",
      "DELETE FROM invitations WHERE project_id = ?",
      "DELETE FROM api_keys WHERE project_id = ?",
      "DELETE FROM project_memberships WHERE project_id = ?",
      "DELETE FROM project_databases WHERE project_id = ?",
      "DELETE FROM projects WHERE id = ?",
    ]) {
      await tx.execute(sql, [projectId]);
    }
    // Transisi conditional DATABASE_DELETED → COMPLETED di commit yang sama
    // (via tx — bukan autocommit, hindari lock diri sendiri).
    const nowIso = new Date().toISOString();
    await tx.execute(
      "UPDATE project_deprovision_jobs SET state = 'COMPLETED', updated_at = ?, completed_at = ? WHERE project_id = ? AND state = 'DATABASE_DELETED'",
      [nowIso, nowIso, projectId],
    );
    // Verifikasi eksplisit di dalam tx yang sama; true = worker ini pemilik
    // transisi, false = worker lain lebih dulu.
    const after = await tx.execute(
      "SELECT state FROM project_deprovision_jobs WHERE project_id = ?",
      [projectId],
    );
    return String(after.rows[0]?.state ?? "") === "COMPLETED";
  });
}

/**
 * Prune Project-level ber-journal (BR-016B / F.2.1): eligibility dari
 * `project_state`, lalu alur PENDING → DATABASE_DELETED → COMPLETED.
 * Retry/restart SELALU memulai dari state journal; `DATABASE_DELETED` tidak
 * pernah membuka Project DB. HTTP 404 provider = sukses setara.
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

    // Job existing? (retry path — jangan sentuh Project DB sebelum dicek)
    const existingJob = (
      await globalClient.execute({
        sql: "SELECT id, project_id AS projectId, database_id AS databaseId, database_name AS databaseName, state FROM project_deprovision_jobs WHERE project_id = ? LIMIT 1",
        args: [projectId],
      })
    ).rows[0];

    let job: DeprovisionJob;
    if (existingJob) {
      job = {
        id: String(existingJob.id),
        projectId: String(existingJob.projectId),
        databaseId: String(existingJob.databaseId),
        databaseName: String(existingJob.databaseName),
        state: String(existingJob.state) as DeprovisionJob["state"],
      };
    } else {
      const mapping = await globalClient.execute({
        sql: "SELECT database_id FROM project_databases WHERE project_id = ? LIMIT 1",
        args: [projectId],
      });
      if (!mapping.rows[0]) continue;
      const databaseId = String(mapping.rows[0].database_id);

      let deletedAt: string | null;
      try {
        deletedAt = await readDeletedAt(openProjectDb, databaseId);
      } catch {
        continue; // DB tidak bisa dibuka → coba lagi run berikutnya
      }
      if (!isPruneEligible(deletedAt, now)) continue;

      // BR-016B: journal DIBUAT SEBELUM provider delete.
      job = await createOrLoadJob(globalClient, projectId, databaseId, now);
    }

    if (job.state === "COMPLETED") continue;

    if (job.state === "PENDING") {
      try {
        await deleteDb(turso, job.databaseName);
      } catch (error) {
        if (error instanceof TursoApiError && error.status === 404) {
          // not found = sukses setara (BR-016B)
        } else {
          // Kegagalan lain: tetap PENDING, attempts++, catat last_error,
          // registry tidak disentuh — dicoba lagi run berikutnya.
          await globalClient.execute({
            sql: "UPDATE project_deprovision_jobs SET attempts = attempts + 1, last_error = ?, updated_at = ? WHERE project_id = ? AND state = 'PENDING'",
            args: [String(error instanceof Error ? error.message : error), new Date().toISOString(), projectId],
          });
          continue;
        }
      }
      const won = await transitionJob(globalClient, projectId, "PENDING", "DATABASE_DELETED");
      void won;
      job.state = "DATABASE_DELETED";
    }

    // state DATABASE_DELETED → cleanup Global + COMPLETED (satu transaksi,
    // tanpa membuka Project DB). Hanya pemenang transisi yang menghitung.
    const completedHere = await finalizeProjectCleanup(globalClient, projectId);
    if (completedHere) prunedProjects += 1;
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
 * ber-journal. Kegagalan satu Project DB tidak menggagalkan yang lain.
 * (Rework journal-aware menyusul di goal 5.4.1.)
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
