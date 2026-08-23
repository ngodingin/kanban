import type { ResolvedIdentity } from "../auth/resolve-identity.ts";
import type { ProjectRecord, ProjectMembershipRecord } from "../database/global-reads.ts";
import type { Client } from "@libsql/client";
import {
  resolveEffectivePermissions,
  type EffectivePermissions,
} from "@kanban/domain";
import { loadEffectivePermissionInputs, type EffectivePermissionInputs } from "../database/permission-resolution.ts";
import { permissionCatalogKeys } from "../database/permission-catalog.ts";

export interface PermissionContext {
  identity: ResolvedIdentity;
  project: ProjectRecord;
  membership: ProjectMembershipRecord;
}

export interface PermissionResolution {
  permission: EffectivePermissions;
  /**
   * Assignment mentah yang sudah di-fetch untuk resolusi scope-Project di
   * atas — dioper lagi ke createEntityPermissionResolver (route re-resolve
   * per-entity, TASK-4.3.1) supaya TIDAK fetch ulang dari Global DB untuk
   * request yang sama (Review-CL-05: redundant round-trip di 23 call site).
   */
  inputs: EffectivePermissionInputs;
}

export interface PermissionResolver {
  resolve(context: PermissionContext): Promise<PermissionResolution>;
}

/** Null-object untuk test yang tidak butuh permission nyata — granted kosong, visibility default (D.3). */
export class EmptyPermissionResolver implements PermissionResolver {
  async resolve(): Promise<PermissionResolution> {
    return {
      permission: { grantedKeys: new Set<string>(), cardReadVisibility: "CREATED_BY_ME" },
      inputs: { groupAssignments: [], directAssignments: [] },
    };
  }
}

/**
 * Resolver produksi (TASK-4.3.1): rantai Credential → User → Membership →
 * Permission (C.1 03-ENG). Di titik pipeline HANYA hierarchy Project yang
 * diketahui — resolusi granular per-entity dilakukan route handler dengan
 * resolveEffectivePermissions lagi (keputusan teknis C.6.5 poin 3).
 */
export class RealPermissionResolver implements PermissionResolver {
  private readonly globalClient: Client;

  constructor(globalClient: Client) {
    this.globalClient = globalClient;
  }

  async resolve(context: PermissionContext): Promise<PermissionResolution> {
    const isOwner = context.project.ownerUserId === context.identity.userId;
    const inputs = await loadEffectivePermissionInputs(this.globalClient, context.membership.id);
    return {
      permission: resolveEffectivePermissions({
        allPermissionKeys: permissionCatalogKeys(),
        groupAssignments: inputs.groupAssignments,
        directAssignments: inputs.directAssignments,
        hierarchy: { projectId: context.project.id },
        isOwner,
      }),
      inputs,
    };
  }
}
