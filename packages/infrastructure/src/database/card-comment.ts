import type { Client } from "@libsql/client";
import { ulid } from "ulid";
import {
  AncestorNotActiveError,
  CardInvalidStateError,
  CardNotFoundError,
  CardValidationError,
  isEffectivelyOperational,
  resolveLifecycleState,
  type LifecycleState,
} from "@kanban/domain";
import { runInWriteTransaction, type Tx } from "./transaction.ts";

/**
 * TASK-3.11/3.12 (02-SPEC C.10) — Comment adalah Activity Card (BR-030), TIDAK
 * ada tabel Comment terpisah (03-ENG B.3). Comment tidak mengubah `version`
 * Card (bukan field Card) — `entity_version` pada Activity mencatat versi
 * Card SAAT ITU, murni informasional.
 */

export interface CardCommentRecord {
  id: string;
  cardId: string;
  entityVersion: number;
  actorUserId: string;
  body: string;
  commentActivityId: string;
  createdAt: string;
}

interface CardAncestorContext {
  cardVersion: number;
  cardState: LifecycleState;
  upperStates: LifecycleState[];
}

async function loadCardAncestorContext(tx: Tx, cardId: string): Promise<CardAncestorContext> {
  const cardRow = (
    await tx.execute("SELECT list_id, archived_at, deleted_at, version FROM cards WHERE id = ?", [cardId])
  ).rows[0];
  if (!cardRow) throw new CardNotFoundError(cardId);

  const stateOf = (row: Record<string, unknown>): LifecycleState =>
    resolveLifecycleState({
      archivedAt: row.archived_at === null ? null : String(row.archived_at),
      deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
    });

  const listRow = (
    await tx.execute("SELECT board_id, archived_at, deleted_at FROM lists WHERE id = ?", [String(cardRow.list_id)])
  ).rows[0];
  const listState: LifecycleState = listRow ? stateOf(listRow) : "DELETED";

  let boardState: LifecycleState = "DELETED";
  let milestoneState: LifecycleState = "DELETED";
  if (listRow) {
    const boardRow = (
      await tx.execute("SELECT milestone_id, archived_at, deleted_at FROM boards WHERE id = ?", [
        String(listRow.board_id),
      ])
    ).rows[0];
    if (boardRow) {
      boardState = stateOf(boardRow);
      const milestoneRaw = boardRow.milestone_id === null ? null : String(boardRow.milestone_id);
      if (milestoneRaw !== null) {
        const msRow = (
          await tx.execute("SELECT archived_at, deleted_at FROM milestones WHERE id = ?", [milestoneRaw])
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
    upperStates: [listState, boardState, milestoneState, projectState],
  };
}

function validateBody(body: unknown): string {
  if (typeof body !== "string" || body.trim().length === 0) {
    throw new CardValidationError("Field body wajib string non-kosong.");
  }
  return body;
}

/** BR-030/033/034 — validasi state Card SAAT request diproses, bukan snapshot UI. */
function assertCardEffectivelyActive(operation: string, ctx: CardAncestorContext): void {
  if (ctx.cardState !== "ACTIVE") {
    throw new CardInvalidStateError(operation, ctx.cardState);
  }
  if (!isEffectivelyOperational([ctx.cardState, ...ctx.upperStates])) {
    throw new AncestorNotActiveError(
      operation,
      `Ancestor tidak ACTIVE — Card tidak dapat menerima ${operation} (INV-LIFE-001)`,
    );
  }
}

export async function addComment(
  client: Client,
  cardId: string,
  body: unknown,
  actorUserId: string,
): Promise<CardCommentRecord> {
  const validatedBody = validateBody(body);
  return runInWriteTransaction(client, async (tx) => {
    const ctx = await loadCardAncestorContext(tx, cardId);
    assertCardEffectivelyActive("comment", ctx);

    const id = ulid();
    const now = new Date().toISOString();
    await tx.execute(
      "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, 'card', ?, ?, ?, 'comment.added', ?, ?)",
      [id, cardId, ctx.cardVersion, actorUserId, JSON.stringify({ body: validatedBody }), now],
    );
    return {
      id,
      cardId,
      entityVersion: ctx.cardVersion,
      actorUserId,
      body: validatedBody,
      commentActivityId: id,
      createdAt: now,
    };
  });
}
