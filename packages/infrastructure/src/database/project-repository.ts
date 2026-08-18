import type { Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import type { ProjectRepository, ProjectStateRecord, MilestoneRecord, CardRecord } from "@kanban/domain";
import { projectState, milestones, cards } from "./project-schema.ts";

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