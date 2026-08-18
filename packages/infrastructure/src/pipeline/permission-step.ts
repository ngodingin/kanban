import type { ResolvedIdentity } from "../auth/resolve-identity.ts";
import type { ProjectRecord, ProjectMembershipRecord } from "../database/global-reads.ts";

export interface PermissionContext {
  identity: ResolvedIdentity;
  project: ProjectRecord;
  membership: ProjectMembershipRecord;
}

export interface PermissionResolution {
  permission: null;
}

export interface PermissionResolver {
  resolve(context: PermissionContext): Promise<PermissionResolution>;
}

export class EmptyPermissionResolver implements PermissionResolver {
  async resolve(): Promise<PermissionResolution> {
    return { permission: null };
  }
}