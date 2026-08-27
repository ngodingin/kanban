import {
  acceptInvitation,
  assertProjectOwner,
  createCachedProjectDbClientFactory,
  createGroupAssignment,
  createInvitation,
  createPermissionAssignment,
  createPermissionGroup,
  DbIdempotencyStore,
  deletePermissionGroup,
  listPermissionGroups,
  listPermissions,
  listProjectInvitations,
  listProjectMembers,
  listProjectSummaries,
  listMembershipAssignments,
  assertPermissionKey,
  createEntityPermissionResolver,
  newProjectId,
  provisionProjectWithMapping,
  RequestPipeline,
  requireActiveMember,
  revokeGroupAssignment,
  assertAssigneeNotRevocationPending,
  revokeMembership,
  revokeInvitation,
  revokePermissionAssignment,
  SqliteProjectDatabaseResolver,
  updatePermissionGroup,
  type IdentityResolver,
  type TursoEnv,
} from "@kanban/infrastructure";
import type { Client } from "@libsql/client";
import type { ActivityRoutesDeps } from "./routes/activities.ts";
import type { BoardRoutesDeps } from "./routes/boards.ts";
import type { CardRoutesDeps } from "./routes/cards.ts";
import type { CardLabelRoutesDeps } from "./routes/card-labels.ts";
import type { CommentRoutesDeps } from "./routes/comments.ts";
import type { ListRoutesDeps } from "./routes/lists.ts";
import type { BoardLabelRoutesDeps, MilestoneLabelRoutesDeps } from "./routes/labels.ts";
import type { MilestoneRoutesDeps } from "./routes/milestones.ts";
import type { ProjectAdminRoutesDeps } from "./routes/project-admin.ts";
import type { ProjectRoutesDeps } from "./routes/projects.ts";

export interface BuildProjectRoutesDepsInput {
  identityResolver: IdentityResolver;
  globalClient: Client;
  turso: TursoEnv | null;
}

// Perakitan deps produksi dipisah dari index.ts agar jalur ini sendiri
// dapat dilewati test routing (invariant #4 / BR-007 / A.4) tanpa Vercel,
// Better Auth, maupun jaringan — lihat apps/api/test/project-routing.test.ts.

export function buildProjectRoutesDeps(input: BuildProjectRoutesDepsInput): ProjectRoutesDeps {
  const { identityResolver, globalClient, turso } = input;
  const databaseResolver = new SqliteProjectDatabaseResolver(globalClient);
  const projectClientFactory = createCachedProjectDbClientFactory({ turso });
  const idempotencyStore = new DbIdempotencyStore(globalClient);
  return {
    resolveIdentity: (request) => identityResolver.resolveIdentity(request),
    newProjectId,
    idempotencyStore,
    createProject: async (projInput) => {
      // Provisioning membuat database Turso nyata per Project — tanpa
      // kredensial tidak ada jalur create yang valid (test memakai DI sendiri).
      if (!turso) {
        throw new Error(
          "Provisioning Project baru membutuhkan TURSO_API_TOKEN/TURSO_GROUP (database Turso nyata dibuat per Project).",
        );
      }
      await provisionProjectWithMapping({
        turso,
        globalClient,
        projectId: projInput.projectId,
        projectName: projInput.projectName,
        ownerUserId: projInput.creatorUserId,
        creatorUserId: projInput.creatorUserId,
        now: new Date().toISOString(),
      });
    },
    listProjects: (userId, statusFilter) =>
      listProjectSummaries(globalClient, databaseResolver, projectClientFactory, userId, statusFilter),
    openProjectContext: async (request, projectId) => {
      const pipeline = new RequestPipeline({
        identityResolver,
        globalClient,
        databaseResolver,
        projectClientFactory,
      });
      const resolved = await pipeline.run(request, projectId);
      return {
        userId: resolved.identity.userId,
        ownerUserId: resolved.project.ownerUserId,
        database: resolved.database,
        permission: resolved.permission,
        effectiveFor: createEntityPermissionResolver({
          globalClient,
          membershipId: resolved.membership.id,
          projectId,
          isOwner: resolved.project.ownerUserId === resolved.identity.userId,
          preloadedInputs: resolved.permissionInputs,
        }),
      };
    },
  };
}

export interface BuildMilestoneRoutesDepsInput {
  identityResolver: IdentityResolver;
  globalClient: Client;
  turso: TursoEnv | null;
}


export function buildMilestoneRoutesDeps(input: BuildMilestoneRoutesDepsInput): MilestoneRoutesDeps {
  const { identityResolver, globalClient, turso } = input;
  return {
    ...buildProjectContextDeps(identityResolver, globalClient, turso),
    idempotencyStore: new DbIdempotencyStore(globalClient),
    newMilestoneId: newProjectId,
  };
}

export interface BuildBoardRoutesDepsInput {
  identityResolver: IdentityResolver;
  globalClient: Client;
  turso: TursoEnv | null;
}


export function buildBoardRoutesDeps(input: BuildBoardRoutesDepsInput): BoardRoutesDeps {
  const { identityResolver, globalClient, turso } = input;
  return {
    ...buildProjectContextDeps(identityResolver, globalClient, turso),
    idempotencyStore: new DbIdempotencyStore(globalClient),
    newBoardId: newProjectId,
  };
}

export interface BuildListRoutesDepsInput {
  identityResolver: IdentityResolver;
  globalClient: Client;
  turso: TursoEnv | null;
}


export function buildListRoutesDeps(input: BuildListRoutesDepsInput): ListRoutesDeps {
  const { identityResolver, globalClient, turso } = input;
  return {
    ...buildProjectContextDeps(identityResolver, globalClient, turso),
    idempotencyStore: new DbIdempotencyStore(globalClient),
    newListId: newProjectId,
  };
}

export interface BuildCardRoutesDepsInput {
  identityResolver: IdentityResolver;
  globalClient: Client;
  turso: TursoEnv | null;
}


export function buildCardRoutesDeps(input: BuildCardRoutesDepsInput): CardRoutesDeps {
  const { identityResolver, globalClient, turso } = input;
  return {
    ...buildProjectContextDeps(identityResolver, globalClient, turso),
    idempotencyStore: new DbIdempotencyStore(globalClient),
    newCardId: newProjectId,
    assertAssigneeActiveMember: (projectId, userId) =>
      assertAssigneeNotRevocationPending(globalClient, projectId, userId),
  };
}

export interface BuildActivityRoutesDepsInput {
  identityResolver: IdentityResolver;
  globalClient: Client;
  turso: TursoEnv | null;
}


export function buildActivityRoutesDeps(input: BuildActivityRoutesDepsInput): ActivityRoutesDeps {
  const { identityResolver, globalClient, turso } = input;
  return {
    ...buildProjectContextDeps(identityResolver, globalClient, turso),
  }
}

export interface BuildCommentRoutesDepsInput {
  identityResolver: IdentityResolver;
  globalClient: Client;
  turso: TursoEnv | null;
}


export function buildCommentRoutesDeps(input: BuildCommentRoutesDepsInput): CommentRoutesDeps {
  const { identityResolver, globalClient, turso } = input;
  return {
    ...buildProjectContextDeps(identityResolver, globalClient, turso),
    idempotencyStore: new DbIdempotencyStore(globalClient),
  };
}

export interface BuildCardLabelRoutesDepsInput {
  identityResolver: IdentityResolver;
  globalClient: Client;
  turso: TursoEnv | null;
}


export function buildCardLabelRoutesDeps(input: BuildCardLabelRoutesDepsInput): CardLabelRoutesDeps {
  const { identityResolver, globalClient, turso } = input;
  return {
    ...buildProjectContextDeps(identityResolver, globalClient, turso),
    idempotencyStore: new DbIdempotencyStore(globalClient),
  };
}

export interface BuildMilestoneLabelRoutesDepsInput {
  identityResolver: IdentityResolver;
  globalClient: Client;
  turso: TursoEnv | null;
}


export function buildMilestoneLabelRoutesDeps(input: BuildMilestoneLabelRoutesDepsInput): MilestoneLabelRoutesDeps {
  const { identityResolver, globalClient, turso } = input;
  return {
    ...buildProjectContextDeps(identityResolver, globalClient, turso),
    idempotencyStore: new DbIdempotencyStore(globalClient),
    newMilestoneLabelId: newProjectId,
  };
}

export interface BuildBoardLabelRoutesDepsInput {
  identityResolver: IdentityResolver;
  globalClient: Client;
  turso: TursoEnv | null;
}


export function buildBoardLabelRoutesDeps(input: BuildBoardLabelRoutesDepsInput): BoardLabelRoutesDeps {
  const { identityResolver, globalClient, turso } = input;
  return {
    ...buildProjectContextDeps(identityResolver, globalClient, turso),
    newBoardLabelId: newProjectId,
  };
}

function buildProjectContextDeps(
  identityResolver: IdentityResolver,
  globalClient: Client,
  turso: TursoEnv | null,
): {
  resolveIdentity: ProjectRoutesDeps["resolveIdentity"];
  openProjectContext: ProjectRoutesDeps["openProjectContext"];
  idempotencyStore: DbIdempotencyStore;
} {
  const databaseResolver = new SqliteProjectDatabaseResolver(globalClient);
  const projectClientFactory = createCachedProjectDbClientFactory({ turso });
  const idempotencyStore = new DbIdempotencyStore(globalClient);
  return {
    resolveIdentity: (request) => identityResolver.resolveIdentity(request),
    idempotencyStore,
    openProjectContext: async (request, projectId) => {
      const pipeline = new RequestPipeline({
        identityResolver,
        globalClient,
        databaseResolver,
        projectClientFactory,
      });
      const resolved = await pipeline.run(request, projectId);
      return {
        userId: resolved.identity.userId,
        ownerUserId: resolved.project.ownerUserId,
        database: resolved.database,
        permission: resolved.permission,
        effectiveFor: createEntityPermissionResolver({
          globalClient,
          membershipId: resolved.membership.id,
          projectId,
          isOwner: resolved.project.ownerUserId === resolved.identity.userId,
          preloadedInputs: resolved.permissionInputs,
        }),
      };
    },
  };
}

// Deps untuk router admin Global-DB (permission groups, assignments,
// invitations, members) — pola sama dengan buildProjectRoutesDeps agar
// wiring produksi selalu dapat dilewati test (pelajaran QA-CL-04).

export function buildProjectAdminDeps(input: {
  identityResolver: IdentityResolver;
  globalClient: Client;
  turso: TursoEnv | null;
}): ProjectAdminRoutesDeps {
  const { identityResolver, globalClient, turso } = input;
  const databaseResolver = new SqliteProjectDatabaseResolver(globalClient);
  const projectClientFactory = createCachedProjectDbClientFactory({ turso });
  const idempotencyStore = new DbIdempotencyStore(globalClient);
  const resolveProjectDbClient = async (projectId: string): Promise<Client | null> => {
    const mapping = await databaseResolver.resolve(projectId);
    if (!mapping) return null;
    return projectClientFactory.create(mapping.databaseId);
  };
  return {
    resolveIdentity: (request) => identityResolver.resolveIdentity(request),
    requireActiveMember: (projectId, requesterUserId) => requireActiveMember(globalClient, projectId, requesterUserId),
    listPermissionGroups: async (projectId, requesterUserId, opts) => {
      await requireActiveMember(globalClient, projectId, requesterUserId);
      return listPermissionGroups(globalClient, projectId, opts);
    },
    listPermissions: () => listPermissions(globalClient),
    assertProjectOwner: (projectId, requesterUserId) => assertProjectOwner(globalClient, projectId, requesterUserId),
    createPermissionGroup: async (projectId, payload) =>
      createPermissionGroup(globalClient, {
        projectId,
        name: payload.name,
        description: payload.description,
        permissions: payload.permissions,
      }),
    updatePermissionGroup: async (projectId, groupId, payload) =>
      updatePermissionGroup(globalClient, {
        projectId,
        groupId,
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.description !== undefined ? { description: payload.description } : {}),
        ...(payload.permissions !== undefined ? { permissions: payload.permissions } : {}),
      }),
    deletePermissionGroup: (projectId, groupId) => deletePermissionGroup(globalClient, projectId, groupId),
    createGroupAssignment: async (projectId, membershipId, input) => {
      const projectDb = await resolveProjectDbClient(projectId);
      return createGroupAssignment(globalClient, {
        projectId,
        membershipId,
        groupId: input.groupId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
      }, projectDb);
    },
    revokeGroupAssignment: (projectId, membershipId, assignmentId) =>
      revokeGroupAssignment(globalClient, { projectId, membershipId, assignmentId }),
    createPermissionAssignment: async (projectId, membershipId, input) => {
      const projectDb = await resolveProjectDbClient(projectId);
      return createPermissionAssignment(globalClient, {
        projectId,
        membershipId,
        permissionId: input.permissionId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        ...(input.cardReadVisibility !== undefined ? { cardReadVisibility: input.cardReadVisibility } : {}),
      }, projectDb);
    },
    revokePermissionAssignment: (projectId, membershipId, assignmentId) =>
      revokePermissionAssignment(globalClient, { projectId, membershipId, assignmentId }),
    createInvitation: async (projectId, invitedByUserId, input) => {
      const projectDb = await resolveProjectDbClient(projectId);
      return createInvitation(globalClient, {
        projectId,
        invitedByUserId,
        email: input.email,
        assignments: input.assignments,
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      }, projectDb);
    },
    acceptInvitation: (invitationId, userId, userEmail) => acceptInvitation(globalClient, { invitationId, userId, userEmail }),
    listMembers: async (projectId, requesterUserId, opts) => {
      await requireActiveMember(globalClient, projectId, requesterUserId);
      return listProjectMembers(globalClient, projectId, opts);
    },
    assertPermissionKey: (projectId, requesterUserId, key) =>
      assertPermissionKey(globalClient, projectId, requesterUserId, key),
    listMembershipAssignments: (projectId, membershipId) =>
      listMembershipAssignments(globalClient, projectId, membershipId),
    idempotencyStore,
    revokeMembership: async (projectId, membershipId, actorUserId) => {
      const projectDb = await resolveProjectDbClient(projectId);
      return revokeMembership(globalClient, { projectId, membershipId, actorUserId }, projectDb);
    },
    listProjectInvitations: (projectId) => listProjectInvitations(globalClient, projectId),
    revokeInvitation: (projectId, invitationId) => revokeInvitation(globalClient, { projectId, invitationId }),
  };
}
