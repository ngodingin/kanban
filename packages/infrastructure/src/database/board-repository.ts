import type { Client } from "@libsql/client";
import { ulid } from "ulid";
import type { BoardLifecycleInput, BoardRecord, BoardRepository, CreateBoardInput, LifecycleState, UpdateBoardInput, } from "@kanban/domain";
import { AncestorNotActiveError, evaluateRestore, isEffectivelyOperational, resolveLifecycleState, BoardInvalidStateError, BoardNotFoundError, BoardValidationError, BoardVersionConflictError, MilestoneNotFoundError, } from "@kanban/domain";
import { runInWriteTransaction, type Tx } from "./transaction.ts";
type LifecycleOperation = "update" | "archive" | "restore" | "delete";
const LIFECYCLE_ALLOWED_FROM: Record<LifecycleOperation, readonly LifecycleState[]> = {
    update: ["ACTIVE"],
    archive: ["ACTIVE"],
    restore: ["ARCHIVED"],
    delete: ["ACTIVE", "ARCHIVED"],
};
interface LoadedBoard {
    current: BoardRecord;
    lifecycleBefore: LifecycleState;
}
export class DrizzleBoardRepository implements BoardRepository {
    private readonly client: Client;
    constructor(client: Client) {
        this.client = client;
    }
    async getBoard(projectId: string, boardId: string): Promise<BoardRecord | undefined> {
        void projectId;
        const result = await this.client.execute("SELECT id, milestone_id, title, description, created_at, updated_at, archived_at, deleted_at, version FROM boards WHERE id = ?", [boardId]);
        return mapBoardRow(result.rows[0]);
    }
    async listBoards(milestoneId: string): Promise<BoardRecord[]> {
        const result = await this.client.execute("SELECT id, milestone_id, title, description, created_at, updated_at, archived_at, deleted_at, version FROM boards WHERE milestone_id = ? ORDER BY created_at, id", [milestoneId]);
        return result.rows.map((row) => mapBoardRow(row)!);
    }
    async createBoard(projectId: string, input: CreateBoardInput): Promise<BoardRecord> {
        validateTitle(input.title);
        const now = new Date().toISOString();
        return runInWriteTransaction(this.client, async (tx) => {
            const project = await loadProjectState(tx, projectId);
            const projectState = project ? resolveLifecycleState(project) : null;
            if (!project) {
                throw new AncestorNotActiveError("create", `Project ${projectId} tidak ditemukan`);
            }
            const milestone = await tx.execute("SELECT id, archived_at, deleted_at FROM milestones WHERE id = ?", [input.milestoneId]);
            const milestoneRow = milestone.rows[0];
            if (!milestoneRow) {
                throw new MilestoneNotFoundError(input.milestoneId);
            }
            const milestoneState = resolveLifecycleState({
                archivedAt: milestoneRow.archived_at === null ? null : String(milestoneRow.archived_at),
                deletedAt: milestoneRow.deleted_at === null ? null : String(milestoneRow.deleted_at),
            });
            if (!isEffectivelyOperational([milestoneState, projectState!])) {
                const blocker = milestoneState !== "ACTIVE" ? `Milestone ${input.milestoneId} (${milestoneState})` : `Project (${projectState})`;
                throw new AncestorNotActiveError("create", `Ancestor tidak ACTIVE: ${blocker} — Board tidak dapat dibuat (INV-LIFE-001)`);
            }
            await tx.execute("INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, 1)", [input.id, input.milestoneId, input.title, input.description, now, now]);
            await tx.execute("INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, 'board', ?, 1, ?, 'board.created', ?, ?)", [ulid(), input.id, input.actorUserId, JSON.stringify({ snapshot: { title: input.title } }), now]);
            return {
                id: input.id,
                milestoneId: input.milestoneId,
                title: input.title,
                description: input.description,
                createdAt: now,
                updatedAt: now,
                archivedAt: null,
                deletedAt: null,
                version: 1,
            };
        });
    }
    async updateBoard(projectId: string, input: UpdateBoardInput): Promise<BoardRecord> {
        return this.commitMutation(projectId, input, "update");
    }
    async archiveBoard(projectId: string, input: BoardLifecycleInput): Promise<BoardRecord> {
        return this.commitMutation(projectId, input, "archive");
    }
    async restoreBoard(projectId: string, input: BoardLifecycleInput): Promise<BoardRecord> {
        return this.commitMutation(projectId, input, "restore");
    }
    async deleteBoard(projectId: string, input: BoardLifecycleInput): Promise<BoardRecord> {
        return this.commitMutation(projectId, input, "delete");
    }
    private async commitMutation(projectId: string, input: BoardLifecycleInput | UpdateBoardInput, operation: LifecycleOperation): Promise<BoardRecord> {
        return runInWriteTransaction(this.client, async (tx) => {
            const loaded = await loadBoardForUpdate(tx, input.boardId);
            if (loaded.current.version !== input.expectedVersion) {
                throw new BoardVersionConflictError(input.expectedVersion, loaded.current.version);
            }
            if (!LIFECYCLE_ALLOWED_FROM[operation].includes(loaded.lifecycleBefore)) {
                throw new BoardInvalidStateError(operation, loaded.lifecycleBefore);
            }
            const project = await loadProjectState(tx, projectId);
            const projectBefore = project ? resolveLifecycleState(project) : ("DELETED" as LifecycleState);
            const milestoneRow = (await tx.execute("SELECT archived_at, deleted_at FROM milestones WHERE id = ?", [loaded.current.milestoneId])).rows[0];
            const milestoneBefore = milestoneRow
                ? resolveLifecycleState({
                    archivedAt: milestoneRow.archived_at === null ? null : String(milestoneRow.archived_at),
                    deletedAt: milestoneRow.deleted_at === null ? null : String(milestoneRow.deleted_at),
                })
                : ("DELETED" as LifecycleState);
            if (!isEffectivelyOperational([milestoneBefore, projectBefore])) {
                const blocker = milestoneBefore !== "ACTIVE"
                    ? `Milestone ${loaded.current.milestoneId} (${milestoneBefore})`
                    : `Project (${projectBefore})`;
                throw new AncestorNotActiveError(operation, `Ancestor tidak ACTIVE: ${blocker} — Board tidak dapat menerima operasi ${operation} (INV-LIFE-001)`);
            }
            const now = new Date().toISOString();
            const next: BoardRecord = { ...loaded.current };
            let action: string;
            let data: Record<string, unknown>;
            if (operation === "update") {
                const patch = input as UpdateBoardInput;
                const changes: Record<string, {
                    before: unknown;
                    after: unknown;
                }> = {};
                if (patch.title !== undefined) {
                    validateTitle(patch.title);
                    if (next.title !== patch.title)
                        changes.title = { before: next.title, after: patch.title };
                    next.title = patch.title;
                }
                if (patch.description !== undefined) {
                    if (next.description !== patch.description) {
                        changes.description = { before: next.description, after: patch.description };
                    }
                    next.description = patch.description;
                }
                if (Object.keys(changes).length === 0) {
                    throw new BoardValidationError("Tidak ada field yang diubah");
                }
                action = "board.updated";
                data = { changes };
            }
            else if (operation === "archive") {
                next.archivedAt = now;
                action = "board.archived";
                data = { previousState: "ACTIVE" };
            }
            else if (operation === "restore") {
                const decision = evaluateRestore(loaded.lifecycleBefore, [milestoneBefore, projectBefore]);
                if (!decision.allowed) {
                    const blockerName = decision.reason === "ANCESTOR_NOT_ACTIVE"
                        ? decision.blockingAncestorIndex === 0
                            ? `Milestone ${loaded.current.milestoneId}`
                            : "Project"
                        : null;
                    throw new AncestorNotActiveError("restore", decision.reason === "ANCESTOR_NOT_ACTIVE"
                        ? `Restore ditolak: ${blockerName} dalam state ${String(decision.ancestorState)} — pulihkan ancestor lebih dulu (INV-LIFE-002)`
                        : "Restore ditolak: entity DELETED bersifat terminal (INV-LIFE-004)");
                }
                next.archivedAt = null;
                action = "board.restored";
                data = { previousState: "ARCHIVED" };
            }
            else {
                next.deletedAt = now;
                action = "board.deleted";
                data = { previousState: loaded.lifecycleBefore };
            }
            const nextVersion = loaded.current.version + 1;
            await tx.execute("UPDATE boards SET title = ?, description = ?, archived_at = ?, deleted_at = ?, updated_at = ?, version = ? WHERE id = ? AND version = ?", [
                next.title,
                next.description,
                next.archivedAt,
                next.deletedAt,
                now,
                nextVersion,
                input.boardId,
                input.expectedVersion,
            ]);
            await tx.execute("INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, 'board', ?, ?, ?, ?, ?, ?)", [ulid(), input.boardId, nextVersion, input.actorUserId, action, JSON.stringify(data), now]);
            return { ...next, updatedAt: now, version: nextVersion };
        });
    }
}
function mapBoardRow(row: Record<string, unknown> | undefined): BoardRecord | undefined {
    if (!row)
        return undefined;
    return {
        id: String(row.id),
        milestoneId: String(row.milestone_id),
        title: String(row.title),
        description: row.description === null ? null : String(row.description),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        archivedAt: row.archived_at === null ? null : String(row.archived_at),
        deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
        version: Number(row.version),
    };
}
async function loadProjectState(tx: Tx, projectId: string) {
    const result = await tx.execute("SELECT project_id, name, created_at, updated_at, archived_at, deleted_at, version FROM project_state WHERE project_id = ?", [projectId]);
    const row = result.rows[0];
    if (!row)
        return undefined;
    return {
        projectId: String(row.project_id),
        name: String(row.name),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        archivedAt: row.archived_at === null ? null : String(row.archived_at),
        deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
        version: Number(row.version),
    };
}
async function loadBoardForUpdate(tx: Tx, boardId: string): Promise<LoadedBoard> {
    const result = await tx.execute("SELECT id, milestone_id, title, description, created_at, updated_at, archived_at, deleted_at, version FROM boards WHERE id = ?", [boardId]);
    const current = mapBoardRow(result.rows[0]);
    if (!current)
        throw new BoardNotFoundError(boardId);
    return { current, lifecycleBefore: resolveLifecycleState(current) };
}
function validateTitle(title: string): void {
    if (typeof title !== "string" || title.trim().length === 0) {
        throw new BoardValidationError("Title Board wajib diisi");
    }
}
