import type { Client } from "@libsql/client";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { ulid } from "ulid";
import {
  groupPermissions,
  invitationGroupAssignments,
  invitations,
  membershipGroupAssignments,
  membershipPermissionAssignments,
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
  projectId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
  permissions: PermissionGroupEntry[];
}

const CARD_READ_VISIBILITIES = ["CREATED_BY_ME", "ASSIGNED_TO_ME", "ALL"] as const;
type CardReadVisibility = (typeof CARD_READ_VISIBILITIES)[number];

async function attachPermissions(
  globalClient: Client,
  rows: Array<typeof permissionGroups.$inferSelect>,
): Promise<PermissionGroupSummary[]> {
  if (rows.length === 0) return [];
  const db = drizzle(globalClient);
  const permissionRows = await db.select({
    groupId: groupPermissions.groupId,
    permissionId: groupPermissions.permissionId,
    cardReadVisibility: groupPermissions.cardReadVisibility,
    key: permissions.key,
  }).from(groupPermissions).innerJoin(permissions, eq(groupPermissions.permissionId, permissions.id))
    .where(inArray(groupPermissions.groupId, rows.map((row) => row.id)));
  const byGroup = new Map<string, PermissionGroupEntry[]>();
  for (const row of permissionRows) {
    const list = byGroup.get(row.groupId) ?? [];
    list.push({ permissionId: row.permissionId, key: row.key, cardReadVisibility: row.cardReadVisibility ?? null });
    byGroup.set(row.groupId, list);
  }
  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt ?? null,
    deletedAt: row.deletedAt ?? null,
    permissions: byGroup.get(row.id) ?? [],
  }));
}

export async function listPermissionGroups(
  globalClient: Client,
  projectId: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<PermissionGroupSummary[]> {
  const db = drizzle(globalClient);
  // Default exclude soft-deleted (?include_deleted=true untuk minta eksplisit).
  const condition = opts.includeDeleted === true
    ? eq(permissionGroups.projectId, projectId)
    : sql`${permissionGroups.projectId} = ${projectId} AND ${permissionGroups.deletedAt} IS NULL`;
  const rows = await db.select().from(permissionGroups).where(condition).orderBy(asc(permissionGroups.createdAt));
  return attachPermissions(globalClient, rows);
}

export interface CreatePermissionGroupInput {
  projectId: string;
  name: string;
  description?: string | null;
  permissions: Array<{ permissionId: string; cardReadVisibility?: string | null }>;
}

function normalizeVisibility(value: unknown): CardReadVisibility | null {
  if (value == null) return null;
  if (typeof value === "string" && (CARD_READ_VISIBILITIES as readonly string[]).includes(value)) {
    return value as CardReadVisibility;
  }
  throw new PipelineError("INVALID_STATE", `card_read_visibility tidak valid: ${String(value)}`, 409);
}

// Validasi referensi katalog + invariant visibility (C.12): visibility hanya
// boleh untuk card.read; card.read tanpa visibility → CREATED_BY_ME (BR-048).
// Insert group + group_permissions atomik dalam satu transaksi.
export async function createPermissionGroup(globalClient: Client, input: CreatePermissionGroupInput): Promise<PermissionGroupSummary> {
  const db = drizzle(globalClient);
  const now = new Date().toISOString();
  const requested: Array<{ permissionId: string; cardReadVisibility: CardReadVisibility | null }> =
    input.permissions.map((entry) => ({
      permissionId: entry.permissionId,
      cardReadVisibility: normalizeVisibility(entry.cardReadVisibility),
    }));
  const permissionIds = [...new Set(requested.map((entry) => entry.permissionId))];
  const known = permissionIds.length > 0
    ? await db.select({ id: permissions.id, key: permissions.key }).from(permissions)
      .where(inArray(permissions.id, permissionIds))
    : [];
  const keyById = new Map(known.map((row) => [row.id, row.key]));
  for (const id of permissionIds) {
    if (!keyById.has(id)) {
      throw new PipelineError("INVALID_STATE", `permission_id tidak dikenal: ${id}`, 409);
    }
  }
  for (const entry of requested) {
    if (entry.cardReadVisibility != null && keyById.get(entry.permissionId) !== "card.read") {
      throw new PipelineError("INVALID_STATE", "card_read_visibility hanya berlaku untuk permission card.read.", 409);
    }
  }
  const groupId = ulid();
  await db.transaction(async (tx) => {
    await tx.insert(permissionGroups).values({
      id: groupId,
      projectId: input.projectId,
      name: input.name,
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
    }).run();
    if (requested.length > 0) {
      await tx.insert(groupPermissions).values(requested.map((entry) => ({
        groupId,
        permissionId: entry.permissionId,
        cardReadVisibility: entry.cardReadVisibility ?? (keyById.get(entry.permissionId) === "card.read" ? "CREATED_BY_ME" : null),
        createdAt: now,
      }))).run();
    }
  });
  const created = await db.select().from(permissionGroups).where(eq(permissionGroups.id, groupId));
  return (await attachPermissions(globalClient, created))[0]!;
}

export interface UpdatePermissionGroupInput {
  projectId: string;
  groupId: string;
  name?: string;
  description?: string | null;
  permissions?: Array<{ permissionId: string; cardReadVisibility?: string | null }>;
}

// PATCH group: name/description optional, permissions (jika ada) REPLACE set
// penuh dalam satu transaksi. BR-040 live reference: assignment member hanya
// menyimpan group_id sehingga perubahan set langsung berlaku tanpa invalidasi.
export async function updatePermissionGroup(globalClient: Client, input: UpdatePermissionGroupInput): Promise<PermissionGroupSummary> {
  const db = drizzle(globalClient);
  const existing = await db.select().from(permissionGroups)
    .where(sql`${permissionGroups.id} = ${input.groupId} AND ${permissionGroups.projectId} = ${input.projectId}`);
  // Group milik Project lain / tidak ada / sudah soft-delete → tidak ditemukan
  // dari sudut pandang Project ini (boundary invariant #4).
  if (existing.length === 0 || existing[0]!.deletedAt !== null) {
    throw new PipelineError("RESOURCE_NOT_FOUND", `Permission Group ${input.groupId} tidak ditemukan di Project ini.`, 404);
  }
  const now = new Date().toISOString();
  if (input.permissions !== undefined) {
    const requested: Array<{ permissionId: string; cardReadVisibility: CardReadVisibility | null }> =
      input.permissions.map((entry) => ({
        permissionId: entry.permissionId,
        cardReadVisibility: normalizeVisibility(entry.cardReadVisibility),
      }));
    const permissionIds = [...new Set(requested.map((entry) => entry.permissionId))];
    const known = permissionIds.length > 0
      ? await db.select({ id: permissions.id, key: permissions.key }).from(permissions)
        .where(inArray(permissions.id, permissionIds))
      : [];
    const keyById = new Map(known.map((row) => [row.id, row.key]));
    for (const id of permissionIds) {
      if (!keyById.has(id)) {
        throw new PipelineError("INVALID_STATE", `permission_id tidak dikenal: ${id}`, 409);
      }
    }
    for (const entry of requested) {
      if (entry.cardReadVisibility != null && keyById.get(entry.permissionId) !== "card.read") {
        throw new PipelineError("INVALID_STATE", "card_read_visibility hanya berlaku untuk permission card.read.", 409);
      }
    }
    await db.transaction(async (tx) => {
      await tx.update(permissionGroups).set({ updatedAt: now }).where(eq(permissionGroups.id, input.groupId)).run();
      await tx.delete(groupPermissions).where(eq(groupPermissions.groupId, input.groupId)).run();
      if (requested.length > 0) {
        await tx.insert(groupPermissions).values(requested.map((entry) => ({
          groupId: input.groupId,
          permissionId: entry.permissionId,
          cardReadVisibility: entry.cardReadVisibility ?? (keyById.get(entry.permissionId) === "card.read" ? "CREATED_BY_ME" : null),
          createdAt: now,
        }))).run();
      }
    });
  }
  await db.update(permissionGroups).set({
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    updatedAt: now,
  }).where(eq(permissionGroups.id, input.groupId)).run();
  const updated = await db.select().from(permissionGroups).where(eq(permissionGroups.id, input.groupId));
  return (await attachPermissions(globalClient, updated))[0]!;
}

// Soft-delete (BR-041): hanya set deleted_at — membership_group_assignments
// TIDAK disentuh (riwayat utuh; member kehilangan grant karena group tidak
// lagi aktif, bukan karena row assignment dihapus).
export async function deletePermissionGroup(globalClient: Client, projectId: string, groupId: string): Promise<PermissionGroupSummary> {
  const db = drizzle(globalClient);
  const existing = await db.select().from(permissionGroups)
    .where(sql`${permissionGroups.id} = ${groupId} AND ${permissionGroups.projectId} = ${projectId}`);
  if (existing.length === 0 || existing[0]!.deletedAt !== null) {
    throw new PipelineError("RESOURCE_NOT_FOUND", `Permission Group ${groupId} tidak ditemukan di Project ini.`, 404);
  }
  const now = new Date().toISOString();
  await db.update(permissionGroups).set({ deletedAt: now, updatedAt: now }).where(eq(permissionGroups.id, groupId)).run();
  const updated = await db.select().from(permissionGroups).where(eq(permissionGroups.id, groupId));
  return (await attachPermissions(globalClient, updated))[0]!;
}

// ===== Scoped assignment endpoints (C.12) — 1.8.1 / 1.8.2 =====

function mapUniqueViolation(error: unknown, message: string): never {
  // Drizzle membungkus error driver di cause — periksa rantai penyebabnya.
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (current.message.includes("UNIQUE constraint failed")) {
      throw new PipelineError("INVALID_STATE", message, 409);
    }
    current = (current as Error & { cause?: unknown }).cause;
  }
  throw error instanceof Error ? error : new Error(String(error));
}

async function requireActiveMembershipRow(globalClient: Client, projectId: string, membershipId: string) {
  const db = drizzle(globalClient);
  const rows = await db.select().from(projectMemberships)
    .where(sql`${projectMemberships.id} = ${membershipId} AND ${projectMemberships.projectId} = ${projectId}`);
  if (rows.length === 0) {
    throw new PipelineError("RESOURCE_NOT_FOUND", `Membership ${membershipId} tidak ditemukan di Project ini.`, 404);
  }
  return rows[0]!;
}

export interface GroupAssignmentSummary {
  id: string;
  membershipId: string;
  groupId: string;
  scopeType: string;
  scopeId: string;
  createdAt: string;
  revokedAt: string | null;
}

// Assign scoped Group ke Membership — Phase 1 hanya scope project
// (BR-042B catatan revisit Phase 2/3 saat resource non-project tersedia).
export async function createGroupAssignment(
  globalClient: Client,
  input: { projectId: string; membershipId: string; groupId: string; scopeType: string; scopeId: string },
): Promise<GroupAssignmentSummary> {
  const membership = await requireActiveMembershipRow(globalClient, input.projectId, input.membershipId);
  if (membership.revokedAt !== null) {
    throw new PipelineError("INVALID_STATE", "Membership sudah di-revoke — tidak dapat menerima assignment baru.", 409);
  }
  if (input.scopeType !== "project") {
    throw new PipelineError("INVALID_STATE", `scope_type '${input.scopeType}' belum didukung di Phase 1 (hanya 'project').`, 409);
  }
  if (input.scopeId !== input.projectId) {
    throw new PipelineError("INVALID_STATE", "scope_id wajib sama dengan project_id untuk scope_type 'project' (BR-042B).", 409);
  }
  const groupRows = await drizzle(globalClient).select().from(permissionGroups)
    .where(sql`${permissionGroups.id} = ${input.groupId} AND ${permissionGroups.projectId} = ${input.projectId}`);
  if (groupRows.length === 0 || groupRows[0]!.deletedAt !== null) {
    throw new PipelineError("RESOURCE_NOT_FOUND", `Permission Group ${input.groupId} tidak ditemukan (aktif) di Project ini.`, 404);
  }
  const now = new Date().toISOString();
  const id = ulid();
  const db = drizzle(globalClient);
  try {
    await db.insert(membershipGroupAssignments).values({
      id,
      membershipId: input.membershipId,
      groupId: input.groupId,
      scopeType: "project",
      scopeId: input.scopeId,
      createdAt: now,
      revokedAt: null,
    }).run();
  } catch (error) {
    mapUniqueViolation(error, "Assignment aktif dengan (membership, group, scope) yang sama sudah ada.");
  }
  return { id, membershipId: input.membershipId, groupId: input.groupId, scopeType: "project", scopeId: input.scopeId, createdAt: now, revokedAt: null };
}

// Revoke mempertahankan riwayat (set revoked_at, bukan delete); idempotent.
export async function revokeGroupAssignment(
  globalClient: Client,
  input: { projectId: string; membershipId: string; assignmentId: string },
): Promise<GroupAssignmentSummary> {
  await requireActiveMembershipRow(globalClient, input.projectId, input.membershipId);
  const db = drizzle(globalClient);
  const rows = await db.select().from(membershipGroupAssignments)
    .where(sql`${membershipGroupAssignments.id} = ${input.assignmentId} AND ${membershipGroupAssignments.membershipId} = ${input.membershipId}`);
  if (rows.length === 0) {
    throw new PipelineError("RESOURCE_NOT_FOUND", `Group assignment ${input.assignmentId} tidak ditemukan untuk Membership ini.`, 404);
  }
  const row = rows[0]!;
  if (row.revokedAt !== null) {
    return { id: row.id, membershipId: row.membershipId, groupId: row.groupId, scopeType: row.scopeType, scopeId: row.scopeId, createdAt: row.createdAt, revokedAt: row.revokedAt };
  }
  const now = new Date().toISOString();
  await db.update(membershipGroupAssignments).set({ revokedAt: now })
    .where(eq(membershipGroupAssignments.id, input.assignmentId)).run();
  return { id: row.id, membershipId: row.membershipId, groupId: row.groupId, scopeType: row.scopeType, scopeId: row.scopeId, createdAt: row.createdAt, revokedAt: now };
}

function parseCardReadVisibility(raw: string | null | undefined): "CREATED_BY_ME" | "ASSIGNED_TO_ME" | "ALL" {
  if (raw === undefined || raw === null) return "CREATED_BY_ME";
  if (raw === "CREATED_BY_ME" || raw === "ASSIGNED_TO_ME" || raw === "ALL") return raw;
  throw new PipelineError("INVALID_STATE", `Nilai card_read_visibility '${raw}' tidak valid.`, 409);
}

export interface PermissionAssignmentSummary {
  id: string;
  membershipId: string;
  permissionId: string;
  scopeType: string;
  scopeId: string;
  cardReadVisibility: string | null;
  createdAt: string;
  revokedAt: string | null;
}

// Assign direct permission ke Membership — Phase 1 hanya scope project.
// Visibility hanya valid untuk card.read (B.2/C.12); default CREATED_BY_ME
// bila tidak dikirim (BR-048).
export async function createPermissionAssignment(
  globalClient: Client,
  input: {
    projectId: string;
    membershipId: string;
    permissionId: string;
    scopeType: string;
    scopeId: string;
    cardReadVisibility?: string | null;
  },
): Promise<PermissionAssignmentSummary> {
  const membership = await requireActiveMembershipRow(globalClient, input.projectId, input.membershipId);
  if (membership.revokedAt !== null) {
    throw new PipelineError("INVALID_STATE", "Membership sudah di-revoke — tidak dapat menerima assignment baru.", 409);
  }
  if (input.scopeType !== "project") {
    throw new PipelineError("INVALID_STATE", `scope_type '${input.scopeType}' belum didukung di Phase 1 (hanya 'project').`, 409);
  }
  if (input.scopeId !== input.projectId) {
    throw new PipelineError("INVALID_STATE", "scope_id wajib sama dengan project_id untuk scope_type 'project' (BR-042B).", 409);
  }
  const permRows = await globalClient.execute({ sql: "SELECT key FROM permissions WHERE id = ?", args: [input.permissionId] });
  if (permRows.rows.length === 0) {
    throw new PipelineError("RESOURCE_NOT_FOUND", `Permission ${input.permissionId} tidak ditemukan.`, 404);
  }
  const permissionKey = String(permRows.rows[0]!.key);
  const requested = input.cardReadVisibility;
  if (requested !== undefined && requested !== null && permissionKey !== "card.read") {
    throw new PipelineError("INVALID_STATE", `card_read_visibility hanya berlaku untuk permission 'card.read', bukan '${permissionKey}'.`, 409);
  }
  const cardReadVisibility = permissionKey === "card.read" ? parseCardReadVisibility(requested) : null;
  const now = new Date().toISOString();
  const id = ulid();
  const db = drizzle(globalClient);
  try {
    await db.insert(membershipPermissionAssignments).values({
      id,
      membershipId: input.membershipId,
      permissionId: input.permissionId,
      scopeType: "project",
      scopeId: input.scopeId,
      cardReadVisibility,
      createdAt: now,
      revokedAt: null,
    }).run();
  } catch (error) {
    mapUniqueViolation(error, "Assignment aktif dengan (membership, permission, scope) yang sama sudah ada.");
  }
  return {
    id,
    membershipId: input.membershipId,
    permissionId: input.permissionId,
    scopeType: "project",
    scopeId: input.scopeId,
    cardReadVisibility,
    createdAt: now,
    revokedAt: null,
  };
}

// Revoke direct permission — mempertahankan riwayat; idempotent.
export async function revokePermissionAssignment(
  globalClient: Client,
  input: { projectId: string; membershipId: string; assignmentId: string },
): Promise<PermissionAssignmentSummary> {
  await requireActiveMembershipRow(globalClient, input.projectId, input.membershipId);
  const db = drizzle(globalClient);
  const rows = await db.select().from(membershipPermissionAssignments)
    .where(sql`${membershipPermissionAssignments.id} = ${input.assignmentId} AND ${membershipPermissionAssignments.membershipId} = ${input.membershipId}`);
  if (rows.length === 0) {
    throw new PipelineError("RESOURCE_NOT_FOUND", `Permission assignment ${input.assignmentId} tidak ditemukan untuk Membership ini.`, 404);
  }
  const row = rows[0]!;
  if (row.revokedAt !== null) {
    return { id: row.id, membershipId: row.membershipId, permissionId: row.permissionId, scopeType: row.scopeType, scopeId: row.scopeId, cardReadVisibility: row.cardReadVisibility, createdAt: row.createdAt, revokedAt: row.revokedAt };
  }
  const now = new Date().toISOString();
  await db.update(membershipPermissionAssignments).set({ revokedAt: now })
    .where(eq(membershipPermissionAssignments.id, input.assignmentId)).run();
  return { id: row.id, membershipId: row.membershipId, permissionId: row.permissionId, scopeType: row.scopeType, scopeId: row.scopeId, cardReadVisibility: row.cardReadVisibility, createdAt: row.createdAt, revokedAt: now };
}

export interface InvitationSummary {
  id: string;
  projectId: string;
  email: string;
  invitedByUserId: string;
  expiresAt: string;
  createdAt: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED";
  groupAssignments: Array<{ groupId: string; scopeType: string; scopeId: string }>;
}

// Create Invitation (C.13) — Group disimpan sebagai reference (BR-050),
// minimal satu assignment (BR-051), default expiry 7 hari (BR-052).
// Invitation + seluruh group reference di-commit atomik (Implementation Rule 8).
export async function createInvitation(
  globalClient: Client,
  input: {
    projectId: string;
    invitedByUserId: string;
    email: string;
    assignments: Array<{ groupId: string; scopeType: string; scopeId: string }>;
    expiresAt?: string | null;
  },
): Promise<InvitationSummary> {
  const email = input.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new PipelineError("INVALID_STATE", `Email '${input.email}' tidak valid.`, 409);
  }
  if (!Array.isArray(input.assignments) || input.assignments.length === 0) {
    throw new PipelineError("INVALID_STATE", "Invitation wajib memiliki minimal satu assignment (BR-051).", 409);
  }
  const now = new Date().toISOString();
  let expiresAt = input.expiresAt ?? undefined;
  if (expiresAt !== undefined && expiresAt !== null) {
    if (Number.isNaN(Date.parse(expiresAt))) {
      throw new PipelineError("INVALID_STATE", `expires_at '${expiresAt}' bukan timestamp ISO yang valid.`, 409);
    }
    if (Date.parse(expiresAt) <= Date.parse(now)) {
      throw new PipelineError("INVALID_STATE", "expires_at harus di masa depan.", 409);
    }
  } else {
    const defaultExpiry = new Date(Date.parse(now) + 7 * 24 * 60 * 60 * 1000);
    expiresAt = defaultExpiry.toISOString();
  }

  // Validasi setiap assignment: group harus ada & aktif di Project ini
  // (BR-042B boundary), Phase 1 hanya scope project.
  for (const assignment of input.assignments) {
    if (assignment.scopeType !== "project") {
      throw new PipelineError("INVALID_STATE", `scope_type '${assignment.scopeType}' belum didukung di Phase 1 (hanya 'project').`, 409);
    }
    if (assignment.scopeId !== input.projectId) {
      throw new PipelineError("INVALID_STATE", "scope_id wajib sama dengan project_id untuk scope_type 'project' (BR-042B).", 409);
    }
    const groupRows = await drizzle(globalClient).select().from(permissionGroups)
      .where(sql`${permissionGroups.id} = ${assignment.groupId} AND ${permissionGroups.projectId} = ${input.projectId}`);
    if (groupRows.length === 0 || groupRows[0]!.deletedAt !== null) {
      throw new PipelineError("RESOURCE_NOT_FOUND", `Permission Group ${assignment.groupId} tidak ditemukan (aktif) di Project ini.`, 404);
    }
  }

  const invitationId = ulid();
  const db = drizzle(globalClient);
  await db.transaction(async (tx) => {
    await tx.insert(invitations).values({
      id: invitationId,
      projectId: input.projectId,
      email,
      invitedByUserId: input.invitedByUserId,
      expiresAt: expiresAt!,
      acceptedAt: null,
      revokedAt: null,
      createdAt: now,
    }).run();
    for (const assignment of input.assignments) {
      await tx.insert(invitationGroupAssignments).values({
        id: ulid(),
        invitationId,
        groupId: assignment.groupId,
        scopeType: "project",
        scopeId: assignment.scopeId,
      }).run();
    }
  });
  return {
    id: invitationId,
    projectId: input.projectId,
    email,
    invitedByUserId: input.invitedByUserId,
    expiresAt: expiresAt!,
    createdAt: now,
    status: "PENDING",
    groupAssignments: input.assignments.map((a) => ({ groupId: a.groupId, scopeType: a.scopeType, scopeId: a.scopeId })),
  };
}

// Accept Invitation (C.13 / FR-007): validasi state, lalu atomik —
// membership baru + seluruh group assignment dari invitation + accepted_at.
export interface AcceptInvitationResult {
  projectId: string;
  membershipId: string;
  userId: string;
  acceptedAt: string;
  appliedGroupAssignments: Array<{ groupId: string; scopeType: string; scopeId: string }>;
}

export async function acceptInvitation(
  globalClient: Client,
  input: { invitationId: string; userId: string },
): Promise<AcceptInvitationResult> {
  const db = drizzle(globalClient);
  const rows = await db.select().from(invitations).where(eq(invitations.id, input.invitationId));
  if (rows.length === 0) {
    throw new PipelineError("RESOURCE_NOT_FOUND", `Invitation ${input.invitationId} tidak ditemukan.`, 404);
  }
  const invitation = rows[0]!;
  const now = new Date().toISOString();
  if (invitation.revokedAt !== null) {
    throw new PipelineError("INVALID_STATE", "Invitation sudah di-revoke.", 409);
  }
  if (invitation.acceptedAt !== null) {
    throw new PipelineError("INVITATION_ALREADY_USED", "Invitation sudah pernah diterima.", 409);
  }
  if (Date.parse(invitation.expiresAt) <= Date.parse(now)) {
    throw new PipelineError("INVITATION_EXPIRED", "Invitation sudah kedaluwarsa.", 409);
  }
  // Unique keras (project, user): user yang masih/pernah member tidak dapat
  // menerima invitation lagi di Phase 1.
  const existingMembership = await db.select().from(projectMemberships)
    .where(sql`${projectMemberships.projectId} = ${invitation.projectId} AND ${projectMemberships.userId} = ${input.userId}`);
  if (existingMembership.length > 0) {
    const state = existingMembership[0]!.revokedAt !== null ? "pernah menjadi member (sudah di-revoke)" : "sudah menjadi member aktif";
    throw new PipelineError("INVALID_STATE", `User ${state} pada Project ini.`, 409);
  }
  const groupRows = await db.select().from(invitationGroupAssignments)
    .where(eq(invitationGroupAssignments.invitationId, invitation.id));
  if (groupRows.length === 0) {
    throw new PipelineError("INVITATION_EXPIRED", "Invitation tidak memiliki assignment yang valid.", 409);
  }

  const membershipId = ulid();
  await db.transaction(async (tx) => {
    await tx.insert(projectMemberships).values({
      id: membershipId,
      projectId: invitation.projectId,
      userId: input.userId,
      createdAt: now,
      revokedAt: null,
    }).run();
    for (const row of groupRows) {
      await tx.insert(membershipGroupAssignments).values({
        id: ulid(),
        membershipId,
        groupId: row.groupId,
        scopeType: row.scopeType,
        scopeId: row.scopeId,
        createdAt: now,
        revokedAt: null,
      }).run();
    }
    await tx.update(invitations).set({ acceptedAt: now }).where(eq(invitations.id, invitation.id)).run();
  });
  return {
    projectId: invitation.projectId,
    membershipId,
    userId: input.userId,
    acceptedAt: now,
    appliedGroupAssignments: groupRows.map((r) => ({ groupId: r.groupId, scopeType: r.scopeType, scopeId: r.scopeId })),
  };
}
