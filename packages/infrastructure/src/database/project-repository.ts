import type { Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { ulid } from "ulid";
import type {
  CardRecord,
  MilestoneRecord,
  ProjectLifecycleInput,
  ProjectLifecycleState,
  ProjectRepository,
  ProjectStateRecord,
  UpdateProjectNameInput,
} from "@kanban/domain";
import {
  ProjectInvalidStateError,
  ProjectNotFoundError,
  ProjectVersionConflictError,
  resolveProjectLifecycle,
} from "@kanban/domain";
import { projectState, milestones, cards } from "./project-schema.ts";
import { runInWriteTransaction } from "./transaction.ts";

type LifecycleOperation = "update" | "archive" | "restore" | "delete";

const LIFECYCLE_ALLOWED_FROM: Record<LifecycleOperation, readonly ProjectLifecycleState[]> = {
  update: ["ACTIVE"],
  archive: ["ACTIVE"],
  restore: ["ARCHIVED"],
  delete: ["ACTIVE", "ARCHIVED"],
};

interface NextProjectState {
  name: string;
  archivedAt: string | null;
  deletedAt: string | null;
  activityAction: string;
  activityData: Record<string, unknown>;
}

export class DrizzleProjectRepository implements ProjectRepository {
  private readonly client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  async getProjectState(projectId: string): Promise<ProjectStateRecord | undefined> {
    const db = drizzle(this.client);
    const row = await db.select().from(projectState).where(eq(projectState.projectId, projectId)).get();
    if (!row) return undefined;
    return {
      projectId: row.projectId,
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      archivedAt: row.archivedAt,
      deletedAt: row.deletedAt,
      version: row.version,
    };
  }

  async updateProjectName(input: UpdateProjectNameInput): Promise<ProjectStateRecord> {
    return this.commitMutation(input, "update", (current) => ({
      name: input.name,
      archivedAt: current.archivedAt,
      deletedAt: current.deletedAt,
      activityAction: "project.updated",
      activityData: { changes: { name: { before: current.name, after: input.name } } },
    }));
  }

  async archiveProject(input: ProjectLifecycleInput): Promise<ProjectStateRecord> {
    return this.commitMutation(input, "archive", (current, now) => ({
      name: current.name,
      archivedAt: now,
      deletedAt: null,
      activityAction: "project.archived",
      activityData: { previous_state: "ACTIVE" },
    }));
  }

  async restoreProject(input: ProjectLifecycleInput): Promise<ProjectStateRecord> {
    return this.commitMutation(input, "restore", (current) => ({
      name: current.name,
      archivedAt: null,
      deletedAt: null,
      activityAction: "project.restored",
      activityData: { previous_state: "ARCHIVED" },
    }));
  }

  async deleteProject(input: ProjectLifecycleInput): Promise<ProjectStateRecord> {
    return this.commitMutation(input, "delete", (current, now, lifecycleBefore) => ({
      name: current.name,
      archivedAt: current.archivedAt,
      deletedAt: now,
      activityAction: "project.deleted",
      activityData: { previous_state: lifecycleBefore },
    }));
  }

  private async commitMutation(
    input: ProjectLifecycleInput,
    operation: LifecycleOperation,
    buildNext: (
      current: ProjectStateRecord,
      now: string,
      lifecycleBefore: ProjectLifecycleState,
    ) => NextProjectState,
  ): Promise<ProjectStateRecord> {
    const { projectId, expectedVersion, actorUserId } = input;
    return runInWriteTransaction(this.client, async (tx) => {
      const result = await tx.execute(
        "SELECT project_id, name, created_at, updated_at, archived_at, deleted_at, version FROM project_state WHERE project_id = ?",
        [projectId],
      );
      const row = result.rows[0];
      if (!row) throw new ProjectNotFoundError();
      const current: ProjectStateRecord = {
        projectId: String(row.project_id),
        name: String(row.name),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        archivedAt: row.archived_at === null ? null : String(row.archived_at),
        deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
        version: Number(row.version),
      };
      if (current.version !== expectedVersion) {
        throw new ProjectVersionConflictError(expectedVersion, current.version);
      }
      const lifecycleBefore = resolveProjectLifecycle(current);
      if (!LIFECYCLE_ALLOWED_FROM[operation].includes(lifecycleBefore)) {
        throw new ProjectInvalidStateError(operation, lifecycleBefore);
      }
      const now = new Date().toISOString();
      const next = buildNext(current, now, lifecycleBefore);
      const nextVersion = current.version + 1;
      await tx.execute(
        "UPDATE project_state SET name = ?, updated_at = ?, archived_at = ?, deleted_at = ?, version = ? WHERE project_id = ? AND version = ?",
        [next.name, now, next.archivedAt, next.deletedAt, nextVersion, projectId, expectedVersion],
      );
      await tx.execute(
        "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, 'project', ?, ?, ?, ?, ?, ?)",
        [ulid(), projectId, nextVersion, actorUserId, next.activityAction, JSON.stringify(next.activityData), now],
      );
      return {
        projectId,
        name: next.name,
        createdAt: current.createdAt,
        updatedAt: now,
        archivedAt: next.archivedAt,
        deletedAt: next.deletedAt,
        version: nextVersion,
      };
    });
  }

  async createMilestone(input: {
    id: string;
    title: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
  }): Promise<void> {
    const db = drizzle(this.client);
    await db.insert(milestones).values({
      id: input.id,
      title: input.title,
      description: input.description,
      progress: 0,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      version: 1,
    }).run();
  }

  async listMilestones(): Promise<MilestoneRecord[]> {
    const db = drizzle(this.client);
    const rows = await db.select().from(milestones).all();
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      progress: row.progress,
      startDate: row.startDate,
      dueDate: row.dueDate,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      archivedAt: row.archivedAt,
      deletedAt: row.deletedAt,
      version: row.version,
    }));
  }

  async getCard(id: string): Promise<CardRecord | undefined> {
    const db = drizzle(this.client);
    const row = await db.select().from(cards).where(eq(cards.id, id)).get();
    if (!row) return undefined;
    return {
      id: row.id,
      listId: row.listId,
      creatorUserId: row.creatorUserId,
      assigneeUserId: row.assigneeUserId,
      title: row.title,
      subtitle: row.subtitle,
      description: row.description,
      dueDate: row.dueDate,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      archivedAt: row.archivedAt,
      deletedAt: row.deletedAt,
      version: row.version,
    };
  }
}
