import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { applyProjectMigrations } from "../database/migrate.ts";
import { activities, projectState } from "../database/project-schema.ts";
import {
  createDatabase,
  deleteDatabase,
  mintDatabaseToken,
  projectDatabaseName,
  type TursoEnv,
} from "./turso.ts";

export interface ProvisionInput {
  turso: TursoEnv;
  projectId: string;
  projectName: string;
  creatorUserId: string;
  now: string;
}

export interface ProvisionResult {
  databaseName: string;
  url: string;
  authToken: string;
  hostname: string;
}

export class ProjectProvisioningError extends Error {}

export async function provisionProjectDatabase(input: ProvisionInput): Promise<ProvisionResult> {
  const databaseName = projectDatabaseName(input.projectId);
  let client: Client | undefined;
  try {
    const created = await createDatabase(input.turso, databaseName);
    const authToken = await mintDatabaseToken(input.turso, databaseName);
    const url = `https://${created.hostname}`;
    client = createClient({ url, authToken });

    await applyProjectMigrations(client);

    const db = drizzle(client);
    await db.transaction(async (tx) => {
      await tx.insert(projectState).values({
        projectId: input.projectId,
        name: input.projectName,
        createdAt: input.now,
        updatedAt: input.now,
        version: 1,
      }).run();
      await tx.insert(activities).values({
        id: `act_${input.projectId.toLowerCase()}_created`,
        entityType: "project",
        entityId: input.projectId,
        entityVersion: 1,
        actorUserId: input.creatorUserId,
        action: "project.created",
        data: { snapshot: { name: input.projectName } },
        createdAt: input.now,
      }).run();
    });

    return { databaseName, url, authToken, hostname: created.hostname };
  } catch (error) {
    await client?.close();
    await deleteDatabase(input.turso, databaseName).catch(() => undefined);
    if (error instanceof ProjectProvisioningError) throw error;
    throw new ProjectProvisioningError(`provisioning Project DB ${databaseName} gagal: ${String(error)}`);
  }
}