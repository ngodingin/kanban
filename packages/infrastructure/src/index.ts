export { createAuth, type Auth, type AuthConfigInput, type SendMagicLinkData } from "./auth/auth.ts";
export {
  BetterAuthIdentityResolver,
  type IdentityResolver,
  type ResolvedIdentity,
  type SessionIdentity,
} from "./auth/resolve-identity.ts";
export { loadAppConfig, type AppConfig, type AppEnv } from "./config/env.ts";
export { createGlobalClient, createProjectClient } from "./database/factory.ts";
export {
  createCachedProjectDbClientFactory,
  readTursoEnvFromProcess,
  resolveProjectDbClient,
  type ProjectClientFactoryDeps,
} from "./database/project-client.ts";
export { applyGlobalMigrations, applyProjectMigrations } from "./database/migrate.ts";
export { DrizzleProjectRepository } from "./database/project-repository.ts";
export { DrizzleMilestoneRepository } from "./database/milestone-repository.ts";
export {
  deriveProjectStatus,
  listProjectSummaries,
  type ProjectStatus,
  type ProjectSummary,
} from "./database/project-list.ts";
export {
  SqliteProjectDatabaseResolver,
  type ProjectDatabaseResolver,
} from "./database/project-resolver.ts";
export {
  acceptInvitation,
  assertProjectOwner,
  createGroupAssignment,
  createInvitation,
  createPermissionAssignment,
  createPermissionGroup,
  deletePermissionGroup,
  getProjectOwnerId,
  hasActiveMembership,
  listPermissionGroups,
  listProjectMembers,
  requireActiveMember,
  revokeGroupAssignment,
  revokeMembership,
  listProjectInvitations,
  revokeInvitation,
  revokePermissionAssignment,
  updatePermissionGroup,
  type AcceptInvitationResult,
  type CreatePermissionGroupInput,
  type GroupAssignmentSummary,
  type InvitationSummary,
  type InvitationListSummary,
  type PermissionAssignmentSummary,
  type PermissionGroupSummary,
  type ProjectMemberSummary,
  type UpdatePermissionGroupInput,
} from "./database/project-admin.ts";
export { PipelineError } from "./pipeline/errors.ts";
export { ResolveIdentityStep } from "./pipeline/identity-step.ts";
export { RequestPipeline, type ProjectRequestContext } from "./pipeline/pipeline.ts";
export type { ProjectClientFactory } from "./pipeline/database-step.ts";
export type {
  ProjectRepository,
  ProjectStateRecord,
} from "@kanban/domain";
export {
  newProjectId,
  provisionProjectWithMapping,
  registerProjectWithOwnerMembership,
  ProjectProvisioningError,
  type ProvisionResult,
  type ProvisionWithMappingInput,
} from "./provisioning/provision.ts";
export type { TursoEnv } from "./provisioning/turso.ts";
export type { Client } from "@libsql/client";
