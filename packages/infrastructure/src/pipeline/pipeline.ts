import type { Client } from "@libsql/client";
import type { ResolvedIdentity } from "../auth/resolve-identity.ts";
import type { ProjectRecord, ProjectMembershipRecord } from "../database/global-reads.ts";
import type { ProjectDatabaseResolver } from "../database/project-resolver.ts";
import type { IdentityResolver } from "../auth/resolve-identity.ts";
import { ResolveIdentityStep } from "./identity-step.ts";
import { LoadProjectStep } from "./project-step.ts";
import { ResolveDatabaseStep, type ProjectClientFactory } from "./database-step.ts";
import { RealPermissionResolver, type PermissionResolver } from "./permission-step.ts";
import type { EffectivePermissions } from "@kanban/domain";

export type ProjectRequestContext = {
  identity: ResolvedIdentity;
  project: ProjectRecord;
  membership: ProjectMembershipRecord;
  database: Client;
  permission: EffectivePermissions;
};

export class RequestPipeline {
  private readonly identityStep: ResolveIdentityStep;
  private readonly projectStep: LoadProjectStep;
  private readonly databaseStep: ResolveDatabaseStep;
  private readonly permissionResolver: PermissionResolver;

  constructor(input: {
    identityResolver: IdentityResolver;
    globalClient: Client;
    databaseResolver: ProjectDatabaseResolver;
    projectClientFactory: ProjectClientFactory;
    permissionResolver?: PermissionResolver;
  }) {
    this.identityStep = new ResolveIdentityStep(input.identityResolver);
    this.projectStep = new LoadProjectStep(input.globalClient);
    this.databaseStep = new ResolveDatabaseStep(input.databaseResolver, input.projectClientFactory);
    this.permissionResolver = input.permissionResolver ?? new RealPermissionResolver(input.globalClient);
  }

  async run(request: Request, projectId: string): Promise<ProjectRequestContext> {
    const identity = await this.identityStep.run(request);
    const { project, membership } = await this.projectStep.run({
      projectId,
      userId: identity.userId,
    });
    const database = await this.databaseStep.run(projectId);
    const { permission } = await this.permissionResolver.resolve({ identity, project, membership });
    return { identity, project, membership, database, permission };
  }
}