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
export { DrizzleBoardRepository } from "./database/board-repository.ts";
export { DrizzleListRepository } from "./database/list-repository.ts";
export { DrizzleCardRepository, type DrizzleCardRepositoryDeps } from "./database/card-repository.ts";
export { DrizzleMilestoneLabelRepository } from "./database/milestone-label-repository.ts";
export { DrizzleBoardLabelRepository } from "./database/board-label-repository.ts";
export {
  cleanupAssigneesForRevokedMembership,
  unassignCardFromRevokedMember,
  type CleanupRevokedAssigneeResult,
} from "./database/card-assignee-cleanup.ts";
export {
  listActivities,
  type ActivityRecord,
  type ListActivitiesFilters,
} from "./database/activity-query.ts";
export {
  addComment,
  editComment,
  type CardCommentRecord,
  type EditCommentRecord,
} from "./database/card-comment.ts";
export {
  assignLabelToCard,
  listCardLabels,
  listCardLabelsForCards,
  removeLabelFromCard,
  type CardLabelAssociationRecord,
  type CardLabelSummary,
  type LabelScope,
} from "./database/card-label-association.ts";
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
  getMembershipInProject,
  listMembershipAssignments,
  assertPermissionKey,
  type MembershipAssignmentsList,
} from "./database/project-admin.ts";
export { loadEffectivePermissionInputs } from "./database/permission-resolution.ts";
export type { EffectivePermissionInputs } from "./database/permission-resolution.ts";
export {
  loadEntityHierarchy,
  createEntityPermissionResolver,
  type RouteEntityType,
  type HierarchyPath,
  type EntityPermissionResolver,
} from "./database/entity-permissions.ts";
export { hasPermission, resolveCardVisibilityFilter } from "@kanban/domain";
export type { CardReadVisibility } from "@kanban/domain";
export {
  createApiKey,
  revokeApiKey,
  listApiKeys,
  getApiKey,
  hashApiKeySecret,
  type ApiKeyCreateInput,
  type ApiKeyCreated,
  type ApiKeySummary,
} from "./database/api-key.ts";
export { ApiKeyIdentityResolver } from "./auth/api-key-identity-resolver.ts";
export { CompositeIdentityResolver } from "./auth/composite-identity-resolver.ts";
export { PipelineError } from "./pipeline/errors.ts";
export { ResolveIdentityStep } from "./pipeline/identity-step.ts";
export { RequestPipeline, type ProjectRequestContext } from "./pipeline/pipeline.ts";
export {
  RealPermissionResolver,
  EmptyPermissionResolver,
  type PermissionResolver,
  type PermissionResolution,
  type PermissionContext,
} from "./pipeline/permission-step.ts";
export type { ProjectClientFactory } from "./pipeline/database-step.ts";
export type {
  BoardLabelRecord,
  BoardRecord,
  CardRecord,
  ListRecord,
  MilestoneLabelRecord,
  MilestoneRecord,
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
