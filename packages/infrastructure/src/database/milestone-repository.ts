import type { Client } from "@libsql/client";
import { ulid } from "ulid";
import type {
  CreateMilestoneInput,
  LifecycleState,
  MilestoneLifecycleInput,
  MilestoneRecord,
  MilestoneRepository,
  UpdateMilestoneInput,
} from "@kanban/domain";
import {
  AncestorNotActiveError,
  evaluateRestore,
  isEffectivelyOperational,
  resolveLifecycleState,
  MilestoneInvalidStateError,
  MilestoneNotFoundError,
  MilestoneValidationError,
  MilestoneVersionConflictError,
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

interface LoadedMilestone {
  current: MilestoneRecord;
  lifecycleBefore: LifecycleState;
}

export class DrizzleMilestoneRepository implements MilestoneRepository {
  private readonly client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  async getMilestone(projectId: string, milestoneId: string): Promise<MilestoneRecord | undefined> {
    void projectId;
    const result = await this.client.execute(
      "SELECT id, title, description, progress, start_date, due_date, created_at, updated_at, archived_at, deleted_at, version FROM milestones WHERE id = ?",
      [milestoneId],
    );
    return mapMilestoneRow(result.rows[0]);
  }

  async createMilestone(projectId: string, input: CreateMilestoneInput): Promise<MilestoneRecord> {
    validateTitle(input.title);
    validateProgress(input.progress);
    const now = new Date().toISOString();
    return runInWriteTransaction(this.client, async (tx) => {
      // INV-LIFE-001 — Project (satu-satunya ancestor Milestone) harus ACTIVE.
      const project = await loadProjectState(tx, projectId);
      const projectState = project ? resolveLifecycleState(project) : null;
      if (!project || !isEffectivelyOperational([projectState!])) {
        throw new AncestorNotActiveError(
          "create",
          project
            ? `Project dalam state ${projectState} — Milestone tidak dapat dibuat`
            : `Project ${projectId} tidak ditemukan`,
        );
      }
      await tx.execute(
        "INSERT INTO milestones (id, title, description, progress, start_date, due_date, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)",
        [input.id, input.title, input.description, input.progress, input.startDate, input.dueDate, now, now],
      );
      // B.5 v1.0.2 — *.created membawa snapshot minimal denormalisasi.
      await tx.execute(
        "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, 'milestone', ?, 1, ?, 'milestone.created', ?, ?)",
        [
          ulid(),
          input.id,
          input.actorUserId,
          JSON.stringify({ snapshot: { title: input.title, progress: input.progress } }),
          now,
        ],
      );
      return {
        id: input.id,
        title: input.title,
        description: input.description,
        progress: input.progress,
        startDate: input.startDate,
        dueDate: input.dueDate,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        deletedAt: null,
        version: 1,
      };
    });
  }

  async updateMilestone(projectId: string, input: UpdateMilestoneInput): Promise<MilestoneRecord> {
    return this.commitMutation(projectId, input, "update");
  }

  async archiveMilestone(projectId: string, input: MilestoneLifecycleInput): Promise<MilestoneRecord> {
    return this.commitMutation(projectId, input, "archive");
  }

  async restoreMilestone(projectId: string, input: MilestoneLifecycleInput): Promise<MilestoneRecord> {
    return this.commitMutation(projectId, input, "restore");
  }

  async deleteMilestone(projectId: string, input: MilestoneLifecycleInput): Promise<MilestoneRecord> {
    return this.commitMutation(projectId, input, "delete");
  }

  /**
   * Mutation inti (INV #7/#8/#9): satu transaksi BEGIN IMMEDIATE berisi
   * version check (AC-020) → validasi state/ancestor → UPDATE terjaga
   * `AND version = expected` → Activity append. Tidak ada jalur yang
   * melewati optimistic locking.
   */
  private async commitMutation(
    projectId: string,
    input: MilestoneLifecycleInput | UpdateMilestoneInput,
    operation: LifecycleOperation,
  ): Promise<MilestoneRecord> {
    return runInWriteTransaction(this.client, async (tx) => {
      const loaded = await loadMilestoneForUpdate(tx, input.milestoneId);
      if (loaded.current.version !== input.expectedVersion) {
        throw new MilestoneVersionConflictError(input.expectedVersion, loaded.current.version);
      }
      if (!LIFECYCLE_ALLOWED_FROM[operation].includes(loaded.lifecycleBefore)) {
        throw new MilestoneInvalidStateError(operation, loaded.lifecycleBefore);
      }

      const now = new Date().toISOString();
      const next: MilestoneRecord = { ...loaded.current };
      let action: string;
      let data: Record<string, unknown>;

      // INV-LIFE-001 — entity non-operational (Project ancestor non-ACTIVE)
      // MUST NOT menerima mutasi apapun, termasuk update/archive/delete
      // (restore dievaluasi lebih spesifik via evaluateRestore di bawah).
      const project = await loadProjectState(tx, projectId);
      const projectBefore = project ? resolveLifecycleState(project) : ("DELETED" as LifecycleState);
      if (!isEffectivelyOperational([projectBefore])) {
        throw new AncestorNotActiveError(
          operation,
          `Project dalam state ${projectBefore} — Milestone tidak dapat menerima operasi ${operation} (INV-LIFE-001)`,
        );
      }

      if (operation === "update") {
        const patch = input as UpdateMilestoneInput;
        const changes: Record<string, { before: unknown; after: unknown }> = {};
        applyFieldChange(next, changes, "title", patch.title);
        applyFieldChange(next, changes, "description", patch.description);
        if (patch.progress !== undefined) {
          validateProgress(patch.progress);
          applyFieldChange(next, changes, "progress", patch.progress);
        }
        applyFieldChange(next, changes, "startDate", patch.startDate);
        applyFieldChange(next, changes, "dueDate", patch.dueDate);
        if (Object.keys(changes).length === 0) {
          throw new MilestoneValidationError("Tidak ada field yang diubah");
        }
        action = "milestone.updated";
        data = { changes };
      } else if (operation === "archive") {
        next.archivedAt = now;
        action = "milestone.archived";
        data = { previous_state: "ACTIVE" };
      } else if (operation === "restore") {
        // INV-LIFE-002/004 — local ARCHIVED sudah dicek; ancestor Project harus ACTIVE.
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
        action = "milestone.restored";
        data = { previous_state: "ARCHIVED" };
      } else {
        next.deletedAt = now;
        action = "milestone.deleted";
        data = { previous_state: loaded.lifecycleBefore };
      }

      const nextVersion = loaded.current.version + 1;
      await tx.execute(
        "UPDATE milestones SET title = ?, description = ?, progress = ?, start_date = ?, due_date = ?, archived_at = ?, deleted_at = ?, updated_at = ?, version = ? WHERE id = ? AND version = ?",
        [
          next.title,
          next.description,
          next.progress,
          next.startDate,
          next.dueDate,
          next.archivedAt,
          next.deletedAt,
          now,
          nextVersion,
          input.milestoneId,
          input.expectedVersion,
        ],
      );
      await tx.execute(
        "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, 'milestone', ?, ?, ?, ?, ?, ?)",
        [ulid(), input.milestoneId, nextVersion, input.actorUserId, action, JSON.stringify(data), now],
      );

      return { ...next, updatedAt: now, version: nextVersion };
    });
  }
}

function mapMilestoneRow(row: Record<string, unknown> | undefined): MilestoneRecord | undefined {
  if (!row) return undefined;
  return {
    id: String(row.id),
    title: String(row.title),
    description: row.description === null ? null : String(row.description),
    progress: Number(row.progress),
    startDate: row.start_date === null ? null : String(row.start_date),
    dueDate: row.due_date === null ? null : String(row.due_date),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    archivedAt: row.archived_at === null ? null : String(row.archived_at),
    deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
    version: Number(row.version),
  };
}

async function loadProjectState(tx: Tx, projectId: string) {
  const result = await tx.execute(
    "SELECT project_id, name, created_at, updated_at, archived_at, deleted_at, version FROM project_state WHERE project_id = ?",
    [projectId],
  );
  const row = result.rows[0];
  if (!row) return undefined;
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

async function loadMilestoneForUpdate(tx: Tx, milestoneId: string): Promise<LoadedMilestone> {
  const result = await tx.execute(
    "SELECT id, title, description, progress, start_date, due_date, created_at, updated_at, archived_at, deleted_at, version FROM milestones WHERE id = ?",
    [milestoneId],
  );
  const current = mapMilestoneRow(result.rows[0]);
  if (!current) throw new MilestoneNotFoundError(milestoneId);
  return { current, lifecycleBefore: resolveLifecycleState(current) };
}

function validateTitle(title: string): void {
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new MilestoneValidationError("Title Milestone wajib diisi");
  }
}

function validateProgress(progress: number): void {
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    throw new MilestoneValidationError("Progress harus bilangan bulat 0–100 (FR-014)");
  }
}

function applyFieldChange<K extends "title" | "description" | "progress" | "startDate" | "dueDate">(
  target: MilestoneRecord,
  changes: Record<string, { before: unknown; after: unknown }>,
  key: K,
  value: MilestoneRecord[K] | undefined,
): void {
  if (value === undefined) return;
  const before = target[key];
  if (before !== value) {
    changes[key] = { before, after: value };
  }
  target[key] = value;
}
