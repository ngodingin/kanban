import {
  createCachedProjectDbClientFactory,
  listProjectSummaries,
  newProjectId,
  provisionProjectWithMapping,
  RequestPipeline,
  SqliteProjectDatabaseResolver,
  type IdentityResolver,
  type TursoEnv,
} from "@kanban/infrastructure";
import type { Client } from "@libsql/client";
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
  return {
    resolveIdentity: (request) => identityResolver.resolveIdentity(request),
    newProjectId,
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
    listProjects: (userId) => listProjectSummaries(globalClient, databaseResolver, projectClientFactory, userId),
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
      };
    },
  };
}
