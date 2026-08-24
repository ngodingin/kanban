import type { Client } from "@libsql/client";
import { isPruneEligible } from "@kanban/domain";
import { runInWriteTransaction, type Tx } from "./transaction.ts";
export interface PruneResult {
    milestones: number;
    boards: number;
    lists: number;
    cards: number;
    labels: number;
}
interface EntityRow {
    id: string;
    parentId: string | null;
    deletedAt: string | null;
}
async function selectRows(tx: Tx, sql: string, params: string[] = []): Promise<EntityRow[]> {
    const result = await tx.execute(sql, params);
    return result.rows.map((row) => ({
        id: String(row.id),
        parentId: row.parent_id === null || row.parent_id === undefined ? null : String(row.parent_id),
        deletedAt: row.deleted_at === null || row.deleted_at === undefined ? null : String(row.deleted_at),
    }));
}
async function selectCandidateRows(tx: Tx, table: string, parentColumn: string | null, parentIds: Set<string>): Promise<EntityRow[]> {
    const parentSelect = parentColumn ?? "NULL";
    if (parentColumn === null || parentIds.size === 0) {
        return selectRows(tx, `SELECT id, ${parentSelect} AS parent_id, deleted_at FROM ${table} WHERE deleted_at IS NOT NULL`);
    }
    const placeholders = [...parentIds].map(() => "?").join(", ");
    return selectRows(tx, `SELECT id, ${parentSelect} AS parent_id, deleted_at FROM ${table} WHERE deleted_at IS NOT NULL OR ${parentColumn} IN (${placeholders})`, [...parentIds]);
}
export async function pruneDescendantSubtrees(projectClient: Client, now: Date = new Date()): Promise<PruneResult> {
    return runInWriteTransaction(projectClient, async (tx) => {
        const milestoneRows = await selectCandidateRows(tx, "milestones", null, new Set());
        const eligibleOwn = (rows: EntityRow[]): Set<string> => new Set(rows.filter((r) => isPruneEligible(r.deletedAt, now)).map((r) => r.id));
        const msIds = eligibleOwn(milestoneRows);
        const boardRows = await selectCandidateRows(tx, "boards", "milestone_id", msIds);
        const bdIds = new Set([
            ...eligibleOwn(boardRows),
            ...boardRows.filter((r) => r.parentId !== null && msIds.has(r.parentId)).map((r) => r.id),
        ]);
        const listRows = await selectCandidateRows(tx, "lists", "board_id", bdIds);
        const lsIds = new Set([
            ...eligibleOwn(listRows),
            ...listRows.filter((r) => r.parentId !== null && bdIds.has(r.parentId)).map((r) => r.id),
        ]);
        const cardRows = await selectCandidateRows(tx, "cards", "list_id", lsIds);
        const cdIds = new Set([
            ...eligibleOwn(cardRows),
            ...cardRows.filter((r) => r.parentId !== null && lsIds.has(r.parentId)).map((r) => r.id),
        ]);
        const msLabelRows = await selectCandidateRows(tx, "milestone_labels", "milestone_id", msIds);
        const mlIds = new Set([
            ...eligibleOwn(msLabelRows),
            ...msLabelRows.filter((r) => r.parentId !== null && msIds.has(r.parentId)).map((r) => r.id),
        ]);
        const bdLabelRows = await selectCandidateRows(tx, "board_labels", "board_id", bdIds);
        const blIds = new Set([
            ...eligibleOwn(bdLabelRows),
            ...bdLabelRows.filter((r) => r.parentId !== null && bdIds.has(r.parentId)).map((r) => r.id),
        ]);
        if (msIds.size === 0 &&
            bdIds.size === 0 &&
            lsIds.size === 0 &&
            cdIds.size === 0 &&
            mlIds.size === 0 &&
            blIds.size === 0) {
            return { milestones: 0, boards: 0, lists: 0, cards: 0, labels: 0 };
        }
        for (const [table, labelIds] of [
            ["card_milestone_labels", mlIds],
            ["card_board_labels", blIds],
        ] as const) {
            await deleteByInClause(tx, table, "label_id", [...labelIds]);
            await deleteByInClause(tx, table, "card_id", [...cdIds]);
        }
        for (const [entityType, ids] of [
            ["milestone", msIds],
            ["board", bdIds],
            ["list", lsIds],
            ["card", cdIds],
            ["milestone_label", mlIds],
            ["board_label", blIds],
        ] as const) {
            await deleteByInClause(tx, "activities", "entity_id", [...ids], entityType);
        }
        await deleteByInClause(tx, "cards", "id", [...cdIds]);
        await deleteByInClause(tx, "lists", "id", [...lsIds]);
        await deleteByInClause(tx, "milestone_labels", "id", [...mlIds]);
        await deleteByInClause(tx, "board_labels", "id", [...blIds]);
        await deleteByInClause(tx, "boards", "id", [...bdIds]);
        await deleteByInClause(tx, "milestones", "id", [...msIds]);
        return {
            milestones: msIds.size,
            boards: bdIds.size,
            lists: lsIds.size,
            cards: cdIds.size,
            labels: mlIds.size + blIds.size,
        };
    });
}
async function deleteByInClause(tx: Tx, table: string, column: string, ids: string[], entityType?: string): Promise<number> {
    if (ids.length === 0)
        return 0;
    const placeholders = ids.map(() => "?").join(", ");
    if (table === "activities" && entityType !== undefined) {
        return Number((await tx.execute(`DELETE FROM activities WHERE entity_type = ? AND entity_id IN (${placeholders})`, [entityType, ...ids])).rowsAffected ?? 0);
    }
    const result = await tx.execute(`DELETE FROM ${table} WHERE ${column} IN (${placeholders})`, ids);
    return Number(result.rowsAffected ?? 0);
}
