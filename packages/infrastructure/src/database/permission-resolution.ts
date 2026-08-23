import type { Client } from "@libsql/client";
import type {
  CardReadVisibility,
  GroupPermissionEntry,
  ScopedDirectPermissionInput,
  ScopedGroupAssignmentInput,
} from "@kanban/domain";

export interface EffectivePermissionInputs {
  groupAssignments: ScopedGroupAssignmentInput[];
  directAssignments: ScopedDirectPermissionInput[];
}

interface GroupRow {
  scopeType: string;
  scopeId: string;
  groupId: string;
  key: string | null;
  cardReadVisibility: string | null;
}

/**
 * Load seluruh scoped assignment AKTIF milik SATU Membership dari Global DB —
 * bentuk return siap-pakai untuk resolveEffectivePermissions (TASK-4.1.1).
 *
 * BR-038 (union), BR-040 (visibility per-entry Group dibawa, tidak dibuang),
 * BR-041 (Group soft-delete → assignment-nya tidak memberi apa pun),
 * BR-042B (validasi hierarchy dilakukan engine, bukan di sini).
 */
export async function loadEffectivePermissionInputs(
  globalClient: Client,
  membershipId: string,
): Promise<EffectivePermissionInputs> {
  const [groupRows, directRows] = await Promise.all([
    globalClient.execute({
      sql: `SELECT a.scope_type AS scopeType, a.scope_id AS scopeId, g.id AS groupId,
                   p.key AS key, gp.card_read_visibility AS cardReadVisibility
            FROM membership_group_assignments a
            JOIN permission_groups g ON g.id = a.group_id AND g.deleted_at IS NULL
            LEFT JOIN group_permissions gp ON gp.group_id = g.id
            LEFT JOIN permissions p ON p.id = gp.permission_id
            WHERE a.membership_id = ? AND a.revoked_at IS NULL`,
      args: [membershipId],
    }),
    globalClient.execute({
      sql: `SELECT a.scope_type AS scopeType, a.scope_id AS scopeId,
                   p.key AS permissionKey, a.card_read_visibility AS cardReadVisibility
            FROM membership_permission_assignments a
            JOIN permissions p ON p.id = a.permission_id
            WHERE a.membership_id = ? AND a.revoked_at IS NULL`,
      args: [membershipId],
    }),
  ]);

  // Agregasi baris JOIN per Group (satu query, tanpa N+1). Entry dengan key NULL
  // = Group tanpa permission sama sekali — tetap tidak memberi apa pun.
  const groups = new Map<string, { scopeType: string; scopeId: string; permissions: ScopedGroupAssignmentInput["permissions"] }>();
  for (const row of groupRows.rows as unknown as GroupRow[]) {
    let entry = groups.get(row.groupId);
    if (!entry) {
      entry = { scopeType: row.scopeType, scopeId: row.scopeId, permissions: [] };
      groups.set(row.groupId, entry);
    }
    if (row.key !== null) {
      (entry.permissions as GroupPermissionEntry[]).push({
        key: row.key,
        ...(row.cardReadVisibility !== null
          ? { cardReadVisibility: row.cardReadVisibility as CardReadVisibility }
          : {}),
      });
    }
  }

  const directAssignments = (directRows.rows as unknown as Array<{
    scopeType: string;
    scopeId: string;
    permissionKey: string;
    cardReadVisibility: string | null;
  }>).map((row) => ({
    permissionKey: row.permissionKey,
    scopeType: row.scopeType as ScopedDirectPermissionInput["scopeType"],
    scopeId: row.scopeId,
    ...(row.cardReadVisibility !== null
      ? { cardReadVisibility: row.cardReadVisibility as CardReadVisibility }
      : {}),
  }));

  return {
    groupAssignments: [...groups.values()].map((g) => ({
      scopeType: g.scopeType as ScopedGroupAssignmentInput["scopeType"],
      scopeId: g.scopeId,
      permissions: g.permissions,
    })),
    directAssignments,
  };
}
