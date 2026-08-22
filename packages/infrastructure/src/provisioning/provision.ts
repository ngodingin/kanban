import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { ulid } from "ulid";
import { applyProjectMigrations } from "../database/migrate.ts";
import {
  groupPermissions,
  permissionGroups,
  permissions,
  projectDatabases,
  projectMemberships,
  projects,
} from "../database/global-schema.ts";
import {
  BASELINE_GROUP_DESCRIPTIONS,
  BASELINE_GROUP_NAMES,
  PERMISSION_CATALOG,
  baselineGroupPermissionKeys,
} from "../database/permission-catalog.ts";
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
  tokenExpiration?: string;
}

export interface ProvisionResult {
  databaseName: string;
  url: string;
  authToken: string;
  hostname: string;
}

export class ProjectProvisioningError extends Error {}

export function newProjectId(): string {
  return ulid();
}

export async function provisionProjectDatabase(input: ProvisionInput): Promise<ProvisionResult> {
  const databaseName = projectDatabaseName(input.projectId);
  let client: Client | undefined;
  let created = false;
  try {
    const createResult = await createDatabase(input.turso, databaseName);
    created = true;
    const authToken = await mintDatabaseToken(input.turso, databaseName, input.tokenExpiration ?? "1y");
    const url = `https://${createResult.hostname}`;
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
        id: ulid(),
        entityType: "project",
        entityId: input.projectId,
        entityVersion: 1,
        actorUserId: input.creatorUserId,
        action: "project.created",
        data: { snapshot: { name: input.projectName } },
        createdAt: input.now,
      }).run();
    });

    return { databaseName, url, authToken, hostname: createResult.hostname };
  } catch (error) {
    await client?.close();
    if (created) {
      await deleteDatabase(input.turso, databaseName).catch(() => undefined);
    }
    if (error instanceof ProjectProvisioningError) throw error;
    throw new ProjectProvisioningError(`provisioning Project DB ${databaseName} gagal: ${String(error)}`);
  }
}

export interface ProvisionWithMappingInput extends ProvisionInput {
  globalClient: Client;
  ownerUserId: string;
}

export interface ProjectRegistrationInput {
  projectId: string;
  databaseId: string;
  ownerUserId: string;
  now: string;
}

export async function registerProjectWithOwnerMembership(
  globalClient: Client,
  input: ProjectRegistrationInput,
): Promise<void> {
  const db = drizzle(globalClient);
  await db.transaction(async (tx) => {
    await tx.insert(projects).values({
      id: input.projectId,
      ownerUserId: input.ownerUserId,
      provisioningState: "READY",
      createdAt: input.now,
    }).run();
    await tx.insert(projectDatabases).values({
      projectId: input.projectId,
      databaseId: input.databaseId,
      createdAt: input.now,
    }).run();
    await tx.insert(projectMemberships).values({
      id: ulid(),
      projectId: input.projectId,
      userId: input.ownerUserId,
      createdAt: input.now,
      revokedAt: null,
    }).run();

    const permissionRows = await tx.select({ id: permissions.id, key: permissions.key }).from(permissions);
    const idByKey = new Map(permissionRows.map((row) => [row.key, row.id]));
    for (const entry of PERMISSION_CATALOG) {
      if (idByKey.has(entry.key)) continue;
      const id = ulid();
      await tx.insert(permissions).values({ id, key: entry.key, description: entry.description });
      idByKey.set(entry.key, id);
    }

    for (const name of BASELINE_GROUP_NAMES) {
      const groupId = ulid();
      await tx.insert(permissionGroups).values({
        id: groupId,
        projectId: input.projectId,
        name,
        description: BASELINE_GROUP_DESCRIPTIONS[name],
        createdAt: input.now,
        updatedAt: input.now,
      }).run();
      const rows = baselineGroupPermissionKeys(name).map((key) => ({
        groupId,
        permissionId: idByKey.get(key)!,
        cardReadVisibility: key === "card.read" ? "CREATED_BY_ME" : null,
        createdAt: input.now,
      }));
      await tx.insert(groupPermissions).values(rows).run();
    }
  });
}

export async function provisionProjectWithMapping(input: ProvisionWithMappingInput): Promise<ProvisionResult> {
  const result = await provisionProjectDatabase(input);

  try {
    await registerProjectWithOwnerMembership(input.globalClient, {
      projectId: input.projectId,
      databaseId: result.databaseName,
      ownerUserId: input.ownerUserId,
      now: input.now,
    });
  } catch (error) {
    await deleteDatabase(input.turso, result.databaseName).catch(() => undefined);
    if (error instanceof ProjectProvisioningError) throw error;
    throw new ProjectProvisioningError(`pencatatan mapping project ${input.projectId} gagal: ${String(error)}`);
  }

  return result;
}