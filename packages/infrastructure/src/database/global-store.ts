import type { Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { projectDatabases, projects } from "./global-schema.ts";

export class MappingAlreadyExistsError extends Error {}

export async function recordProjectDatabaseMapping(
  client: Client,
  input: { projectId: string; databaseId: string; now: string },
): Promise<void> {
  const db = drizzle(client);
  try {
    await db.insert(projectDatabases).values({
      projectId: input.projectId,
      databaseId: input.databaseId,
      createdAt: input.now,
    }).run();
  } catch (error) {
    const detail = String((error as { cause?: Error }).cause ?? error);
    if (detail.includes("UNIQUE constraint failed") || detail.includes("PRIMARY KEY")) {
      throw new MappingAlreadyExistsError(`mapping project ${input.projectId} sudah ada`);
    }
    throw error;
  }
}

export async function registerProject(client: Client, input: { projectId: string; ownerUserId: string; now: string }): Promise<void> {
  const db = drizzle(client);
  await db.insert(projects).values({
    id: input.projectId,
    ownerUserId: input.ownerUserId,
    provisioningState: "READY",
    createdAt: input.now,
  }).run();
}