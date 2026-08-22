import { Hono } from "hono";
import { handle } from "hono/vercel";
import { ok } from "@kanban/contracts";
import {
  BetterAuthIdentityResolver,
  createAuth,
  createDevProjectClientFromEnv,
  createGlobalClient,
  listProjectSummaries,
  loadAppConfig,
  newProjectId,
  provisionProjectWithMapping,
  RequestPipeline,
  SqliteProjectDatabaseResolver,
  type SendMagicLinkData,
} from "@kanban/infrastructure";
import { createProjectsRouter, type ProjectRoutesDeps } from "./routes/projects.ts";

function readTursoEnvFromProcess(): { org: string; group: string; apiToken: string } {
  return {
    org: process.env.TURSO_ORG ?? "",
    group: process.env.TURSO_GROUP ?? "",
    apiToken: process.env.TURSO_API_TOKEN ?? "",
  };
}

export function createApiApp(opts: { sendMagicLink?: (data: SendMagicLinkData) => Promise<void> } = {}): {
  app: Hono;
  getAuth: () => ReturnType<typeof createAuth>;
  getConfig: () => ReturnType<typeof loadAppConfig>;
} {
  const app = new Hono().basePath("/api");

  let ready:
    | {
        config: ReturnType<typeof loadAppConfig>;
        auth: ReturnType<typeof createAuth>;
        globalClient: ReturnType<typeof createGlobalClient>;
      }
    | null = null;
  const ensure = () => {
    if (!ready) {
      const config = loadAppConfig();
      const globalClient = createGlobalClient();
      ready = {
        config,
        globalClient,
        auth: createAuth({
          globalClient,
          baseUrl: config.BETTER_AUTH_URL,
          secret: config.BETTER_AUTH_SECRET,
          trustedOrigins: [config.BETTER_AUTH_URL],
          sendMagicLink: opts.sendMagicLink,
        }),
      };
    }
    return ready;
  };

  let projectDeps: ProjectRoutesDeps | null = null;
  const getProjectDeps = (): ProjectRoutesDeps => {
    let deps = projectDeps;
    if (!deps) {
      const r = ensure();
      const resolver = new BetterAuthIdentityResolver(r.auth);
      const globalClient = r.globalClient;
      const turso = readTursoEnvFromProcess();
      deps = {
        resolveIdentity: (request) => resolver.resolveIdentity(request),
        newProjectId,
        createProject: async (input) => {
          await provisionProjectWithMapping({
            turso,
            globalClient,
            projectId: input.projectId,
            projectName: input.projectName,
            ownerUserId: input.creatorUserId,
            creatorUserId: input.creatorUserId,
            now: new Date().toISOString(),
          });
        },
        listProjects: (userId) =>
          listProjectSummaries(globalClient, new SqliteProjectDatabaseResolver(globalClient), {
            create: () => createDevProjectClientFromEnv(),
          }, userId),
        openProjectContext: async (request, projectId) => {
          const pipeline = new RequestPipeline({
            identityResolver: resolver,
            globalClient,
            databaseResolver: new SqliteProjectDatabaseResolver(globalClient),
            projectClientFactory: { create: () => createDevProjectClientFromEnv() },
          });
          const resolved = await pipeline.run(request, projectId);
          return {
            userId: resolved.identity.userId,
            ownerUserId: resolved.project.ownerUserId,
            database: resolved.database,
          };
        },
      };
      projectDeps = deps;
    }
    return deps;
  };

  app.get("/v1/health", (c) => {
    let env = "unknown";
    try {
      env = ensure().config.env;
    } catch {
      // config tidak lengkap di environment ini; health tetap hidup
    }
    return c.json(ok({ status: "ok", env }));
  });
  app.on(["POST", "GET"], "/auth/*", async (c) => {
    try {
      return await ensure().auth.handler(c.req.raw);
    } catch (error) {
      return c.json(
        {
          error: {
            code: "INVALID_STATE",
            message: `auth tidak tersedia: ${String(error instanceof Error ? error.message : error)}`,
          },
        },
        500,
      );
    }
  });

  app.route("/", createProjectsRouter(getProjectDeps));

  return { app, getAuth: () => ensure().auth, getConfig: () => ensure().config };
}

// Vercel Node.js Runtime (Build Output API v3) memerlukan named export
// fetch-style (GET/POST/dst.) — export default (req,res)=>void diperlakukan
// sebagai signature Node.js lama sehingga Response dari hono/vercel tidak
// pernah terkirim (hang sampai timeout). Semua method di-dispatch ke app
// yang sama; Hono sendiri yang merutekan berdasarkan method request.
const { app: vercelApp } = createApiApp();
const vercelHandler = handle(vercelApp);
export const GET = vercelHandler;
export const POST = vercelHandler;