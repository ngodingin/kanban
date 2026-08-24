export type PermissionScopeType = "project" | "milestone" | "board" | "list" | "card";
export type CardReadVisibility = "CREATED_BY_ME" | "ASSIGNED_TO_ME" | "ALL";
export interface GroupPermissionEntry {
    readonly key: string;
    readonly cardReadVisibility?: CardReadVisibility;
}
export interface ScopedGroupAssignmentInput {
    readonly scopeType: PermissionScopeType;
    readonly scopeId: string;
    readonly permissions: readonly GroupPermissionEntry[];
}
export interface ScopedDirectPermissionInput {
    readonly permissionKey: string;
    readonly scopeType: PermissionScopeType;
    readonly scopeId: string;
    readonly cardReadVisibility?: CardReadVisibility;
}
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
    if (input.isOwner) {
        return { grantedKeys: new Set(input.allPermissionKeys), cardReadVisibility: "ALL" };
    }
    const grantedKeys = new Set<string>();
    let visibility: CardReadVisibility | null = null;
    const collect = (entries: readonly GroupPermissionEntry[], applicable: boolean): void => {
        if (!applicable)
            return;
        for (const entry of entries) {
            grantedKeys.add(entry.key);
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
        cardReadVisibility: visibility ?? "CREATED_BY_ME",
    };
}
export function hasPermission(effective: EffectivePermissions, key: string): boolean {
    return effective.grantedKeys.has(key);
}
export interface CardVisibilityFields {
    readonly creatorUserId: string | null;
    readonly assigneeUserId: string | null;
}
export function resolveCardVisibilityFilter(effective: EffectivePermissions, currentUserId: string): (card: CardVisibilityFields) => boolean {
    switch (effective.cardReadVisibility) {
        case "ALL":
            return () => true;
        case "ASSIGNED_TO_ME":
            return (card) => card.creatorUserId === currentUserId || card.assigneeUserId === currentUserId;
        case "CREATED_BY_ME":
            return (card) => card.creatorUserId === currentUserId;
    }
}
