import type { Client } from "@libsql/client";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
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
  users,
  type ScopedScopeType,
} from "./global-schema.ts";
import { PipelineError } from "../pipeline/errors.ts";
import { runInDrizzleWriteTransaction } from "./transaction.ts";
import { loadEffectivePermissionInputs } from "./permission-resolution.ts";
import { permissionCatalogKeys } from "./permission-catalog.ts";
import { resolveEffectivePermissions, hasPermission } from "@kanban/domain";
import { cleanupAssigneesForRevokedMembership } from "./card-assignee-cleanup.ts";

// Semua operasi di modul ini bekerja pada tabel Global DB (authorization
// plane), BUKAN Project DB — persistence tetap di balik boundary ini dan
// selalu menegakkan Project boundary lewat parameter projectId (invariant #4).

/**
 * BR-042B — Validasi bahwa scope resource ada dan berada dalam Project yang sama.
 * Untuk scopeType "project", scopeId wajib sama dengan projectId.
 * Untuk scopeType lainnya, scopeId harus merujuk ke resource yang ada di Project DB.
 */
export async function validateScopeResource(
  projectDb: Client | null,
  projectId: string,
  scopeType: string,
  scopeId: string,
): Promise<void> {
  if (scopeType === "project") {
    if (scopeId !== projectId) {
      throw new PipelineError("INVALID_STATE", "scope_id wajib sama dengan project_id untuk scope_type 'project' (BR-042B).", 409);
    }
    return;
  }
  if (!projectDb) {
    throw new PipelineError("INVALID_STATE", "Project DB tidak tersedia untuk validasi scope resource.", 500);
  }
  const tableMap: Record<string, string> = {
    milestone: "milestones",
    board: "boards",
    list: "lists",
    card: "cards",
  };
  const table = tableMap[scopeType];
  if (!table) {
    throw new PipelineError("VALIDATION_ERROR", `scope_type '${scopeType}' tidak valid.`, 400);
  }
  const result = await projectDb.execute({
    sql: `SELECT id FROM ${table} WHERE id = ?`,
    args: [scopeId],
  });
  if (result.rows.length === 0) {
    throw new PipelineError("INVALID_STATE", `${scopeType} '${scopeId}' tidak ditemukan di Project ini (BR-042B).`, 409);
  }
}

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
/**
 * BR-054C (2) — guard khusus pemilihan assignee BARU: membership harus aktif
 * DAN tidak sedang `revocation_pending_at`. Authorization lama tetap berlaku
 * sampai `revoked_at` commit — guard ini HANYA memblok assignment baru.
 */
export async function assertAssigneeNotRevocationPending(
  globalClient: Client,
  projectId: string,
  userId: string,
): Promise<void> {
  await requireActiveMember(globalClient, projectId, userId);
  const result = await globalClient.execute({
    sql: "SELECT revocation_pending_at FROM project_memberships WHERE project_id = ? AND user_id = ? AND revoked_at IS NULL AND revocation_pending_at IS NOT NULL LIMIT 1",
    args: [projectId, userId],
  });
  if (result.rows[0]) {
    throw new PipelineError(
      "INVALID_STATE",
      "User sedang dalam proses pencabutan Membership — tidak dapat dipilih sebagai assignee baru (BR-054C).",
      409,
    );
  }
}

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
  throw new PipelineError("VALIDATION_ERROR", `card_read_visibility tidak valid: ${String(value)}`, 400);
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
      throw new PipelineError("VALIDATION_ERROR", `permission_id tidak dikenal: ${id}`, 400);
    }
  }
  for (const entry of requested) {
    if (entry.cardReadVisibility != null && keyById.get(entry.permissionId) !== "card.read") {
      throw new PipelineError("VALIDATION_ERROR", "card_read_visibility hanya berlaku untuk permission card.read.", 400);
    }
  }
  const groupId = ulid();
  await runInDrizzleWriteTransaction(db, async (tx) => {
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
  let requestedPermissions: Array<{ permissionId: string; cardReadVisibility: CardReadVisibility | null }> | undefined;
  let keyById: Map<string, string> | undefined;
  if (input.permissions !== undefined) {
    requestedPermissions = input.permissions.map((entry) => ({
      permissionId: entry.permissionId,
      cardReadVisibility: normalizeVisibility(entry.cardReadVisibility),
    }));
    const permissionIds = [...new Set(requestedPermissions.map((entry) => entry.permissionId))];
    const known = permissionIds.length > 0
      ? await db.select({ id: permissions.id, key: permissions.key }).from(permissions)
        .where(inArray(permissions.id, permissionIds))
      : [];
    keyById = new Map(known.map((row) => [row.id, row.key]));
    for (const id of permissionIds) {
      if (!keyById.has(id)) {
        throw new PipelineError("VALIDATION_ERROR", `permission_id tidak dikenal: ${id}`, 400);
      }
    }
    for (const entry of requestedPermissions) {
      if (entry.cardReadVisibility != null && keyById.get(entry.permissionId) !== "card.read") {
        throw new PipelineError("VALIDATION_ERROR", "card_read_visibility hanya berlaku untuk permission card.read.", 400);
      }
    }
  }
  await runInDrizzleWriteTransaction(db, async (tx) => {
    await tx.update(permissionGroups).set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      updatedAt: now,
    }).where(eq(permissionGroups.id, input.groupId)).run();
    if (requestedPermissions !== undefined) {
      await tx.delete(groupPermissions).where(eq(groupPermissions.groupId, input.groupId)).run();
      if (requestedPermissions.length > 0) {
        await tx.insert(groupPermissions).values(requestedPermissions.map((entry) => ({
          groupId: input.groupId,
          permissionId: entry.permissionId,
          cardReadVisibility: entry.cardReadVisibility ?? (keyById!.get(entry.permissionId) === "card.read" ? "CREATED_BY_ME" : null),
          createdAt: now,
        }))).run();
      }
    }
  });
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
  // BR-019/invariant #7 — conditional write + ownership via RETURNING:
  // race dengan worker lain yang menang terdeteksi dan dikonsistenkan
  // dengan kontrak sequential (sudah-deleted → 404).
  const claimed = await db.update(permissionGroups)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(permissionGroups.id, groupId), isNull(permissionGroups.deletedAt)))
    .returning({ id: permissionGroups.id });
  if (claimed.length === 0) {
    throw new PipelineError("RESOURCE_NOT_FOUND", `Permission Group ${groupId} tidak ditemukan di Project ini.`, 404);
  }
  const updated = await db.select().from(permissionGroups).where(eq(permissionGroups.id, groupId));
  return (await attachPermissions(globalClient, updated))[0]!;
}

// ===== Scoped assignment endpoints (C.12) — 1.8.1 / 1.8.2 =====

function mapUniqueViolation(error: unknown, message: string): never {
  // Drizzle membungkus error driver di cause — periksa rantai penyebabnya.
  // Cek .code terstruktur (SQLITE_CONSTRAINT_UNIQUE/SQLITE_CONSTRAINT), BUKAN
  // substring .message — pelajaran isBusy() (CL-65): pesan driver bisa
  // berubah antar versi/mode koneksi, code konstan lebih reliable.
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    const code = (current as Error & { code?: unknown }).code;
    if (code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT") {
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

// Assign scoped Group ke Membership — BR-042: scope Project/Milestone/Board/List/Card.
export async function createGroupAssignment(
  globalClient: Client,
  input: { projectId: string; membershipId: string; groupId: string; scopeType: string; scopeId: string },
  projectDb?: Client | null,
): Promise<GroupAssignmentSummary> {
  const membership = await requireActiveMembershipRow(globalClient, input.projectId, input.membershipId);
  if (membership.revokedAt !== null) {
    throw new PipelineError("INVALID_STATE", "Membership sudah di-revoke — tidak dapat menerima assignment baru.", 409);
  }
  const validScopeTypes = ["project", "milestone", "board", "list", "card"];
  if (!validScopeTypes.includes(input.scopeType)) {
    throw new PipelineError("VALIDATION_ERROR", `scope_type '${input.scopeType}' tidak valid. Harus salah satu: ${validScopeTypes.join(", ")}.`, 400);
  }
  await validateScopeResource(projectDb ?? null, input.projectId, input.scopeType, input.scopeId);
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
      scopeType: input.scopeType as ScopedScopeType,
      scopeId: input.scopeId,
      createdAt: now,
      revokedAt: null,
    }).run();
  } catch (error) {
    mapUniqueViolation(error, "Assignment aktif dengan (membership, group, scope) yang sama sudah ada.");
  }
  return { id, membershipId: input.membershipId, groupId: input.groupId, scopeType: input.scopeType, scopeId: input.scopeId, createdAt: now, revokedAt: null };
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
  // BR-019/invariant #7 — conditional write; race-loser mengembalikan state
  // aktual milik pemenang (idempoten), bukan timestamp lokal.
  const claimed = await db.update(membershipGroupAssignments).set({ revokedAt: now })
    .where(and(
      eq(membershipGroupAssignments.id, input.assignmentId),
      isNull(membershipGroupAssignments.revokedAt),
    ))
    .returning({
      id: membershipGroupAssignments.id,
      membershipId: membershipGroupAssignments.membershipId,
      groupId: membershipGroupAssignments.groupId,
      scopeType: membershipGroupAssignments.scopeType,
      scopeId: membershipGroupAssignments.scopeId,
      createdAt: membershipGroupAssignments.createdAt,
      revokedAt: membershipGroupAssignments.revokedAt,
    });
  if (claimed.length > 0) {
    return { ...claimed[0]!, revokedAt: claimed[0]!.revokedAt };
  }
  const fresh = await db.select().from(membershipGroupAssignments)
    .where(eq(membershipGroupAssignments.id, input.assignmentId));
  const f = fresh[0]!;
  return { id: f.id, membershipId: f.membershipId, groupId: f.groupId, scopeType: f.scopeType, scopeId: f.scopeId, createdAt: f.createdAt, revokedAt: f.revokedAt ?? now };
}

function parseCardReadVisibility(raw: string | null | undefined): "CREATED_BY_ME" | "ASSIGNED_TO_ME" | "ALL" {
  if (raw === undefined || raw === null) return "CREATED_BY_ME";
  if (raw === "CREATED_BY_ME" || raw === "ASSIGNED_TO_ME" || raw === "ALL") return raw;
  throw new PipelineError("VALIDATION_ERROR", `Nilai card_read_visibility '${raw}' tidak valid.`, 400);
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

// Assign direct permission ke Membership — BR-042A: scope Project/Milestone/Board/List/Card.
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
  projectDb?: Client | null,
): Promise<PermissionAssignmentSummary> {
  const membership = await requireActiveMembershipRow(globalClient, input.projectId, input.membershipId);
  if (membership.revokedAt !== null) {
    throw new PipelineError("INVALID_STATE", "Membership sudah di-revoke — tidak dapat menerima assignment baru.", 409);
  }
  const validScopeTypes = ["project", "milestone", "board", "list", "card"];
  if (!validScopeTypes.includes(input.scopeType)) {
    throw new PipelineError("VALIDATION_ERROR", `scope_type '${input.scopeType}' tidak valid. Harus salah satu: ${validScopeTypes.join(", ")}.`, 400);
  }
  await validateScopeResource(projectDb ?? null, input.projectId, input.scopeType, input.scopeId);
  const permRows = await globalClient.execute({ sql: "SELECT key FROM permissions WHERE id = ?", args: [input.permissionId] });
  if (permRows.rows.length === 0) {
    throw new PipelineError("RESOURCE_NOT_FOUND", `Permission ${input.permissionId} tidak ditemukan.`, 404);
  }
  const permissionKey = String(permRows.rows[0]!.key);
  const requested = input.cardReadVisibility;
  if (requested !== undefined && requested !== null && permissionKey !== "card.read") {
    throw new PipelineError("VALIDATION_ERROR", `card_read_visibility hanya berlaku untuk permission 'card.read', bukan '${permissionKey}'.`, 400);
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
      scopeType: input.scopeType as ScopedScopeType,
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
    scopeType: input.scopeType,
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
  const claimed = await db.update(membershipPermissionAssignments).set({ revokedAt: now })
    .where(and(
      eq(membershipPermissionAssignments.id, input.assignmentId),
      isNull(membershipPermissionAssignments.revokedAt),
    ))
    .returning({
      id: membershipPermissionAssignments.id,
      membershipId: membershipPermissionAssignments.membershipId,
      permissionId: membershipPermissionAssignments.permissionId,
      scopeType: membershipPermissionAssignments.scopeType,
      scopeId: membershipPermissionAssignments.scopeId,
      cardReadVisibility: membershipPermissionAssignments.cardReadVisibility,
      createdAt: membershipPermissionAssignments.createdAt,
      revokedAt: membershipPermissionAssignments.revokedAt,
    });
  if (claimed.length > 0) {
    return { ...claimed[0]!, revokedAt: claimed[0]!.revokedAt };
  }
  const fresh = await db.select().from(membershipPermissionAssignments)
    .where(eq(membershipPermissionAssignments.id, input.assignmentId));
  const f = fresh[0]!;
  return { id: f.id, membershipId: f.membershipId, permissionId: f.permissionId, scopeType: f.scopeType, scopeId: f.scopeId, cardReadVisibility: f.cardReadVisibility, createdAt: f.createdAt, revokedAt: f.revokedAt ?? now };
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
// minimal satu assignment (BR-051), default expiry 3 hari (BR-052A).
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
  projectDb?: Client | null,
): Promise<InvitationSummary> {
  const email = input.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new PipelineError("VALIDATION_ERROR", `Email '${input.email}' tidak valid.`, 400);
  }
  if (!Array.isArray(input.assignments) || input.assignments.length === 0) {
    throw new PipelineError("VALIDATION_ERROR", "Invitation wajib memiliki minimal satu assignment (BR-051).", 400);
  }
  const now = new Date().toISOString();
  let expiresAt = input.expiresAt ?? undefined;
  if (expiresAt !== undefined && expiresAt !== null) {
    if (Number.isNaN(Date.parse(expiresAt))) {
      throw new PipelineError("VALIDATION_ERROR", `expires_at '${expiresAt}' bukan timestamp ISO yang valid.`, 400);
    }
    if (Date.parse(expiresAt) <= Date.parse(now)) {
      throw new PipelineError("INVALID_STATE", "expires_at harus di masa depan.", 409);
    }
  } else {
    const defaultExpiry = new Date(Date.parse(now) + 3 * 24 * 60 * 60 * 1000);
    expiresAt = defaultExpiry.toISOString();
  }

  // Validasi setiap assignment: group harus ada & aktif di Project ini (BR-042B).
  const validScopeTypes = ["project", "milestone", "board", "list", "card"];
  for (const assignment of input.assignments) {
    if (!validScopeTypes.includes(assignment.scopeType)) {
      throw new PipelineError("VALIDATION_ERROR", `scope_type '${assignment.scopeType}' tidak valid. Harus salah satu: ${validScopeTypes.join(", ")}.`, 400);
    }
    await validateScopeResource(projectDb ?? null, input.projectId, assignment.scopeType, assignment.scopeId);
    const groupRows = await drizzle(globalClient).select().from(permissionGroups)
      .where(sql`${permissionGroups.id} = ${assignment.groupId} AND ${permissionGroups.projectId} = ${input.projectId}`);
    if (groupRows.length === 0 || groupRows[0]!.deletedAt !== null) {
      throw new PipelineError("RESOURCE_NOT_FOUND", `Permission Group ${assignment.groupId} tidak ditemukan (aktif) di Project ini.`, 404);
    }
  }

  const invitationId = ulid();
  const db = drizzle(globalClient);
  await runInDrizzleWriteTransaction(db, async (tx) => {
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
        scopeType: assignment.scopeType as ScopedScopeType,
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
  // 02-SPEC C.13 (amandemen 4.0.0) — envelope route MUST { invitation: {...} };
  // disertakan di sini agar route tidak perlu query ulang.
  invitation: InvitationListSummary;
}

export async function acceptInvitation(
  globalClient: Client,
  input: { invitationId: string; userId: string; userEmail: string },
): Promise<AcceptInvitationResult> {
  const db = drizzle(globalClient);
  const pre = await db.select().from(invitations).where(eq(invitations.id, input.invitationId));
  if (pre.length === 0) {
    throw new PipelineError("RESOURCE_NOT_FOUND", `Invitation ${input.invitationId} tidak ditemukan.`, 404);
  }
  const now = new Date().toISOString();
  // BR-054A — email check boleh di luar tx (tidak state-dependent).
  if (input.userEmail.toLowerCase() !== pre[0]!.email.toLowerCase()) {
    throw new PipelineError("PERMISSION_DENIED", "Tidak dapat menerima invitation ini.", 403);
  }

  let membershipId = "";
  let result!: AcceptInvitationResult;

  // BR-019/invariant #7 (QA-CL-07) — seluruh validasi current-state dipindah
  // ke DALAM transaksi; race accept-vs-revoke diselesaikan oleh conditional
  // write terakhir sehingga accepted+revoked mustahil bersamaan.
  await runInDrizzleWriteTransaction(db, async (tx) => {
    const rows = await tx.select().from(invitations).where(eq(invitations.id, input.invitationId));
    const invitation = rows[0];
    if (!invitation) {
      throw new PipelineError("RESOURCE_NOT_FOUND", `Invitation ${input.invitationId} tidak ditemukan.`, 404);
    }
    if (invitation.revokedAt !== null) {
      throw new PipelineError("INVALID_STATE", "Invitation sudah di-revoke.", 409);
    }
    if (invitation.acceptedAt !== null) {
      throw new PipelineError("INVITATION_ALREADY_USED", "Invitation sudah pernah diterima.", 409);
    }
    if (Date.parse(invitation.expiresAt) <= Date.parse(now)) {
      throw new PipelineError("INVITATION_EXPIRED", "Invitation sudah kedaluwarsa.", 410);
    }
    const existingMembership = await tx.select().from(projectMemberships)
      .where(sql`${projectMemberships.projectId} = ${invitation.projectId} AND ${projectMemberships.userId} = ${input.userId}`);
    const groupRows = await tx.select().from(invitationGroupAssignments)
      .where(eq(invitationGroupAssignments.invitationId, invitation.id));
    if (groupRows.length === 0) {
      throw new PipelineError("INVITATION_EXPIRED", "Invitation tidak memiliki assignment yang valid.", 410);
    }


      if (existingMembership.length > 0) {
        // BR-054B: reactivate revoked membership
        const existing = existingMembership[0]!;
        if (existing.revokedAt === null) {
          throw new PipelineError("INVALID_STATE", "User sudah menjadi member aktif pada Project ini.", 409);
        }
        membershipId = existing.id;
        await tx.update(projectMemberships).set({ revokedAt: null }).where(eq(projectMemberships.id, membershipId)).run();
        // BR-053: revoke old active assignments before inserting new ones (preserve history)
        await tx.update(membershipGroupAssignments).set({ revokedAt: now }).where(
          sql`${membershipGroupAssignments.membershipId} = ${membershipId} AND ${membershipGroupAssignments.revokedAt} IS NULL`,
        ).run();
        await tx.update(membershipPermissionAssignments).set({ revokedAt: now }).where(
          sql`${membershipPermissionAssignments.membershipId} = ${membershipId} AND ${membershipPermissionAssignments.revokedAt} IS NULL`,
        ).run();
      } else {
        membershipId = ulid();
        await tx.insert(projectMemberships).values({
          id: membershipId,
          projectId: invitation.projectId,
          userId: input.userId,
          createdAt: now,
          revokedAt: null,
        }).run();
      }
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
      // Finalize conditional — kalah race → INVALID_STATE (accepted+revoked mustahil).
      const claimedInv = await tx.update(invitations).set({ acceptedAt: now })
        .where(and(
          eq(invitations.id, invitation.id),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ))
        .returning({ id: invitations.id });
      if (claimedInv.length === 0) {
        throw new PipelineError("INVALID_STATE", "Invitation sudah di-revoke oleh request lain.", 409);
      }

      result = {
        projectId: invitation.projectId,
        membershipId,
        userId: input.userId,
        acceptedAt: now,
        appliedGroupAssignments: groupRows.map((r) => ({ groupId: r.groupId, scopeType: r.scopeType, scopeId: r.scopeId })),
        invitation: {
          id: invitation.id,
          email: invitation.email,
          expiresAt: invitation.expiresAt,
          acceptedAt: now,
          revokedAt: invitation.revokedAt,
          createdAt: invitation.createdAt,
        },
      };
  });
  return result;
}
export interface ProjectMemberSummary {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  createdAt: string;
  revokedAt: string | null;
}

// List Membership Project (C.12 amandemen 2.1.0/2.4.0, FR-008).
// status: subset "active"/"revoked"; tanpa parameter → keduanya.
export async function listProjectMembers(
  globalClient: Client,
  projectId: string,
  opts: { status?: Array<"active" | "revoked"> } = {},
): Promise<ProjectMemberSummary[]> {
  const statuses = opts.status ?? ["active", "revoked"];
  const conditions = [sql`${projectMemberships.projectId} = ${projectId}`];
  if (!statuses.includes("active")) {
    conditions.push(sql`${projectMemberships.revokedAt} IS NOT NULL`);
  } else if (!statuses.includes("revoked")) {
    conditions.push(sql`${projectMemberships.revokedAt} IS NULL`);
  }
  const rows = await drizzle(globalClient)
    .select({
      membershipId: projectMemberships.id,
      userId: projectMemberships.userId,
      email: users.email,
      name: users.name,
      createdAt: projectMemberships.createdAt,
      revokedAt: projectMemberships.revokedAt,
    })
    .from(projectMemberships)
    .innerJoin(users, eq(users.id, projectMemberships.userId))
    .where(sql.join(conditions, sql` AND `))
    .orderBy(asc(projectMemberships.createdAt));
  return rows;
}

// Revoke Membership (C.12 amandemen 2.1.0, BR-053, FR-002): set revoked_at
// saja — riwayat assignment tidak disentuh; Owner tidak dapat di-revoke.
// TASK-2.12: setelah commit Global, cleanup assignee Card di Project DB
// berjalan terpisah (03-ENG A.5 — app-layer, tanpa transaksi lintas-DB).
export async function revokeMembership(
  globalClient: Client,
  input: { projectId: string; membershipId: string; actorUserId?: string },
  projectDb?: Client | null,
): Promise<ProjectMemberSummary> {
  const db = drizzle(globalClient);
  const rows = await db.select().from(projectMemberships)
    .where(sql`${projectMemberships.id} = ${input.membershipId} AND ${projectMemberships.projectId} = ${input.projectId}`);
  if (rows.length === 0) {
    throw new PipelineError("RESOURCE_NOT_FOUND", `Membership ${input.membershipId} tidak ditemukan di Project ini.`, 404);
  }
  const membership = rows[0]!;
  if (membership.revokedAt === null && membership.userId === (await getProjectOwnerId(globalClient, input.projectId))) {
    throw new PipelineError("INVALID_STATE", "Owner Membership tidak dapat di-revoke — Project wajib memiliki tepat satu Owner aktif (FR-002).", 409);
  }

  // BR-054C — protokol lintas-DB retryable:
  // (1) claim conditional `revocation_pending_at` (idempotent untuk retry —
  //     claim kedua adalah no-op; proses tetap dilanjutkan sebagai recovery).
  if (membership.revokedAt === null) {
    // BR-054C (1) — claim conditional `revocation_pending_at`. Retry setelah
    // crash menemui pending sudah terisi: claim ini no-op dan alur tetap
    // dilanjutkan sebagai recovery (idempotent).
    await db.update(projectMemberships)
      .set({ revocationPendingAt: new Date().toISOString() })
      .where(and(
        eq(projectMemberships.id, input.membershipId),
        isNull(projectMemberships.revokedAt),
        isNull(projectMemberships.revocationPendingAt),
      ))
      .run();

    // BR-054C (3) — cleanup SELURUH Card + satu Activity per Card dalam SATU
    // transaksi Project DB. Gagal di sini = rollback penuh; pending guard
    // tetap aktif (authorization belum dicabut) sampai retry.
    if (projectDb) {
      await cleanupAssigneesForRevokedMembership(
        projectDb,
        input.projectId,
        membership.userId,
        input.actorUserId ?? membership.userId,
      );
    }

    // BR-054C (4) — finalisasi conditional: `revoked_at` + clear pending.
    // Authorization baru benar-benar dicabut pada commit ini.
    const finalizedAt = new Date().toISOString();
    await db.update(projectMemberships)
      .set({ revokedAt: finalizedAt, revocationPendingAt: null })
      .where(and(
        eq(projectMemberships.id, input.membershipId),
        isNull(projectMemberships.revokedAt),
        isNotNull(projectMemberships.revocationPendingAt),
      ))
      .run();
  }
  // Konsistensi caller (QA-CL-26): summary SELALU dari state DB terkini —
  // caller yang kalah claim/finalize mengembalikan nilai final yang sama
  // dengan pemenang, bukan timestamp lokalnya.
  const freshRows = await db.select().from(projectMemberships)
    .where(eq(projectMemberships.id, input.membershipId)).run();
  const freshRevokedAt = (freshRows.rows[0] as unknown as { revoked_at: string | null }).revoked_at;

  const userRows = await globalClient.execute({ sql: "SELECT email, name FROM users WHERE id = ?", args: [membership.userId] });
  return {
    membershipId: membership.id,
    userId: membership.userId,
    email: String(userRows.rows[0]!.email),
    name: String(userRows.rows[0]!.name),
    createdAt: membership.createdAt,
    revokedAt: freshRevokedAt,
  };
}

export interface InvitationListSummary {
  id: string;
  email: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

// List Invitation Project (C.13 amandemen 2.5.0) — termasuk accepted/revoked/expired,
// tanpa filter server-side; client filter dari accepted_at/revoked_at/expires_at.
export async function listProjectInvitations(
  globalClient: Client,
  projectId: string,
): Promise<InvitationListSummary[]> {
  const db = drizzle(globalClient);
  const rows = await db.select().from(invitations)
    .where(eq(invitations.projectId, projectId))
    .orderBy(asc(invitations.createdAt));
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  }));
}

// Revoke Invitation (C.13 amandemen 2.5.0, FR-006) — set revoked_at;
// invitation sudah accepted MUST NOT dapat di-revoke.
export async function revokeInvitation(
  globalClient: Client,
  input: { projectId: string; invitationId: string },
): Promise<InvitationListSummary> {
  const db = drizzle(globalClient);
  const rows = await db.select().from(invitations)
    .where(sql`${invitations.id} = ${input.invitationId} AND ${invitations.projectId} = ${input.projectId}`);
  if (rows.length === 0) {
    throw new PipelineError("RESOURCE_NOT_FOUND", `Invitation ${input.invitationId} tidak ditemukan di Project ini.`, 404);
  }
  const invitation = rows[0]!;
  if (invitation.acceptedAt !== null) {
    throw new PipelineError("INVALID_STATE", "Invitation sudah diterima dan tidak dapat di-revoke.", 409);
  }
  const now = new Date().toISOString();
  let revokedAt = invitation.revokedAt;
  if (revokedAt === null) {
    // BR-019/invariant #7 — conditional write; kalah race terhadap accept
    // → INVALID_STATE (kombinasi accepted+revoked mustahil).
    const claimed = await db.update(invitations).set({ revokedAt: now })
      .where(and(
        eq(invitations.id, input.invitationId),
        isNull(invitations.revokedAt),
        isNull(invitations.acceptedAt),
      ))
      .returning({ id: invitations.id });
    if (claimed.length === 0) {
      throw new PipelineError("INVALID_STATE", "Invitation sudah diterima dan tidak dapat di-revoke.", 409);
    }
    revokedAt = now;
  }
  return {
    id: invitation.id,
    email: invitation.email,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    revokedAt,
    createdAt: invitation.createdAt,
  };
}

// ---------------------------------------------------------------------------
// TASK-4.6.1 — GET .../members/:membership_id/assignments
// ---------------------------------------------------------------------------

export interface MembershipAssignmentsList {
  groupAssignments: GroupAssignmentSummary[];
  permissionAssignments: PermissionAssignmentSummary[];
}

/** Membership milik projectId ini? null bila tidak ditemukan / lintas-Project (boundary). */
export async function getMembershipInProject(
  globalClient: Client,
  projectId: string,
  membershipId: string,
): Promise<{ id: string; userId: string } | null> {
  const result = await globalClient.execute({
    sql: "SELECT id, user_id FROM project_memberships WHERE id = ? AND project_id = ? LIMIT 1",
    args: [membershipId, projectId],
  });
  const row = result.rows[0];
  if (!row) return null;
  return { id: String(row.id), userId: String(row.user_id) };
}

/**
 * Seluruh assignment Membership (AKTIF dan REVOKED, tanpa filter — pola
 * GET /invitations). Return null bila membership bukan milik Project ini.
 */
export async function listMembershipAssignments(
  globalClient: Client,
  projectId: string,
  membershipId: string,
): Promise<MembershipAssignmentsList | null> {
  const membership = await getMembershipInProject(globalClient, projectId, membershipId);
  if (!membership) return null;
  const [groupRows, directRows] = await Promise.all([
    globalClient.execute({
      sql: "SELECT id, membership_id, group_id, scope_type, scope_id, created_at, revoked_at FROM membership_group_assignments WHERE membership_id = ? ORDER BY created_at, id",
      args: [membershipId],
    }),
    globalClient.execute({
      sql: "SELECT id, membership_id, permission_id, scope_type, scope_id, card_read_visibility, created_at, revoked_at FROM membership_permission_assignments WHERE membership_id = ? ORDER BY created_at, id",
      args: [membershipId],
    }),
  ]);
  return {
    groupAssignments: groupRows.rows.map((row) => ({
      id: String(row.id),
      membershipId: String(row.membership_id),
      groupId: String(row.group_id),
      scopeType: String(row.scope_type),
      scopeId: String(row.scope_id),
      createdAt: String(row.created_at),
      revokedAt: row.revoked_at === null ? null : String(row.revoked_at),
    })),
    permissionAssignments: directRows.rows.map((row) => ({
      id: String(row.id),
      membershipId: String(row.membership_id),
      permissionId: String(row.permission_id),
      scopeType: String(row.scope_type),
      scopeId: String(row.scope_id),
      cardReadVisibility: row.card_read_visibility === null ? null : String(row.card_read_visibility),
      createdAt: String(row.created_at),
      revokedAt: row.revoked_at === null ? null : String(row.revoked_at),
    })),
  };
}

/** Authz `member.read` utk router admin — engine sama (4.1), scope Project root. */
export async function assertPermissionKey(
  globalClient: Client,
  projectId: string,
  requesterUserId: string,
  key: string,
): Promise<void> {
  const ownerId = await getProjectOwnerId(globalClient, projectId);
  if (ownerId === null) {
    throw new PipelineError("RESOURCE_NOT_FOUND", `Project ${projectId} tidak ditemukan.`, 404);
  }
  if (ownerId === requesterUserId) return; // BR-037
  const membershipResult = await globalClient.execute({
    sql: "SELECT id FROM project_memberships WHERE project_id = ? AND user_id = ? AND revoked_at IS NULL LIMIT 1",
    args: [projectId, requesterUserId],
  });
  const membershipRow = membershipResult.rows[0];
  if (!membershipRow) {
    throw new PipelineError("PERMISSION_DENIED", "User bukan member aktif Project ini.", 403);
  }
  const inputs = await loadEffectivePermissionInputs(globalClient, String(membershipRow.id));
  const effective = resolveEffectivePermissions({
    allPermissionKeys: permissionCatalogKeys(),
    groupAssignments: inputs.groupAssignments,
    directAssignments: inputs.directAssignments,
    hierarchy: { projectId },
    isOwner: false,
  });
  if (!hasPermission(effective, key)) {
    throw new PipelineError("PERMISSION_DENIED", `Permission '${key}' tidak dimiliki pada scope ini.`, 403);
  }
}

/**
 * C.12 — Endpoint read-only mengembalikan seluruh permission catalog.
 * Query langsung dari tabel Global DB `permissions` (bukan in-memory),
 * mengembalikan `{ id, key, description }` per entry.
 */
export async function listPermissions(globalClient: Client): Promise<Array<{ id: string; key: string; description: string | null }>> {
  const db = drizzle(globalClient);
  const rows = await db.select({
    id: permissions.id,
    key: permissions.key,
    description: permissions.description,
  }).from(permissions).orderBy(asc(permissions.key));
  return rows.map((row) => ({
    id: String(row.id),
    key: String(row.key),
    description: row.description ?? null,
  }));
}
