import type { Client } from "@libsql/client";
import { ulid } from "ulid";
import type { CreateListInput, LifecycleState, ListLifecycleInput, ListRecord, ListRepository, UpdateListInput, } from "@kanban/domain";
import { AncestorNotActiveError, evaluateRestore, isEffectivelyOperational, resolveLifecycleState, BoardNotFoundError, ListInvalidStateError, ListNotFoundError, ListValidationError, ListVersionConflictError, } from "@kanban/domain";
import { runInWriteTransaction, type Tx } from "./transaction.ts";
type LifecycleOperation = "update" | "archive" | "restore" | "delete";
const LIFECYCLE_ALLOWED_FROM: Record<LifecycleOperation, readonly LifecycleState[]> = {
    update: ["ACTIVE"],
    archive: ["ACTIVE"],
    restore: ["ARCHIVED"],
    delete: ["ACTIVE", "ARCHIVED"],
};
interface LoadedState {
    boardState: LifecycleState;
    upperStates: LifecycleState[];
}
export class DrizzleListRepository implements ListRepository {
    private readonly client: Client;
    constructor(client: Client) {
        this.client = client;
    }
    async getList(projectId: string, listId: string): Promise<ListRecord | undefined> {
        void projectId;
        const result = await this.client.execute("SELECT id, board_id, title, created_at, updated_at, archived_at, deleted_at, version FROM lists WHERE id = ?", [listId]);
        return mapListRow(result.rows[0]);
    }
    async listLists(boardId: string): Promise<ListRecord[]> {
        const result = await this.client.execute("SELECT id, board_id, title, created_at, updated_at, archived_at, deleted_at, version FROM lists WHERE board_id = ? ORDER BY created_at, id", [boardId]);
        return result.rows.map((row) => mapListRow(row)!);
    }
    async createList(projectId: string, input: CreateListInput): Promise<ListRecord> {
        validateTitle(input.title);
        const now = new Date().toISOString();
        return runInWriteTransaction(this.client, async (tx) => {
            const chain = await loadAncestorStates(tx, input.boardId);
            if (!isEffectivelyOperational([chain.boardState, ...chain.upperStates])) {
                throw new AncestorNotActiveError("create", `Ancestor tidak ACTIVE — List tidak dapat dibuat di bawah Board ${input.boardId} (INV-LIFE-001)`);
            }
            await tx.execute("INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, 1)", [input.id, input.boardId, input.title, now, now]);
            await tx.execute("INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, 'list', ?, 1, ?, 'list.created', ?, ?)", [ulid(), input.id, input.actorUserId, JSON.stringify({ snapshot: { title: input.title } }), now]);
            return {
                id: input.id,
                boardId: input.boardId,
                title: input.title,
                createdAt: now,
                updatedAt: now,
                archivedAt: null,
                deletedAt: null,
                version: 1,
            };
        });
    }
    async updateList(projectId: string, input: UpdateListInput): Promise<ListRecord> {
        return this.commitMutation(projectId, input, "update");
    }
    async archiveList(projectId: string, input: ListLifecycleInput): Promise<ListRecord> {
        return this.commitMutation(projectId, input, "archive");
    }
    async restoreList(projectId: string, input: ListLifecycleInput): Promise<ListRecord> {
        return this.commitMutation(projectId, input, "restore");
    }
    async deleteList(projectId: string, input: ListLifecycleInput): Promise<ListRecord> {
        return this.commitMutation(projectId, input, "delete");
    }
    private async commitMutation(projectId: string, input: ListLifecycleInput | UpdateListInput, operation: LifecycleOperation): Promise<ListRecord> {
        return runInWriteTransaction(this.client, async (tx) => {
            const loaded = await loadListForUpdate(tx, input.listId);
            if (loaded.current.version !== input.expectedVersion) {
                throw new ListVersionConflictError(input.expectedVersion, loaded.current.version);
            }
            if (!LIFECYCLE_ALLOWED_FROM[operation].includes(loaded.lifecycleBefore)) {
                throw new ListInvalidStateError(operation, loaded.lifecycleBefore);
            }
            const chain = await loadAncestorStates(tx, loaded.current.boardId);
            if (!chain || !isEffectivelyOperational([chain.boardState, ...chain.upperStates])) {
                throw new AncestorNotActiveError(operation, `Ancestor tidak ACTIVE — List tidak dapat menerima operasi ${operation} (INV-LIFE-001)`);
            }
            const now = new Date().toISOString();
            const next: ListRecord = { ...loaded.current };
            let action: string;
            let data: Record<string, unknown>;
            if (operation === "update") {
                const patch = input as UpdateListInput;
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
                if (Object.keys(changes).length === 0) {
                    throw new ListValidationError("Tidak ada field yang diubah");
                }
                action = "list.updated";
                data = { changes };
            }
            else if (operation === "archive") {
                next.archivedAt = now;
                action = "list.archived";
                data = { previousState: "ACTIVE" };
            }
            else if (operation === "restore") {
                const decision = evaluateRestore(loaded.lifecycleBefore, [chain.boardState, ...chain.upperStates]);
                if (!decision.allowed) {
                    throw new AncestorNotActiveError("restore", decision.reason === "ANCESTOR_NOT_ACTIVE"
                        ? `Restore ditolak: ancestor level ${decision.blockingAncestorIndex + 1} dalam state ${String(decision.ancestorState)} — pulihkan ancestor lebih dulu (INV-LIFE-002)`
                        : "Restore ditolak: entity DELETED bersifat terminal (INV-LIFE-004)");
                }
                next.archivedAt = null;
                action = "list.restored";
                data = { previousState: "ARCHIVED" };
            }
            else {
                next.deletedAt = now;
                action = "list.deleted";
                data = { previousState: loaded.lifecycleBefore };
            }
            const nextVersion = loaded.current.version + 1;
            await tx.execute("UPDATE lists SET title = ?, archived_at = ?, deleted_at = ?, updated_at = ?, version = ? WHERE id = ? AND version = ?", [next.title, next.archivedAt, next.deletedAt, now, nextVersion, input.listId, input.expectedVersion]);
            await tx.execute("INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, 'list', ?, ?, ?, ?, ?, ?)", [ulid(), input.listId, nextVersion, input.actorUserId, action, JSON.stringify(data), now]);
            return { ...next, updatedAt: now, version: nextVersion };
        });
    }
}
function mapListRow(row: Record<string, unknown> | undefined): ListRecord | undefined {
    if (!row)
        return undefined;
    return {
        id: String(row.id),
        boardId: String(row.board_id),
        title: String(row.title),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        archivedAt: row.archived_at === null ? null : String(row.archived_at),
        deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
        version: Number(row.version),
    };
}
async function loadAncestorStates(tx: Tx, boardId: string): Promise<LoadedState> {
    const boardRow = (await tx.execute("SELECT milestone_id, archived_at, deleted_at FROM boards WHERE id = ?", [boardId])).rows[0];
    if (!boardRow)
        throw new BoardNotFoundError(boardId);
    const milestoneId = boardRow.milestone_id !== null && boardRow.milestone_id !== undefined
        ? String(boardRow.milestone_id)
        : null;
    const upperStates: LifecycleState[] = [];
    if (milestoneId !== null) {
        const msRow = (await tx.execute("SELECT archived_at, deleted_at FROM milestones WHERE id = ?", [milestoneId])).rows[0];
        const msState = msRow
            ? resolveLifecycleState({
                archivedAt: msRow.archived_at === null ? null : String(msRow.archived_at),
                deletedAt: msRow.deleted_at === null ? null : String(msRow.deleted_at),
            })
            : "DELETED";
        upperStates.push(msState);
    }
    const projRow = (await tx.execute("SELECT archived_at, deleted_at FROM project_state LIMIT 1")).rows[0];
    const projState = projRow
        ? resolveLifecycleState({
            archivedAt: projRow.archived_at === null ? null : String(projRow.archived_at),
            deletedAt: projRow.deleted_at === null ? null : String(projRow.deleted_at),
        })
        : "DELETED";
    upperStates.push(projState);
    const boardState = resolveLifecycleState({
        archivedAt: boardRow.archived_at === null ? null : String(boardRow.archived_at),
        deletedAt: boardRow.deleted_at === null ? null : String(boardRow.deleted_at),
    });
    return { boardState, upperStates };
}
async function loadListForUpdate(tx: Tx, listId: string): Promise<{
    current: ListRecord;
    lifecycleBefore: LifecycleState;
}> {
    const result = await tx.execute("SELECT id, board_id, title, created_at, updated_at, archived_at, deleted_at, version FROM lists WHERE id = ?", [listId]);
    const current = mapListRow(result.rows[0]);
    if (!current)
        throw new ListNotFoundError(listId);
    return { current, lifecycleBefore: resolveLifecycleState(current) };
}
function validateTitle(title: string): void {
    if (typeof title !== "string" || title.trim().length === 0) {
        throw new ListValidationError("Title List wajib diisi");
    }
}
