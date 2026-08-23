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

async function selectRows(
  tx: Tx,
  sql: string,
): Promise<EntityRow[]> {
  const result = await tx.execute(sql);
  return result.rows.map((row) => ({
    id: String(row.id),
    parentId: row.parent_id === null || row.parent_id === undefined ? null : String(row.parent_id),
    deletedAt: row.deleted_at === null || row.deleted_at === undefined ? null : String(row.deleted_at),
  }));
}

/**
 * Physical prune subtree DELETED >= 30 hari (BR-016/016A) dalam SATU Project DB.
 *
 * Aturan pelaksanaan:
 * - Eligibility per-entity independen (Prinsip #4) — TAPI begitu sebuah root
 *   diputuskan prune, SELURUH descendant ikut terhapus fisik TERLEPAS
 *   `deleted_at`-nya sendiri (tidak ada descendant "selamat" dari ancestor
 *   yang sudah hilang).
 * - Urutan hapus leaf-to-root tanpa ON DELETE CASCADE (Review-CL-03 poin 2):
 *   junction → activities (termasuk Comment) → cards → lists → boards →
 *   milestones → labels.
 * - SATU transaksi — gagal di tengah = rollback penuh, tidak ada partial-prune.
 */
export async function pruneDescendantSubtrees(
  projectClient: Client,
  now: Date = new Date(),
): Promise<PruneResult> {
  return runInWriteTransaction(projectClient, async (tx) => {
    // (1) Kumpulkan kandidat + tentukan set akhir per level (parent-chain expansion).
    const milestoneRows = await selectRows(tx, "SELECT id, NULL AS parent_id, deleted_at FROM milestones");
    const boardRows = await selectRows(tx, "SELECT id, milestone_id AS parent_id, deleted_at FROM boards");
    const listRows = await selectRows(tx, "SELECT id, board_id AS parent_id, deleted_at FROM lists");
    const cardRows = await selectRows(tx, "SELECT id, list_id AS parent_id, deleted_at FROM cards");
    const msLabelRows = await selectRows(tx, "SELECT id, milestone_id AS parent_id, deleted_at FROM milestone_labels");
    const bdLabelRows = await selectRows(tx, "SELECT id, board_id AS parent_id, deleted_at FROM board_labels");

    const eligibleOwn = (rows: EntityRow[]): Set<string> =>
      new Set(rows.filter((r) => isPruneEligible(r.deletedAt, now)).map((r) => r.id));

    const msIds = eligibleOwn(milestoneRows);
    const bdIds = new Set([
      ...eligibleOwn(boardRows),
      ...boardRows.filter((r) => r.parentId !== null && msIds.has(r.parentId)).map((r) => r.id),
    ]);
    const lsIds = new Set([
      ...eligibleOwn(listRows),
      ...listRows.filter((r) => r.parentId !== null && bdIds.has(r.parentId)).map((r) => r.id),
    ]);
    const cdIds = new Set([
      ...eligibleOwn(cardRows),
      ...cardRows.filter((r) => r.parentId !== null && lsIds.has(r.parentId)).map((r) => r.id),
    ]);
    const mlIds = new Set([
      ...eligibleOwn(msLabelRows),
      ...msLabelRows.filter((r) => r.parentId !== null && msIds.has(r.parentId)).map((r) => r.id),
    ]);
    const blIds = new Set([
      ...eligibleOwn(bdLabelRows),
      ...bdLabelRows.filter((r) => r.parentId !== null && bdIds.has(r.parentId)).map((r) => r.id),
    ]);

    if (
      msIds.size === 0 &&
      bdIds.size === 0 &&
      lsIds.size === 0 &&
      cdIds.size === 0 &&
      mlIds.size === 0 &&
      blIds.size === 0
    ) {
      return { milestones: 0, boards: 0, lists: 0, cards: 0, labels: 0 };
    }

    // (2) Junction label-card — by label_id ATAU card_id match.
    for (const [table, labelIds] of [
      ["card_milestone_labels", mlIds],
      ["card_board_labels", blIds],
    ] as const) {
      await deleteByInClause(tx, table, "label_id", [...labelIds]);
      await deleteByInClause(tx, table, "card_id", [...cdIds]);
    }

    // (3) Activities seluruh entity type yang terdampak (termasuk Comment).
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

    // (4) Entity leaf-to-root — label SEBELUM parent-nya (FK milestone_labels→
    // milestones, board_labels→boards; urutan literal teks goal melanggar FK,
    // mengikuti panduan Review-CL-03 poin 2).
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

/** DELETE fisik dengan guard IN-list kosong; entityType opsional untuk tabel activities. */
async function deleteByInClause(
  tx: Tx,
  table: string,
  column: string,
  ids: string[],
  entityType?: string,
): Promise<number> {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(", ");
  if (table === "activities" && entityType !== undefined) {
    return Number(
      (
        await tx.execute(
          `DELETE FROM activities WHERE entity_type = ? AND entity_id IN (${placeholders})`,
          [entityType, ...ids],
        )
      ).rowsAffected ?? 0,
    );
  }
  const result = await tx.execute(`DELETE FROM ${table} WHERE ${column} IN (${placeholders})`, ids);
  return Number(result.rowsAffected ?? 0);
}
