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
    now?: Date;
    openProjectDb?: (databaseId: string) => Promise<Client>;
    deleteDb?: (env: TursoEnv, name: string) => Promise<void>;
}
type DeprovisionState = "PENDING" | "DATABASE_DELETED" | "COMPLETED";
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
async function readDeletedAt(openProjectDb: (databaseId: string) => Promise<Client>, databaseId: string): Promise<string | null> {
    const client = await openProjectDb(databaseId);
    try {
        const state = await client.execute("SELECT deleted_at FROM project_state LIMIT 1");
        const raw = state.rows[0]?.deleted_at;
        return raw === null || raw === undefined ? null : String(raw);
    }
    finally {
        try {
            await client.close();
        }
        catch {
        }
    }
}
async function createOrLoadJob(globalClient: Client, projectId: string, databaseId: string, now: Date): Promise<DeprovisionJob> {
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
    const row = (await globalClient.execute({
        sql: "SELECT id, project_id AS projectId, database_id AS databaseId, database_name AS databaseName, state FROM project_deprovision_jobs WHERE project_id = ?",
        args: [projectId],
    })).rows[0]!;
    return {
        id: String(row.id),
        projectId: String(row.projectId),
        databaseId: String(row.databaseId),
        databaseName: String(row.databaseName),
        state: String(row.state) as DeprovisionJob["state"],
    };
}
async function loadJob(globalClient: Client, projectId: string): Promise<DeprovisionJob | null> {
    const row = (await globalClient.execute({
        sql: "SELECT id, project_id AS projectId, database_id AS databaseId, database_name AS databaseName, state FROM project_deprovision_jobs WHERE project_id = ? LIMIT 1",
        args: [projectId],
    })).rows[0];
    if (!row)
        return null;
    return {
        id: String(row.id),
        projectId: String(row.projectId),
        databaseId: String(row.databaseId),
        databaseName: String(row.databaseName),
        state: String(row.state) as DeprovisionJob["state"],
    };
}
async function driveDeprovision(globalClient: Client, turso: TursoEnv, projectId: string, opts: {
    openProjectDb: PruneProjectsOptions["openProjectDb"];
    deleteDb: PruneProjectsOptions["deleteDb"];
    now: Date;
}): Promise<boolean> {
    const openProjectDb = opts.openProjectDb ??
        ((databaseId: string) => Promise.resolve(createClient({ url: databaseId })));
    const deleteDb = opts.deleteDb ?? deleteDatabase;
    return withProjectLock(projectId, async () => {
        let job = await loadJob(globalClient, projectId);
        if (!job) {
            const mapping = await globalClient.execute({
                sql: "SELECT database_id FROM project_databases WHERE project_id = ? LIMIT 1",
                args: [projectId],
            });
            if (!mapping.rows[0])
                return false;
            const databaseId = String(mapping.rows[0].database_id);
            let deletedAt: string | null;
            try {
                deletedAt = await readDeletedAt(openProjectDb, databaseId);
            }
            catch {
                return false;
            }
            if (!isPruneEligible(deletedAt, opts.now))
                return false;
            job = await createOrLoadJob(globalClient, projectId, databaseId, opts.now);
        }
        if (job.state === "COMPLETED")
            return false;
        if (job.state === "PENDING") {
            let proceed = false;
            await runInWriteTransaction(globalClient, async (tx) => {
                const cur = await tx.execute("SELECT state FROM project_deprovision_jobs WHERE project_id = ?", [projectId]);
                if (String(cur.rows[0]?.state ?? "") !== "PENDING") {
                    proceed = false;
                    return;
                }
                try {
                    await deleteDb(turso, job!.databaseName);
                    proceed = true;
                }
                catch (error) {
                    if (error instanceof TursoApiError && error.status === 404) {
                        proceed = true;
                    }
                    else {
                        await tx.execute("UPDATE project_deprovision_jobs SET attempts = attempts + 1, last_error = ?, updated_at = ? WHERE project_id = ? AND state = 'PENDING'", [String(error instanceof Error ? error.message : error), new Date().toISOString(), projectId]);
                        proceed = false;
                    }
                }
                if (proceed) {
                    await tx.execute("UPDATE project_deprovision_jobs SET state = 'DATABASE_DELETED', updated_at = ? WHERE project_id = ? AND state = 'PENDING'", [new Date().toISOString(), projectId]);
                }
            });
            if (!proceed)
                return false;
            job.state = "DATABASE_DELETED";
        }
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
            const owned = await tx.execute("UPDATE project_deprovision_jobs SET state = 'COMPLETED', updated_at = ?, completed_at = ? WHERE project_id = ? AND state = 'DATABASE_DELETED' RETURNING project_id", [new Date().toISOString(), new Date().toISOString(), projectId]);
            return owned.rows.length > 0;
        });
    });
}
export async function pruneEligibleProjects(globalClient: Client, turso: TursoEnv, opts: PruneProjectsOptions = {}): Promise<PruneProjectsResult> {
    const now = opts.now ?? new Date();
    const openProjectDb = opts.openProjectDb ??
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
        if (completed)
            prunedProjects += 1;
    }
    return { prunedProjects };
}
export async function processDeprovisionJobs(globalClient: Client, turso: TursoEnv, opts: PruneProjectsOptions = {}): Promise<{
    recovered: number;
    failed: number;
}> {
    const now = opts.now ?? new Date();
    const openProjectDb = opts.openProjectDb ??
        ((databaseId: string) => Promise.resolve(createClient({ url: databaseId })));
    const deleteDb = opts.deleteDb ?? deleteDatabase;
    const jobs = await globalClient.execute("SELECT project_id AS projectId FROM project_deprovision_jobs WHERE state IN ('PENDING','DATABASE_DELETED') ORDER BY created_at, project_id");
    let recovered = 0;
    let failed = 0;
    for (const row of jobs.rows) {
        try {
            const done = await driveDeprovision(globalClient, turso, String(row.projectId), {
                openProjectDb,
                deleteDb,
                now,
            });
            if (done)
                recovered += 1;
            else
                failed += 1;
        }
        catch {
            failed += 1;
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
export async function listRegisteredProjectDatabases(globalClient: Client): Promise<Array<{
    projectId: string;
    databaseId: string;
}>> {
    const result = await globalClient.execute("SELECT d.project_id AS projectId, d.database_id AS databaseId FROM project_databases d JOIN projects p ON p.id = d.project_id ORDER BY p.created_at, d.project_id");
    return result.rows.map((row) => ({
        projectId: String(row.projectId),
        databaseId: String(row.databaseId),
    }));
}
export async function pruneAllRegisteredProjects(globalClient: Client, turso: TursoEnv, opts: PruneProjectsOptions = {}): Promise<CombinedPruneSummary> {
    const now = opts.now ?? new Date();
    const openProjectDb = opts.openProjectDb ??
        ((databaseId: string) => Promise.resolve(createClient({ url: databaseId })));
    const jobs = await processDeprovisionJobs(globalClient, turso, { ...opts, now });
    const pendingJobProjects = new Set((await globalClient.execute({
        sql: "SELECT project_id AS pid FROM project_deprovision_jobs WHERE state IN ('PENDING','DATABASE_DELETED')",
    })).rows.map((r) => String(r.pid)));
    const entities: PruneResult = { milestones: 0, boards: 0, lists: 0, cards: 0, labels: 0 };
    for (const registered of await listRegisteredProjectDatabases(globalClient)) {
        if (pendingJobProjects.has(registered.projectId))
            continue;
        try {
            const client = await openProjectDb(registered.databaseId);
            try {
                const partial = await pruneDescendantSubtrees(client, now);
                entities.milestones += partial.milestones;
                entities.boards += partial.boards;
                entities.lists += partial.lists;
                entities.cards += partial.cards;
                entities.labels += partial.labels;
            }
            finally {
                try {
                    await client.close();
                }
                catch {
                }
            }
        }
        catch {
        }
    }
    const projects = await pruneEligibleProjects(globalClient, turso, { ...opts, now });
    return {
        prunedEntities: entities,
        prunedProjects: projects.prunedProjects,
        jobsRecovered: jobs.recovered,
        jobFailures: jobs.failed,
    };
}
