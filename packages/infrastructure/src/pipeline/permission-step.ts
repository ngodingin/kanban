import type { ResolvedIdentity } from "../auth/resolve-identity.ts";
import type { ProjectRecord, ProjectMembershipRecord } from "../database/global-reads.ts";
import type { Client } from "@libsql/client";
import { resolveEffectivePermissions, type EffectivePermissions, } from "@kanban/domain";
import { loadEffectivePermissionInputs, type EffectivePermissionInputs } from "../database/permission-resolution.ts";
import { permissionCatalogKeys } from "../database/permission-catalog.ts";
export interface PermissionContext {
    identity: ResolvedIdentity;
    project: ProjectRecord;
    membership: ProjectMembershipRecord;
}
export interface PermissionResolution {
    permission: EffectivePermissions;
    inputs: EffectivePermissionInputs;
}
export interface PermissionResolver {
    resolve(context: PermissionContext): Promise<PermissionResolution>;
}
export class EmptyPermissionResolver implements PermissionResolver {
    async resolve(): Promise<PermissionResolution> {
        return {
            permission: { grantedKeys: new Set<string>(), cardReadVisibility: "CREATED_BY_ME" },
            inputs: { groupAssignments: [], directAssignments: [] },
        };
    }
}
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
