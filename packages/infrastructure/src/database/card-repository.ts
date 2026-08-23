import type { Client } from "@libsql/client";
import { ulid } from "ulid";
import type {
  CardLifecycleInput,
  CardRecord,
  CardRepository,
  CreateCardInput,
  LifecycleState,
  MoveCardInput,
  UpdateCardInput,
} from "@kanban/domain";
import {
  AncestorNotActiveError,
  InvalidDestinationError,
  ListNotFoundError,
  evaluateRestore,
  isEffectivelyOperational,
  resolveLifecycleState,
  CardInvalidStateError,
  CardNotFoundError,
  CardValidationError,
  CardVersionConflictError,
} from "@kanban/domain";
import { runInWriteTransaction, type Tx } from "./transaction.ts";

type LifecycleOperation = "update" | "archive" | "restore" | "delete";

/** State machine A.3 — interpretasi lifecycle tetap lewat effective-state (BR-012). */
const LIFECYCLE_ALLOWED_FROM: Record<LifecycleOperation, readonly LifecycleState[]> = {
  update: ["ACTIVE"],
  archive: ["ACTIVE"],
  restore: ["ARCHIVED"],
  delete: ["ACTIVE", "ARCHIVED"],
};

export interface DrizzleCardRepositoryDeps {
  /**
   * App-level FK lintas DB (03-ENG A.5): assignee wajib member aktif Project.
   * Produksi memakai requireActiveMember(globalClient, ...); test bisa inject.
   */
  assertAssigneeActiveMember(projectId: string, userId: string): Promise<void>;
}

interface LoadedCard {
  current: CardRecord;
  lifecycleBefore: LifecycleState;
}

export class DrizzleCardRepository implements CardRepository {
  private readonly client: Client;
  private readonly deps: DrizzleCardRepositoryDeps;

  constructor(client: Client, deps: DrizzleCardRepositoryDeps) {
    this.client = client;
    this.deps = deps;
  }

  async getCard(projectId: string, cardId: string): Promise<CardRecord | undefined> {
    void projectId;
    const result = await this.client.execute(
      "SELECT id, list_id, creator_user_id, assignee_user_id, title, subtitle, description, due_date, created_at, updated_at, archived_at, deleted_at, version FROM cards WHERE id = ?",
      [cardId],
    );
    return mapCardRow(result.rows[0]);
  }

  async createCard(projectId: string, input: CreateCardInput): Promise<CardRecord> {
    validateTitle(input.title);
    if (input.assigneeUserId !== null) {
      await this.deps.assertAssigneeActiveMember(projectId, input.assigneeUserId);
    }
    const now = new Date().toISOString();
    return runInWriteTransaction(this.client, async (tx) => {
      // INV-LIFE-001 — chain 4 level: List → Board → Milestone → Project semua ACTIVE.
      const chain = await loadListContext(tx, input.listId);
      if (!isEffectivelyOperational([chain.listState, ...chain.upperStates])) {
        throw new AncestorNotActiveError(
          "create",
          `Ancestor tidak ACTIVE — Card tidak dapat dibuat di bawah List ${input.listId} (INV-LIFE-001)`,
        );
      }
      await tx.execute(
        "INSERT INTO cards (id, list_id, creator_user_id, assignee_user_id, title, subtitle, description, due_date, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
        [input.id, input.listId, input.actorUserId, input.assigneeUserId, input.title, input.subtitle, input.description, input.dueDate, now, now],
      );
      // B.5 v1.0.2 — *.created membawa snapshot minimal denormalisasi.
      await tx.execute(
        "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, 'card', ?, 1, ?, 'card.created', ?, ?)",
        [
          ulid(),
          input.id,
          input.actorUserId,
          JSON.stringify({ snapshot: { title: input.title, creator_user_id: input.actorUserId } }),
          now,
        ],
      );
      return {
        id: input.id,
        listId: input.listId,
        creatorUserId: input.actorUserId,
        assigneeUserId: input.assigneeUserId,
        title: input.title,
        subtitle: input.subtitle,
        description: input.description,
        dueDate: input.dueDate,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        deletedAt: null,
        version: 1,
      };
    });
  }

  async updateCard(projectId: string, input: UpdateCardInput): Promise<CardRecord> {
    return this.commitMutation(projectId, input, "update");
  }

  async archiveCard(projectId: string, input: CardLifecycleInput): Promise<CardRecord> {
    return this.commitMutation(projectId, input, "archive");
  }

  async restoreCard(projectId: string, input: CardLifecycleInput): Promise<CardRecord> {
    return this.commitMutation(projectId, input, "restore");
  }

  async deleteCard(projectId: string, input: CardLifecycleInput): Promise<CardRecord> {
    return this.commitMutation(projectId, input, "delete");
  }

  /**
   * Move Card (TASK-2.10) — satu transaksi (INV-MOVE-004). Urutan validasi
   * wajib C.8: source ada & tidak DELETED → version check duluan (BR-021,
   * INV-MOVE tidak dievaluasi saat stale) → local ACTIVE (INV-LIFE-003) →
   * source chain operational (INV-LIFE-001) → destination valid (ada, sama
   * Project via isolation, ancestor ACTIVE — INV-MOVE-001/002) → milestone
   * equality (BR-018, business invariant murni) → UPDATE + Activity atomik.
   */
  async moveCard(projectId: string, input: MoveCardInput): Promise<CardRecord> {
    return runInWriteTransaction(this.client, async (tx) => {
      const loaded = await loadCardForUpdate(tx, input.cardId);
      if (loaded.lifecycleBefore === "DELETED") {
        throw new CardInvalidStateError("move", "DELETED");
      }
      if (loaded.current.version !== input.expectedVersion) {
        throw new CardVersionConflictError(input.expectedVersion, loaded.current.version);
      }
      if (loaded.lifecycleBefore !== "ACTIVE") {
        throw new CardInvalidStateError("move", loaded.lifecycleBefore);
      }

      const sourceChain = await loadListContext(tx, loaded.current.listId);
      if (!isEffectivelyOperational([sourceChain.listState, ...sourceChain.upperStates])) {
        throw new AncestorNotActiveError(
          "move",
          `Ancestor tidak ACTIVE — Card tidak dapat dipindahkan dari List ${loaded.current.listId} (INV-LIFE-001)`,
        );
      }

      const destination = await loadDestination(tx, input.destinationListId);      if (!isEffectivelyOperational([destination.listState, ...destination.upperStates])) {
        throw new InvalidDestinationError(
          `Destination List ${input.destinationListId} tidak operasional — seluruh ancestor harus ACTIVE (INV-MOVE-002)`,
        );
      }

      if (sourceChain.boardId !== destination.boardId && sourceChain.milestoneId !== destination.milestoneId) {
        throw new InvalidDestinationError(
          `Move antar Board hanya dalam Milestone sama: source ${sourceChain.milestoneId ?? "-"} vs destination ${destination.milestoneId ?? "-"} (BR-018)`,
        );
      }

      const now = new Date().toISOString();
      const nextVersion = loaded.current.version + 1;
      await tx.execute(
        "UPDATE cards SET list_id = ?, updated_at = ?, version = ? WHERE id = ? AND version = ?",
        [input.destinationListId, now, nextVersion, input.cardId, input.expectedVersion],
      );
      // B.5 v1.0.2 — card.moved membawa from/to denormalisasi (list+board).
      await tx.execute(
        "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, 'card', ?, ?, ?, 'card.moved', ?, ?)",
        [
          ulid(),
          input.cardId,
          nextVersion,
          input.actorUserId,
          JSON.stringify({
            from: { list_id: loaded.current.listId, list_title: sourceChain.title, board_id: sourceChain.boardId, board_title: sourceChain.boardTitle },
            to: { list_id: input.destinationListId, list_title: destination.title, board_id: destination.boardId, board_title: destination.boardTitle },
          }),
          now,
        ],
      );

      // TASK-3.7.2 — auto-orphan Board Label saat move lintas-Board (03-ENG
      // B.4 rationale, FR-033). Milestone tetap sama pada move valid
      // (invariant #5/BR-018), jadi card_milestone_labels TIDAK disentuh.
      // Atomik dengan move (transaksi sama, invariant #9) — kegagalan
      // orphan membatalkan move juga, bukan partial state.
      if (sourceChain.boardId !== destination.boardId) {
        const activeBoardLabels = await tx.execute(
          `SELECT cbl.label_id AS label_id, bl.name AS label_name
           FROM card_board_labels cbl
           JOIN board_labels bl ON bl.id = cbl.label_id
           WHERE cbl.card_id = ? AND cbl.removed_at IS NULL`,
          [input.cardId],
        );
        for (const row of activeBoardLabels.rows) {
          const labelId = String(row.label_id);
          await tx.execute(
            "UPDATE card_board_labels SET removed_at = ? WHERE card_id = ? AND label_id = ? AND removed_at IS NULL",
            [now, input.cardId, labelId],
          );
          await tx.execute(
            "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, 'card', ?, ?, ?, 'label.removed', ?, ?)",
            [
              ulid(),
              input.cardId,
              nextVersion,
              input.actorUserId,
              JSON.stringify({ label_id: labelId, label_scope: "board", label_name: String(row.label_name) }),
              now,
            ],
          );
        }
      }

      return {
        ...loaded.current,
        listId: input.destinationListId,
        updatedAt: now,
        version: nextVersion,
      };
    });
  }

  /**
   * Mutation inti Card CRUD (INV #7/#8/#9): version check (AC-020) → state
   * machine A.3 → assignee/ancestor validation → UPDATE terjaga
   * `AND version = expected` → Activity append dalam satu transaksi.
   * BR-017/061/062 — `list_id` TIDAK pernah disentuh di sini (move = TASK-2.10).
   * BR-045A — evaluasi murni dari state saat ini; tidak ada syarat aktor sama.
   */
  private async commitMutation(
    projectId: string,
    input: CardLifecycleInput | UpdateCardInput,
    operation: LifecycleOperation,
  ): Promise<CardRecord> {
    return runInWriteTransaction(this.client, async (tx) => {
      const loaded = await loadCardForUpdate(tx, input.cardId);
      if (loaded.current.version !== input.expectedVersion) {
        throw new CardVersionConflictError(input.expectedVersion, loaded.current.version);
      }
      if (!LIFECYCLE_ALLOWED_FROM[operation].includes(loaded.lifecycleBefore)) {
        throw new CardInvalidStateError(operation, loaded.lifecycleBefore);
      }
      // INV-LIFE-001 — entity non-operational (ada ancestor non-ACTIVE)
      // MUST NOT menerima mutasi apapun, termasuk update/archive/delete
      // (restore divalidasi terpisah via evaluateRestore).
      const chain = await loadListContext(tx, loaded.current.listId);
      if (!isEffectivelyOperational([chain.listState, ...chain.upperStates])) {
        throw new AncestorNotActiveError(
          operation,
          `Ancestor tidak ACTIVE — Card tidak dapat menerima operasi ${operation} (INV-LIFE-001)`,
        );
      }

      const now = new Date().toISOString();
      const next: CardRecord = { ...loaded.current };
      let action: string;
      let data: Record<string, unknown>;

      if (operation === "update") {
        const patch = input as UpdateCardInput;
        const changes: Record<string, { before: unknown; after: unknown }> = {};
        if (patch.title !== undefined) {
          validateTitle(patch.title);
          if (next.title !== patch.title) changes.title = { before: next.title, after: patch.title };
          next.title = patch.title;
        }
        applyOptionalField(changes, next, "subtitle", patch.subtitle);
        applyOptionalField(changes, next, "description", patch.description);
        applyOptionalField(changes, next, "dueDate", patch.dueDate);
        if (patch.assigneeUserId !== undefined && patch.assigneeUserId !== next.assigneeUserId) {
          if (patch.assigneeUserId !== null) {
            await this.deps.assertAssigneeActiveMember(projectId, patch.assigneeUserId);
          }
          changes.assignee_user_id = { before: next.assigneeUserId, after: patch.assigneeUserId };
          next.assigneeUserId = patch.assigneeUserId;
        }
        if (Object.keys(changes).length === 0) {
          throw new CardValidationError("Tidak ada field yang diubah");
        }
        action = "card.updated";
        data = { changes };
      } else if (operation === "archive") {
        next.archivedAt = now;
        action = "card.archived";
        data = { previous_state: "ACTIVE" };
      } else if (operation === "restore") {
        // INV-LIFE-002/004 + BR-045A — local ARCHIVED sudah dicek; chain harus ACTIVE semua.
        const decision = evaluateRestore(loaded.lifecycleBefore, [chain.listState, ...chain.upperStates]);
        if (!decision.allowed) {
          throw new AncestorNotActiveError(
            "restore",
            decision.reason === "ANCESTOR_NOT_ACTIVE"
              ? `Restore ditolak: ancestor level ${decision.blockingAncestorIndex + 1} dalam state ${String(decision.ancestorState)} — pulihkan ancestor lebih dulu (INV-LIFE-002)`
              : "Restore ditolak: entity DELETED bersifat terminal (INV-LIFE-004)",
          );
        }
        next.archivedAt = null;
        action = "card.restored";
        data = { previous_state: "ARCHIVED" };
      } else {
        next.deletedAt = now;
        action = "card.deleted";
        data = { previous_state: loaded.lifecycleBefore };
      }

      const nextVersion = loaded.current.version + 1;
      await tx.execute(
        "UPDATE cards SET title = ?, subtitle = ?, description = ?, due_date = ?, assignee_user_id = ?, archived_at = ?, deleted_at = ?, updated_at = ?, version = ? WHERE id = ? AND version = ?",
        [
          next.title,
          next.subtitle,
          next.description,
          next.dueDate,
          next.assigneeUserId,
          next.archivedAt,
          next.deletedAt,
          now,
          nextVersion,
          input.cardId,
          input.expectedVersion,
        ],
      );
      await tx.execute(
        "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, 'card', ?, ?, ?, ?, ?, ?)",
        [ulid(), input.cardId, nextVersion, input.actorUserId, action, JSON.stringify(data), now],
      );

      return { ...next, updatedAt: now, version: nextVersion };
    });
  }
}

function mapCardRow(row: Record<string, unknown> | undefined): CardRecord | undefined {
  if (!row) return undefined;
  return {
    id: String(row.id),
    listId: String(row.list_id),
    creatorUserId: String(row.creator_user_id),
    assigneeUserId: row.assignee_user_id === null ? null : String(row.assignee_user_id),
    title: String(row.title),
    subtitle: row.subtitle === null ? null : String(row.subtitle),
    description: row.description === null ? null : String(row.description),
    dueDate: row.due_date === null ? null : String(row.due_date),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    archivedAt: row.archived_at === null ? null : String(row.archived_at),
    deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
    version: Number(row.version),
  };
}

interface ListContext {
  title: string;
  boardId: string;
  boardTitle: string;
  milestoneId: string | null;
  listState: LifecycleState;
  upperStates: LifecycleState[];
}

/**
 * Destination move TIDAK memakai ListNotFoundError — semua kegagalan
 * validitas destination (ada/sama Project/ancestor ACTIVE) dipetakan
 * INVALID_DESTINATION sesuai INV-MOVE-001/002.
 */
async function loadDestination(tx: Tx, listId: string): Promise<ListContext> {
  try {
    return await loadListContext(tx, listId);
  } catch (error) {
    if (error instanceof ListNotFoundError) {
      throw new InvalidDestinationError(`Destination List ${listId} tidak ditemukan di Project ini (INV-MOVE-001/002)`);
    }
    throw error;
  }
}

async function loadListContext(tx: Tx, listId: string): Promise<ListContext> {
  const listRow = (
    await tx.execute("SELECT title, board_id, archived_at, deleted_at FROM lists WHERE id = ?", [listId])
  ).rows[0];
  if (!listRow) throw new ListNotFoundError(listId);

  const stateOf = (row: Record<string, unknown>): LifecycleState =>
    resolveLifecycleState({
      archivedAt: row.archived_at === null ? null : String(row.archived_at),
      deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
    });

  const boardRow = (
    await tx.execute("SELECT id, title, milestone_id, archived_at, deleted_at FROM boards WHERE id = ?", [
      String(listRow.board_id),
    ])
  ).rows[0];
  if (!boardRow) throw new ListNotFoundError(listId);

  const milestoneRaw =
    boardRow.milestone_id === null || boardRow.milestone_id === undefined ? null : String(boardRow.milestone_id);
  let milestoneState: LifecycleState = "DELETED";
  if (milestoneRaw !== null) {
    const msRow = (
      await tx.execute("SELECT archived_at, deleted_at FROM milestones WHERE id = ?", [milestoneRaw])
    ).rows[0];
    milestoneState = msRow ? stateOf(msRow) : "DELETED";
  }

  const projRow = (await tx.execute("SELECT archived_at, deleted_at FROM project_state LIMIT 1")).rows[0];

  return {
    title: String(listRow.title),
    boardId: String(boardRow.id),
    boardTitle: String(boardRow.title),
    milestoneId: milestoneRaw,
    listState: resolveLifecycleState({
      archivedAt: listRow.archived_at === null ? null : String(listRow.archived_at),
      deletedAt: listRow.deleted_at === null ? null : String(listRow.deleted_at),
    }),
    upperStates: [
      stateOf(boardRow),
      milestoneState,
      projRow
        ? stateOf(projRow)
        : ("DELETED" as LifecycleState),
    ],
  };
}

async function loadCardForUpdate(tx: Tx, cardId: string): Promise<LoadedCard> {
  const result = await tx.execute(
    "SELECT id, list_id, creator_user_id, assignee_user_id, title, subtitle, description, due_date, created_at, updated_at, archived_at, deleted_at, version FROM cards WHERE id = ?",
    [cardId],
  );
  const current = mapCardRow(result.rows[0]);
  if (!current) throw new CardNotFoundError(cardId);
  return { current, lifecycleBefore: resolveLifecycleState(current) };
}

function validateTitle(title: string): void {
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new CardValidationError("Title Card wajib diisi");
  }
}

function applyOptionalField<K extends "subtitle" | "description" | "dueDate">(
  changes: Record<string, { before: unknown; after: unknown }>,
  target: CardRecord,
  key: K,
  value: CardRecord[K] | undefined,
): void {
  if (value === undefined) return;
  if (target[key] !== value) changes[key] = { before: target[key], after: value };
  target[key] = value;
}
