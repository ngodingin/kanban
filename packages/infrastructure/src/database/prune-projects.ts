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

/**
 * Mutex in-process per project_id — dua worker pada SATU proses tidak pernah
 * menjalankan driveDeprovision yang sama bersamaan (mencegah double-provider-
 * call). Lintas-proses tetap aman via conditional transition + BEGIN IMMEDIATE
 * (F.2.1 poin 4); provider delete sendiri idempotent (404 = sukses).
 */
const deprovisionLocks = new Map<string, Promise<unknown>>();

async function withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  const prev = deprovisionLocks.get(projectId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  deprovisionLocks.set(projectId, next.catch(() => undefined));
  return next;
}

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
async function loadJob(globalClient: Client, projectId: string): Promise<DeprovisionJob | null> {
  const row = (
    await globalClient.execute({
      sql: "SELECT id, project_id AS projectId, database_id AS databaseId, database_name AS databaseName, state FROM project_deprovision_jobs WHERE project_id = ? LIMIT 1",
      args: [projectId],
    })
  ).rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    projectId: String(row.projectId),
    databaseId: String(row.databaseId),
    databaseName: String(row.databaseName),
    state: String(row.state) as DeprovisionJob["state"],
  };
}

/**
 * Driver satu Project berdasarkan state journal BR-016B. Dipakai oleh scan
 * eligibility (5.3) DAN recovery trigger (5.4). Return true bila job
 * mencapai COMPLETED pada pemanggilan ini.
 */
async function driveDeprovision(
  globalClient: Client,
  turso: TursoEnv,
  projectId: string,
  opts: { openProjectDb: PruneProjectsOptions["openProjectDb"]; deleteDb: PruneProjectsOptions["deleteDb"]; now: Date },
): Promise<boolean> {
  const openProjectDb =
    opts.openProjectDb ??
    ((databaseId: string) => Promise.resolve(createClient({ url: databaseId })));
  const deleteDb = opts.deleteDb ?? deleteDatabase;

  // Serialisasi in-process: worker kedua masuk SETELAH yang pertama selesai.
  return withProjectLock(projectId, async () => {
    let job = await loadJob(globalClient, projectId);

    if (!job) {
      const mapping = await globalClient.execute({
        sql: "SELECT database_id FROM project_databases WHERE project_id = ? LIMIT 1",
        args: [projectId],
      });
      if (!mapping.rows[0]) return false;
      const databaseId = String(mapping.rows[0].database_id);

      let deletedAt: string | null;
      try {
        deletedAt = await readDeletedAt(openProjectDb, databaseId);
      } catch {
        return false; // DB tidak bisa dibuka → coba lagi run berikutnya
      }
      if (!isPruneEligible(deletedAt, opts.now)) return false;
      // BR-016B: journal DIBUAT SEBELUM provider delete.
      job = await createOrLoadJob(globalClient, projectId, databaseId, opts.now);
    }

    if (job.state === "COMPLETED") return false;

    if (job.state === "PENDING") {
      // Provider delete + transisi DALAM SATU tx tulis: worker lain diblokir
      // oleh BEGIN IMMEDIATE sehingga TIDAK ADA double-provider-call, dan
      // ownership transisi terbukti via UPDATE ... RETURNING.
      let proceed = false;
      await runInWriteTransaction(globalClient, async (tx) => {
        const cur = await tx.execute(
          "SELECT state FROM project_deprovision_jobs WHERE project_id = ?",
          [projectId],
        );
        if (String(cur.rows[0]?.state ?? "") !== "PENDING") {
          proceed = false;
          return; // worker lain lebih dulu → rollback tanpa efek
        }
        try {
          await deleteDb(turso, job!.databaseName);
          proceed = true;
        } catch (error) {
          if (error instanceof TursoApiError && error.status === 404) {
            proceed = true; // not found = sukses setara (BR-016B)
          } else {
            await tx.execute(
              "UPDATE project_deprovision_jobs SET attempts = attempts + 1, last_error = ?, updated_at = ? WHERE project_id = ? AND state = 'PENDING'",
              [String(error instanceof Error ? error.message : error), new Date().toISOString(), projectId],
            );
            proceed = false;
          }
        }
        if (proceed) {
          await tx.execute(
            "UPDATE project_deprovision_jobs SET state = 'DATABASE_DELETED', updated_at = ? WHERE project_id = ? AND state = 'PENDING'",
            [new Date().toISOString(), projectId],
          );
        }
      });
      if (!proceed) return false;
      job.state = "DATABASE_DELETED";
    }

    // DATABASE_DELETED → cleanup Global + COMPLETED (satu tx). Ownership
    // dibuktikan UPDATE ... RETURNING — bukan sekadar state akhir.
    return runInWriteTransaction(globalClient, async (tx) => {
      for (const sql of [
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
      const owned = await tx.execute(
        "UPDATE project_deprovision_jobs SET state = 'COMPLETED', updated_at = ?, completed_at = ? WHERE project_id = ? AND state = 'DATABASE_DELETED' RETURNING project_id",
        [new Date().toISOString(), new Date().toISOString(), projectId],
      );
      return owned.rows.length > 0;
    });
  });
}

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
    const completed = await driveDeprovision(globalClient, turso, String(row.id), {
      openProjectDb,
      deleteDb,
      now,
    });
    if (completed) prunedProjects += 1;
  }

  return { prunedProjects };
}

/**
 * TASK-5.4 — proses SEMUA job journal existing (recovery per state), tanpa
 * menghentikan project lain saat satu gagal. Return jumlah job yang selesai.
 */
export async function processDeprovisionJobs(
  globalClient: Client,
  turso: TursoEnv,
  opts: PruneProjectsOptions = {},
): Promise<{ recovered: number; failed: number }> {
  const now = opts.now ?? new Date();
  const openProjectDb =
    opts.openProjectDb ??
    ((databaseId: string) => Promise.resolve(createClient({ url: databaseId })));
  const deleteDb = opts.deleteDb ?? deleteDatabase;

  const jobs = await globalClient.execute(
    "SELECT project_id AS projectId FROM project_deprovision_jobs WHERE state IN ('PENDING','DATABASE_DELETED') ORDER BY created_at, project_id",
  );
  let recovered = 0;
  let failed = 0;
  for (const row of jobs.rows) {
    try {
      const done = await driveDeprovision(globalClient, turso, String(row.projectId), {
        openProjectDb,
        deleteDb,
        now,
      });
      if (done) recovered += 1;
      else failed += 1;
    } catch {
      failed += 1; // isolation antar project
    }
  }
  return { recovered, failed };
}

export interface CombinedPruneSummary {
  prunedEntities: PruneResult;
  prunedProjects: number;
  jobsRecovered: number;
  jobFailures: number;
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
 * Orkestrasi prune lengkap untuk trigger internal (TASK-5.4, SOT 4.1.0):
 * (1) job deprovision EXISTING diproses lebih dulu berdasarkan state journal
 * (recovery per project, isolasi kegagalan); (2) descendant-level untuk
 * Project DB yang MASIH terdaftar dan TIDAK sedang menunggu cleanup Global;
 * (3) scan eligibility baru. Summary dilaporkan untuk observability.
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

  // (1) Recovery journal existing — SEBELUM scan eligibility baru.
  const jobs = await processDeprovisionJobs(globalClient, turso, { ...opts, now });

  const pendingJobProjects = new Set(
    (
      await globalClient.execute({
        sql: "SELECT project_id AS pid FROM project_deprovision_jobs WHERE state IN ('PENDING','DATABASE_DELETED')",
      })
    ).rows.map((r) => String(r.pid)),
  );

  const entities: PruneResult = { milestones: 0, boards: 0, lists: 0, cards: 0, labels: 0 };
  for (const registered of await listRegisteredProjectDatabases(globalClient)) {
    if (pendingJobProjects.has(registered.projectId)) continue; // sedang/telah di-deprovision
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

  // (3) Scan eligibility baru untuk project tanpa job.
  const projects = await pruneEligibleProjects(globalClient, turso, { ...opts, now });
  return {
    prunedEntities: entities,
    prunedProjects: projects.prunedProjects,
    jobsRecovered: jobs.recovered,
    jobFailures: jobs.failed,
  };
}
