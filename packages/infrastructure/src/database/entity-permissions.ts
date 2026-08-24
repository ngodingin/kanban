import type { Client } from "@libsql/client";
import type { EffectivePermissions } from "@kanban/domain";
import { resolveEffectivePermissions } from "@kanban/domain";
import { loadEffectivePermissionInputs, type EffectivePermissionInputs } from "./permission-resolution.ts";
import { permissionCatalogKeys } from "./permission-catalog.ts";
export type RouteEntityType = "milestone" | "board" | "list" | "card";
export interface HierarchyPath {
    milestoneId?: string;
    boardId?: string;
    listId?: string;
    cardId?: string;
}
export async function loadEntityHierarchy(projectClient: Client, entityType: RouteEntityType, entityId: string): Promise<HierarchyPath | null> {
    let boardId: string | undefined;
    let listId: string | undefined;
    let cardId: string | undefined;
    if (entityType === "card") {
        const row = (await projectClient.execute({ sql: "SELECT list_id FROM cards WHERE id = ?", args: [entityId] })).rows[0];
        if (!row)
            return null;
        cardId = entityId;
        entityType = "list";
        entityId = String(row.list_id);
    }
    if (entityType === "list") {
        const row = (await projectClient.execute({ sql: "SELECT board_id FROM lists WHERE id = ?", args: [entityId] })).rows[0];
        if (!row)
            return null;
        listId = entityId;
        entityType = "board";
        entityId = String(row.board_id);
    }
    if (entityType === "board") {
        const row = (await projectClient.execute({ sql: "SELECT id, milestone_id FROM boards WHERE id = ?", args: [entityId] })).rows[0];
        if (!row)
            return null;
        boardId = String(row.id);
        return { milestoneId: String(row.milestone_id), boardId, listId, cardId };
    }
    const row = (await projectClient.execute({ sql: "SELECT id FROM milestones WHERE id = ?", args: [entityId] })).rows[0];
    if (!row)
        return null;
    return { milestoneId: String(row.id), boardId, listId, cardId };
}
export interface EntityPermissionResolver {
    (hierarchy: HierarchyPath): Promise<EffectivePermissions>;
}
export function createEntityPermissionResolver(input: {
    globalClient: Client;
    membershipId: string;
    projectId: string;
    isOwner: boolean;
    preloadedInputs?: EffectivePermissionInputs;
}): EntityPermissionResolver {
    return async (hierarchy) => {
        const assignments = input.preloadedInputs ?? (await loadEffectivePermissionInputs(input.globalClient, input.membershipId));
        return resolveEffectivePermissions({
            allPermissionKeys: permissionCatalogKeys(),
            groupAssignments: assignments.groupAssignments,
            directAssignments: assignments.directAssignments,
            hierarchy: { projectId: input.projectId, ...hierarchy },
            isOwner: input.isOwner,
        });
    };
}
