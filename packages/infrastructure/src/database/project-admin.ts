import type { Client } from "@libsql/client";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { ulid } from "ulid";
import {
  groupPermissions,
  permissionGroups,
  permissions,
  projectMemberships,
  projects,
} from "./global-schema.ts";
import { PipelineError } from "../pipeline/errors.ts";

// Semua operasi di modul ini bekerja pada tabel Global DB (authorization
// plane), BUKAN Project DB — persistence tetap di balik boundary ini dan
// selalu menegakkan Project boundary lewat parameter projectId (invariant #4).

export async function getProjectOwnerId(globalClient: Client, projectId: string): Promise<string | null> {
  const db = drizzle(globalClient);
  const rows = await db.select({ ownerUserId: projects.ownerUserId }).from(projects)
    .where(eq(projects.id, projectId));
  return rows.length > 0 ? String(rows[0]!.ownerUserId) : null;
}

export async function hasActiveMembership(globalClient: Client, projectId: string, userId: string): Promise<boolean> {
  const db = drizzle(globalClient);
  const rows = await db.select({ id: projectMemberships.id }).from(projectMemberships)
    .where(sql`${projectMemberships.projectId} = ${projectId} AND ${projectMemberships.userId} = ${userId} AND ${projectMemberships.revokedAt} IS NULL`);
  return rows.length > 0;
}

// Authorization interim Phase 1 (lihat CL-25): read = member aktif,
// mutasi = Owner-only. Project tak dikenal → RESOURCE_NOT_FOUND sebelum
// pemeriksaan membership.
export async function requireActiveMember(globalClient: Client, projectId: string, userId: string): Promise<void> {
  const ownerId = await getProjectOwnerId(globalClient, projectId);
  if (ownerId === null) {
    throw new PipelineError("RESOURCE_NOT_FOUND", `Project ${projectId} tidak ditemukan.`, 404);
  }
  if (!(await hasActiveMembership(globalClient, projectId, userId))) {
    throw new PipelineError("PERMISSION_DENIED", "User bukan member aktif Project ini.", 403);
  }
}

export async function assertProjectOwner(globalClient: Client, projectId: string, userId: string): Promise<void> {
  await requireActiveMember(globalClient, projectId, userId);
  const ownerId = await getProjectOwnerId(globalClient, projectId);
  if (ownerId !== userId) {
    throw new PipelineError("PERMISSION_DENIED", "Hanya Owner Project yang dapat melakukan operasi ini (interim Phase 1).", 403);
  }
}

export interface PermissionGroupEntry {
  permissionId: string;
  key: string;
  cardReadVisibility: string | null;
}

export interface PermissionGroupSummary {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
  permissions: PermissionGroupEntry[];
}

export async function listPermissionGroups(
  globalClient: Client,
  projectId: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<PermissionGroupSummary[]> {
  const db = drizzle(globalClient);
  const condition = opts.includeDeleted === true
    ? eq(permissionGroups.projectId, projectId)
    : sql`${permissionGroups.projectId} = ${projectId} AND ${permissionGroups.deletedAt} IS NULL`;
  const groupRows = await db.select().from(permissionGroups).where(condition).orderBy(asc(permissionGroups.createdAt));
  if (groupRows.length === 0) return [];
  const groupIds = groupRows.map((row) => row.id);
  const permissionRows = await db.select({
    groupId: groupPermissions.groupId,
    permissionId: groupPermissions.permissionId,
    cardReadVisibility: groupPermissions.cardReadVisibility,
    key: permissions.key,
  }).from(groupPermissions).innerJoin(permissions, eq(groupPermissions.permissionId, permissions.id))
    .where(inArray(groupPermissions.groupId, groupIds));
  const byGroup = new Map<string, PermissionGroupEntry[]>();
  for (const row of permissionRows) {
    const list = byGroup.get(row.groupId) ?? [];
    list.push({
      permissionId: row.permissionId,
      key: row.key,
      cardReadVisibility: row.cardReadVisibility ?? null,
    });
    byGroup.set(row.groupId, list);
  }
  return groupRows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt ?? null,
    deletedAt: row.deletedAt ?? null,
    permissions: byGroup.get(row.id) ?? [],
  }));
}

export function newPermissionGroupId(): string {
  return ulid();
}
