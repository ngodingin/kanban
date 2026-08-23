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

/**
 * Walk parent chain entity yang dialamati route (card→list→board→milestone).
 * Return null bila entity tidak ada — caller fallback ke Project-scope agar
 * urutan 403 (authz) sebelum 404 (not found) terjaga seperti pola interim.
 * Maksimal 3 query berantai, tanpa N+1.
 */
export async function loadEntityHierarchy(
  projectClient: Client,
  entityType: RouteEntityType,
  entityId: string,
): Promise<HierarchyPath | null> {
  let boardId: string | undefined;
  let listId: string | undefined;
  let cardId: string | undefined;

  if (entityType === "card") {
    const row = (
      await projectClient.execute({ sql: "SELECT list_id FROM cards WHERE id = ?", args: [entityId] })
    ).rows[0];
    if (!row) return null;
    cardId = entityId;
    entityType = "list";
    entityId = String(row.list_id);
  }
  if (entityType === "list") {
    const row = (
      await projectClient.execute({ sql: "SELECT board_id FROM lists WHERE id = ?", args: [entityId] })
    ).rows[0];
    if (!row) return null;
    listId = entityId;
    entityType = "board";
    entityId = String(row.board_id);
  }
  if (entityType === "board") {
    const row = (
      await projectClient.execute({ sql: "SELECT id, milestone_id FROM boards WHERE id = ?", args: [entityId] })
    ).rows[0];
    if (!row) return null;
    boardId = String(row.id);
    return { milestoneId: String(row.milestone_id), boardId, listId, cardId };
  }
  const row = (
    await projectClient.execute({ sql: "SELECT id FROM milestones WHERE id = ?", args: [entityId] })
  ).rows[0];
  if (!row) return null;
  return { milestoneId: String(row.id), boardId, listId, cardId };
}

/**
 * Resolver per-entity untuk route handler (keputusan teknis TASK-4.3.1):
 * pipeline hanya resolve scope Project; granularitas Milestone/Board/List/Card
 * di-resolve ulang DI SINI dengan hierarchy entity saat operasi dilakukan.
 */
export interface EntityPermissionResolver {
  (hierarchy: HierarchyPath): Promise<EffectivePermissions>;
}

export function createEntityPermissionResolver(input: {
  globalClient: Client;
  membershipId: string;
  projectId: string;
  isOwner: boolean;
  /**
   * Assignment yang SUDAH di-fetch (mis. dari RequestPipeline's resolusi
   * scope-Project) — kalau diberikan, dipakai ulang alih-alih fetch lagi
   * dari Global DB (Review-CL-05: hindari 2x round-trip identik per
   * request). Opsional — caller yang tidak punya hasil siap pakai (mis.
   * test) tetap bisa mengandalkan fetch lazy seperti sebelumnya.
   */
  preloadedInputs?: EffectivePermissionInputs;
}): EntityPermissionResolver {
  return async (hierarchy) => {
    const assignments =
      input.preloadedInputs ?? (await loadEffectivePermissionInputs(input.globalClient, input.membershipId));
    return resolveEffectivePermissions({
      allPermissionKeys: permissionCatalogKeys(),
      groupAssignments: assignments.groupAssignments,
      directAssignments: assignments.directAssignments,
      hierarchy: { projectId: input.projectId, ...hierarchy },
      isOwner: input.isOwner,
    });
  };
}
