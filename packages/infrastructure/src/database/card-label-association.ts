import type { Client } from "@libsql/client";
import { ulid } from "ulid";
import {
  AncestorNotActiveError,
  CardInvalidStateError,
  CardNotFoundError,
  isEffectivelyOperational,
  resolveLifecycleState,
  type LifecycleState,
} from "@kanban/domain";
import { PipelineError } from "../pipeline/errors.ts";
import { runInWriteTransaction, type Tx } from "./transaction.ts";

/**
 * TASK-3.7 (02-SPEC C.11, FR-032/033/034) — assign/remove Label ke Card.
 * Server menentukan scope (milestone_labels vs board_labels) dari labelId,
 * TIDAK ada permission tersendiri (menumpang card.update, Prinsip #4).
 * Histori dipertahankan (FR-033) — assign ulang setelah remove membuat
 * baris BARU, tidak pernah UPDATE baris lama yang sudah removed_at.
 */

export type LabelScope = "milestone" | "board";

export interface CardLabelAssociationRecord {
  cardId: string;
  labelId: string;
  labelScope: LabelScope;
  labelName: string;
  createdAt: string;
}

interface CardPosition {
  cardVersion: number;
  cardState: LifecycleState;
  listId: string;
  boardId: string | null;
  milestoneId: string | null;
  upperStates: LifecycleState[];
}

function stateOf(row: Record<string, unknown>): LifecycleState {
  return resolveLifecycleState({
    archivedAt: row.archived_at === null ? null : String(row.archived_at),
    deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
  });
}

async function loadCardPosition(tx: Tx, cardId: string): Promise<CardPosition> {
  const cardRow = (
    await tx.execute("SELECT list_id, archived_at, deleted_at, version FROM cards WHERE id = ?", [cardId])
  ).rows[0];
  if (!cardRow) throw new CardNotFoundError(cardId);

  const listId = String(cardRow.list_id);
  const listRow = (
    await tx.execute("SELECT board_id, archived_at, deleted_at FROM lists WHERE id = ?", [listId])
  ).rows[0];
  const listState: LifecycleState = listRow ? stateOf(listRow) : "DELETED";

  let boardId: string | null = null;
  let boardState: LifecycleState = "DELETED";
  let milestoneId: string | null = null;
  let milestoneState: LifecycleState = "DELETED";
  if (listRow) {
    boardId = String(listRow.board_id);
    const boardRow = (
      await tx.execute("SELECT milestone_id, archived_at, deleted_at FROM boards WHERE id = ?", [boardId])
    ).rows[0];
    if (boardRow) {
      boardState = stateOf(boardRow);
      milestoneId = boardRow.milestone_id === null ? null : String(boardRow.milestone_id);
      if (milestoneId !== null) {
        const msRow = (
          await tx.execute("SELECT archived_at, deleted_at FROM milestones WHERE id = ?", [milestoneId])
        ).rows[0];
        milestoneState = msRow ? stateOf(msRow) : "DELETED";
      }
    }
  }

  const projRow = (await tx.execute("SELECT archived_at, deleted_at FROM project_state LIMIT 1")).rows[0];
  const projectState: LifecycleState = projRow ? stateOf(projRow) : "DELETED";

  return {
    cardVersion: Number(cardRow.version),
    cardState: stateOf(cardRow),
    listId,
    boardId,
    milestoneId,
    upperStates: [listState, boardState, milestoneState, projectState],
  };
}

function assertCardOperational(operation: string, position: CardPosition): void {
  if (position.cardState !== "ACTIVE") {
    throw new CardInvalidStateError(operation, position.cardState);
  }
  if (!isEffectivelyOperational([position.cardState, ...position.upperStates])) {
    throw new AncestorNotActiveError(
      operation,
      `Ancestor tidak ACTIVE — Card tidak dapat menerima ${operation} (INV-LIFE-001)`,
    );
  }
}

interface ResolvedLabel {
  scope: LabelScope;
  name: string;
}

/** Server menentukan scope (C.11) — cek milestone_labels dulu, lalu board_labels. */
async function resolveLabel(tx: Tx, labelId: string, position: CardPosition): Promise<ResolvedLabel> {
  const msLabel = (
    await tx.execute("SELECT milestone_id, name, archived_at, deleted_at FROM milestone_labels WHERE id = ?", [
      labelId,
    ])
  ).rows[0];
  if (msLabel) {
    if (stateOf(msLabel) !== "ACTIVE") {
      throw new PipelineError("INVALID_STATE", `Milestone Label ${labelId} tidak aktif (FR-034).`, 409);
    }
    if (String(msLabel.milestone_id) !== position.milestoneId) {
      throw new PipelineError(
        "INVALID_STATE",
        `Milestone Label ${labelId} bukan milik Milestone posisi Card saat ini.`,
        409,
      );
    }
    return { scope: "milestone", name: String(msLabel.name) };
  }

  const bdLabel = (
    await tx.execute("SELECT board_id, name, archived_at, deleted_at FROM board_labels WHERE id = ?", [labelId])
  ).rows[0];
  if (bdLabel) {
    if (stateOf(bdLabel) !== "ACTIVE") {
      throw new PipelineError("INVALID_STATE", `Board Label ${labelId} tidak aktif (FR-034).`, 409);
    }
    if (String(bdLabel.board_id) !== position.boardId) {
      throw new PipelineError("INVALID_STATE", `Board Label ${labelId} bukan milik Board posisi Card saat ini.`, 409);
    }
    return { scope: "board", name: String(bdLabel.name) };
  }

  throw new PipelineError("RESOURCE_NOT_FOUND", `Label ${labelId} tidak ditemukan.`, 404);
}

function junctionTable(scope: LabelScope): string {
  return scope === "milestone" ? "card_milestone_labels" : "card_board_labels";
}

export async function assignLabelToCard(
  client: Client,
  cardId: string,
  labelId: string,
  actorUserId: string,
): Promise<CardLabelAssociationRecord> {
  return runInWriteTransaction(client, async (tx) => {
    const position = await loadCardPosition(tx, cardId);
    assertCardOperational("card.update", position);
    const label = await resolveLabel(tx, labelId, position);

    const table = junctionTable(label.scope);
    const active = (
      await tx.execute(`SELECT 1 FROM ${table} WHERE card_id = ? AND label_id = ? AND removed_at IS NULL`, [
        cardId,
        labelId,
      ])
    ).rows[0];
    if (active) {
      throw new PipelineError("INVALID_STATE", `Label ${labelId} sudah ter-assign ke Card ${cardId}.`, 409);
    }

    const now = new Date().toISOString();
    await tx.execute(`INSERT INTO ${table} (card_id, label_id, created_at, removed_at) VALUES (?, ?, ?, NULL)`, [
      cardId,
      labelId,
      now,
    ]);
    await tx.execute(
      "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, 'card', ?, ?, ?, 'label.added', ?, ?)",
      [
        ulid(),
        cardId,
        position.cardVersion,
        actorUserId,
        JSON.stringify({ label_id: labelId, label_scope: label.scope, label_name: label.name }),
        now,
      ],
    );
    return { cardId, labelId, labelScope: label.scope, labelName: label.name, createdAt: now };
  });
}

export async function removeLabelFromCard(
  client: Client,
  cardId: string,
  labelId: string,
  actorUserId: string,
): Promise<CardLabelAssociationRecord> {
  return runInWriteTransaction(client, async (tx) => {
    const position = await loadCardPosition(tx, cardId);
    assertCardOperational("card.update", position);
    const label = await resolveLabel(tx, labelId, position);

    const table = junctionTable(label.scope);
    const activeRow = (
      await tx.execute(`SELECT created_at FROM ${table} WHERE card_id = ? AND label_id = ? AND removed_at IS NULL`, [
        cardId,
        labelId,
      ])
    ).rows[0];
    if (!activeRow) {
      throw new PipelineError(
        "RESOURCE_NOT_FOUND",
        `Tidak ada asosiasi aktif Label ${labelId} pada Card ${cardId}.`,
        404,
      );
    }

    const now = new Date().toISOString();
    await tx.execute(`UPDATE ${table} SET removed_at = ? WHERE card_id = ? AND label_id = ? AND removed_at IS NULL`, [
      now,
      cardId,
      labelId,
    ]);
    await tx.execute(
      "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, 'card', ?, ?, ?, 'label.removed', ?, ?)",
      [
        ulid(),
        cardId,
        position.cardVersion,
        actorUserId,
        JSON.stringify({ label_id: labelId, label_scope: label.scope, label_name: label.name }),
        now,
      ],
    );
    return { cardId, labelId, labelScope: label.scope, labelName: label.name, createdAt: String(activeRow.created_at) };
  });
}
