import type { Client } from "@libsql/client";
import { ulid } from "ulid";
import type {
  BoardLabelRecord,
  BoardLabelRepository,
  CreateLabelInput,
  LabelLifecycleInput,
  LifecycleState,
  ListLabelsOptions,
  UpdateLabelInput,
} from "@kanban/domain";
import {
  AncestorNotActiveError,
  evaluateRestore,
  isEffectivelyOperational,
  resolveLifecycleState,
  LabelInvalidStateError,
  LabelNotFoundError,
  LabelValidationError,
  LabelVersionConflictError,
} from "@kanban/domain";
import { runInWriteTransaction, type Tx } from "./transaction.ts";

type LifecycleOperation = "update" | "archive" | "restore" | "delete";

/** State machine A.3 — sama pola Milestone/Board/List/Card. */
const LIFECYCLE_ALLOWED_FROM: Record<LifecycleOperation, readonly LifecycleState[]> = {
  update: ["ACTIVE"],
  archive: ["ACTIVE"],
  restore: ["ARCHIVED"],
  delete: ["ACTIVE", "ARCHIVED"],
};

const ACTIVITY_ENTITY = "board_label";

interface LoadedLabel {
  current: BoardLabelRecord;
  lifecycleBefore: LifecycleState;
}

export class DrizzleBoardLabelRepository implements BoardLabelRepository {
  private readonly client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  async listBoardLabels(
    projectId: string,
    boardId: string,
    opts?: ListLabelsOptions,
  ): Promise<BoardLabelRecord[]> {
    void projectId;
    const includeDeleted = opts?.includeDeleted === true;
    const result = await this.client.execute({
      sql: `SELECT id, board_id, name, created_at, updated_at, archived_at, deleted_at, version
            FROM board_labels WHERE board_id = ? ${includeDeleted ? "" : "AND deleted_at IS NULL"}
            ORDER BY created_at, id`,
      args: [boardId],
    });
    return result.rows.map(mapLabelRow);
  }

  async createBoardLabel(
    projectId: string,
    boardId: string,
    input: CreateLabelInput,
  ): Promise<BoardLabelRecord> {
    validateName(input.name);
    const now = new Date().toISOString();
    return runInWriteTransaction(this.client, async (tx) => {
      // INV-LIFE-001 — chain [boardState, milestoneState, projectState] semua ACTIVE.
      const chain = await loadAncestorStates(tx, boardId);
      if (!isEffectivelyOperational(chain)) {
        throw new AncestorNotActiveError(
          "create",
          `Ancestor tidak ACTIVE — Board Label tidak dapat dibuat di bawah Board ${boardId} (INV-LIFE-001)`,
        );
      }
      await tx.execute(
        "INSERT INTO board_labels (id, board_id, name, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, 1)",
        [input.id, boardId, input.name, now, now],
      );
      await insertActivity(tx, input.id, 1, input.actorUserId, `${ACTIVITY_ENTITY}.created`, {
        snapshot: { name: input.name },
      }, now);
      return {
        id: input.id,
        boardId,
        name: input.name,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        deletedAt: null,
        version: 1,
      };
    });
  }

  async updateBoardLabel(
    projectId: string,
    input: UpdateLabelInput,
  ): Promise<BoardLabelRecord> {
    void projectId;
    return this.commitMutation(input.labelId, input.expectedVersion, input.actorUserId, "update", (label) => {
      const changes: Record<string, { before: unknown; after: unknown }> = {};
      if (input.name !== undefined) {
        validateName(input.name);
        if (label.name !== input.name) changes.name = { before: label.name, after: input.name };
        label.name = input.name;
      }
      if (Object.keys(changes).length === 0) {
        throw new LabelValidationError("Tidak ada field yang diubah");
      }
      return { changes };
    });
  }

  async archiveBoardLabel(
    projectId: string,
    input: LabelLifecycleInput,
  ): Promise<BoardLabelRecord> {
    void projectId;
    return this.commitMutation(input.labelId, input.expectedVersion, input.actorUserId, "archive");
  }

  async restoreBoardLabel(
    projectId: string,
    input: LabelLifecycleInput,
  ): Promise<BoardLabelRecord> {
    void projectId;
    return this.commitMutation(input.labelId, input.expectedVersion, input.actorUserId, "restore");
  }

  async deleteBoardLabel(
    projectId: string,
    input: LabelLifecycleInput,
  ): Promise<BoardLabelRecord> {
    void projectId;
    return this.commitMutation(input.labelId, input.expectedVersion, input.actorUserId, "delete");
  }

  /**
   * Urutan wajib (pelajaran Review-CL-02): version check → ancestor check
   * chain 3 level → local-state A.3 → mutasi + Activity atomik.
   */
  private async commitMutation(
    labelId: string,
    expectedVersion: number,
    actorUserId: string,
    operation: LifecycleOperation,
    buildChanges?: (label: BoardLabelRecord) => Record<string, unknown>,
  ): Promise<BoardLabelRecord> {
    return runInWriteTransaction(this.client, async (tx) => {
      const loaded = await loadLabelForUpdate(tx, labelId);
      if (loaded.current.version !== expectedVersion) {
        throw new LabelVersionConflictError(expectedVersion, loaded.current.version);
      }

      const chain = await loadAncestorStatesForExisting(tx, loaded.current.boardId);
      if (!isEffectivelyOperational(chain)) {
        throw new AncestorNotActiveError(
          operation,
          `Ancestor tidak ACTIVE — Board Label tidak dapat menerima operasi ${operation} (INV-LIFE-001)`,
        );
      }

      if (!LIFECYCLE_ALLOWED_FROM[operation].includes(loaded.lifecycleBefore)) {
        throw new LabelInvalidStateError(operation, loaded.lifecycleBefore);
      }

      const now = new Date().toISOString();
      const next: BoardLabelRecord = { ...loaded.current };
      let action: string;
      let data: Record<string, unknown>;

      if (operation === "update") {
        data = buildChanges!(next);
        action = `${ACTIVITY_ENTITY}.updated`;
      } else if (operation === "archive") {
        next.archivedAt = now;
        action = `${ACTIVITY_ENTITY}.archived`;
        data = { previousState: "ACTIVE" };
      } else if (operation === "restore") {
        const projectRow = (
          await tx.execute("SELECT archived_at, deleted_at FROM project_state LIMIT 1")
        ).rows[0];
        const projectBefore = projectRow ? stateOf(projectRow) : ("DELETED" as LifecycleState);
        const decision = evaluateRestore(loaded.lifecycleBefore, [projectBefore]);
        if (!decision.allowed) {
          throw new AncestorNotActiveError(
            "restore",
            decision.reason === "ANCESTOR_NOT_ACTIVE"
              ? `Restore ditolak: Project dalam state ${String(decision.ancestorState)} — pulihkan ancestor lebih dulu (INV-LIFE-002)`
              : "Restore ditolak: entity DELETED bersifat terminal (INV-LIFE-004)",
          );
        }
        next.archivedAt = null;
        action = `${ACTIVITY_ENTITY}.restored`;
        data = { previousState: "ARCHIVED" };
      } else {
        next.deletedAt = now;
        action = `${ACTIVITY_ENTITY}.deleted`;
        data = { previousState: loaded.lifecycleBefore };
      }

      const nextVersion = loaded.current.version + 1;
      await tx.execute(
        "UPDATE board_labels SET name = ?, archived_at = ?, deleted_at = ?, updated_at = ?, version = ? WHERE id = ? AND version = ?",
        [next.name, next.archivedAt, next.deletedAt, now, nextVersion, labelId, expectedVersion],
      );
      await insertActivity(tx, labelId, nextVersion, actorUserId, action, data, now);

      return { ...next, updatedAt: now, version: nextVersion };
    });
  }
}

function stateOf(row: Record<string, unknown>): LifecycleState {
  return resolveLifecycleState({
    archivedAt: row.archived_at === null ? null : String(row.archived_at),
    deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
  });
}

/** Chain [boardState, milestoneState, projectState]. */
async function loadAncestorStates(tx: Tx, boardId: string): Promise<LifecycleState[]> {
  const boardRow = (
    await tx.execute("SELECT archived_at, deleted_at FROM boards WHERE id = ?", [boardId])
  ).rows[0];
  const boardState = boardRow ? stateOf(boardRow) : ("DELETED" as LifecycleState);

  let msRow: Record<string, unknown> | undefined;
  if (boardRow) {
    const msIdRaw = (await tx.execute("SELECT milestone_id FROM boards WHERE id = ?", [boardId])).rows[0]?.milestone_id;
    if (msIdRaw !== null && msIdRaw !== undefined) {
      msRow = (
        await tx.execute("SELECT archived_at, deleted_at FROM milestones WHERE id = ?", [String(msIdRaw)])
      ).rows[0];
    }
  }
  const msState = msRow ? stateOf(msRow) : ("DELETED" as LifecycleState);

  const projRow = (await tx.execute("SELECT archived_at, deleted_at FROM project_state LIMIT 1")).rows[0];
  const projState = projRow ? stateOf(projRow) : ("DELETED" as LifecycleState);
  return [boardState, msState, projState];
}

async function loadAncestorStatesForExisting(tx: Tx, boardId: string): Promise<LifecycleState[]> {
  return loadAncestorStates(tx, boardId);
}

async function loadLabelForUpdate(tx: Tx, labelId: string): Promise<LoadedLabel> {
  const result = await tx.execute(
    "SELECT id, board_id, name, created_at, updated_at, archived_at, deleted_at, version FROM board_labels WHERE id = ?",
    [labelId],
  );
  const row = result.rows[0];
  if (!row) throw new LabelNotFoundError(labelId, "board");
  const current: BoardLabelRecord = {
    id: String(row.id),
    boardId: String(row.board_id),
    name: String(row.name),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    archivedAt: row.archived_at === null ? null : String(row.archived_at),
    deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
    version: Number(row.version),
  };
  return { current, lifecycleBefore: resolveLifecycleState(current) };
}

function mapLabelRow(row: Record<string, unknown>): BoardLabelRecord {
  return {
    id: String(row.id),
    boardId: String(row.board_id),
    name: String(row.name),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    archivedAt: row.archived_at === null ? null : String(row.archived_at),
    deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
    version: Number(row.version),
  };
}

function validateName(name: string): void {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new LabelValidationError("Nama Label wajib diisi");
  }
}

function insertActivity(
  tx: Tx,
  entityId: string,
  entityVersion: number,
  actorUserId: string,
  action: string,
  data: Record<string, unknown>,
  now: string,
): Promise<unknown> {
  return tx.execute(
    "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, 'board_label', ?, ?, ?, ?, ?, ?)",
    [ulid(), entityId, entityVersion, actorUserId, action, JSON.stringify(data), now],
  );
}
