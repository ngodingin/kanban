/**
 * Permission resolution engine — pure functions (TASK-4.1.1).
 *
 * SOT: 02-SPEC A.10 (BR-035–046), A.11 (BR-047–049), D.1–D.4.
 * Prinsip: union additive tanpa DENY (BR-038); Owner bypass GRANT saja
 * (BR-037) — lifecycle/invariant/concurrency tetap divalidasi TERPISAH
 * oleh domain command masing-masing, bukan di sini.
 */

export type PermissionScopeType = "project" | "milestone" | "board" | "list" | "card";

export type CardReadVisibility = "CREATED_BY_ME" | "ASSIGNED_TO_ME" | "ALL";

/** Satu permission di dalam Group — visibility MILIK PER-ENTRY dari group_permissions.card_read_visibility (BR-040, koreksi Review-CL-02). */
export interface GroupPermissionEntry {
  readonly key: string;
  readonly cardReadVisibility?: CardReadVisibility;
}

/** Assignment Group aktif milik SATU Membership — permission per Group sudah di-resolve pemanggil dari group_permissions (live, BR-040). */
export interface ScopedGroupAssignmentInput {
  readonly scopeType: PermissionScopeType;
  readonly scopeId: string;
  readonly permissions: readonly GroupPermissionEntry[];
}

/** Direct Permission assignment aktif (BR-042A). Hanya jalur inilah yang membawa cardReadVisibility (D.3). */
export interface ScopedDirectPermissionInput {
  readonly permissionKey: string;
  readonly scopeType: PermissionScopeType;
  readonly scopeId: string;
  readonly cardReadVisibility?: CardReadVisibility;
}

/** Hierarchy entity SAAT INI yang dioperasikan — chain root→leaf; level di bawah entity boleh null/undefined. */
export interface PermissionHierarchyInput {
  readonly projectId: string;
  readonly milestoneId?: string | null;
  readonly boardId?: string | null;
  readonly listId?: string | null;
  readonly cardId?: string | null;
}

export interface EffectivePermissions {
  readonly grantedKeys: ReadonlySet<string>;
  readonly cardReadVisibility: CardReadVisibility;
}

export interface ResolveEffectivePermissionsInput {
  /** Katalog seluruh permission key yang dikenal sistem (disuplai pemanggil dari infrastructure — boundary arsitektur). */
  readonly allPermissionKeys: readonly string[];
  readonly groupAssignments: readonly ScopedGroupAssignmentInput[];
  readonly directAssignments: readonly ScopedDirectPermissionInput[];
  readonly hierarchy: PermissionHierarchyInput;
  readonly isOwner: boolean;
}

const VISIBILITY_WIDTH: Record<CardReadVisibility, number> = {
  CREATED_BY_ME: 0,
  ASSIGNED_TO_ME: 1,
  ALL: 2,
};

function scopeMatchesHierarchy(scopeType: PermissionScopeType, scopeId: string, h: PermissionHierarchyInput): boolean {
  switch (scopeType) {
    case "project":
      return scopeId === h.projectId;
    case "milestone":
      return h.milestoneId != null && scopeId === h.milestoneId;
    case "board":
      return h.boardId != null && scopeId === h.boardId;
    case "list":
      return h.listId != null && scopeId === h.listId;
    case "card":
      return h.cardId != null && scopeId === h.cardId;
  }
}

export function resolveEffectivePermissions(input: ResolveEffectivePermissionsInput): EffectivePermissions {
  // (1) Owner: bypass pemeriksaan GRANT (BR-037) — seluruh katalog granted + visibility terluas.
  if (input.isOwner) {
    return { grantedKeys: new Set(input.allPermissionKeys), cardReadVisibility: "ALL" };
  }

  const grantedKeys = new Set<string>();
  let visibility: CardReadVisibility | null = null;

  const collect = (
    entries: readonly GroupPermissionEntry[],
    applicable: boolean,
  ): void => {
    if (!applicable) return;
    for (const entry of entries) {
      grantedKeys.add(entry.key);
      // BR-048/BR-049: visibility terluas menang dari KEDUA sumber (Group + direct), hanya untuk card.read.
      if (entry.key === "card.read" && entry.cardReadVisibility !== undefined) {
        if (visibility === null || VISIBILITY_WIDTH[entry.cardReadVisibility] > VISIBILITY_WIDTH[visibility]) {
          visibility = entry.cardReadVisibility;
        }
      }
    }
  };

  for (const assignment of input.groupAssignments) {
    const applicable = scopeMatchesHierarchy(assignment.scopeType, assignment.scopeId, input.hierarchy);
    collect(assignment.permissions, applicable);
  }

  for (const assignment of input.directAssignments) {
    const applicable = scopeMatchesHierarchy(assignment.scopeType, assignment.scopeId, input.hierarchy);
    collect([{ key: assignment.permissionKey, cardReadVisibility: assignment.cardReadVisibility }], applicable);
  }

  return {
    grantedKeys,
    // Default D.3/BR-048 saat tidak ada grant visibility applicable sama sekali.
    cardReadVisibility: visibility ?? "CREATED_BY_ME",
  };
}

/** Helper call site (TASK-4.4) — sembunyikan struktur internal EffectivePermissions. */
export function hasPermission(effective: EffectivePermissions, key: string): boolean {
  return effective.grantedKeys.has(key);
}

export interface CardVisibilityFields {
  readonly creatorUserId: string | null;
  readonly assigneeUserId: string | null;
}

/** Filter visibility Card murni untuk TASK-4.5 (D.3/BR-047): ALL > ASSIGNED_TO_ME (creator OR assignee) > CREATED_BY_ME. */
export function resolveCardVisibilityFilter(
  effective: EffectivePermissions,
  currentUserId: string,
): (card: CardVisibilityFields) => boolean {
  switch (effective.cardReadVisibility) {
    case "ALL":
      return () => true;
    case "ASSIGNED_TO_ME":
      return (card) => card.creatorUserId === currentUserId || card.assigneeUserId === currentUserId;
    case "CREATED_BY_ME":
      return (card) => card.creatorUserId === currentUserId;
  }
}
