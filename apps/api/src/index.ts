import { Hono } from "hono";
import { handle } from "hono/vercel";
import { ok } from "@kanban/contracts";
import {
  BetterAuthIdentityResolver,
  createAuth,
  createGlobalClient,
  loadAppConfig,
  readTursoEnvFromProcess,
  type SendMagicLinkData,
} from "@kanban/infrastructure";
import { buildActivityRoutesDeps, buildBoardLabelRoutesDeps, buildBoardRoutesDeps, buildCardRoutesDeps, buildCommentRoutesDeps, buildListRoutesDeps, buildMilestoneLabelRoutesDeps, buildMilestoneRoutesDeps, buildProjectAdminDeps, buildProjectRoutesDeps } from "./project-deps.ts";
import { createActivitiesRouter, type ActivityRoutesDeps } from "./routes/activities.ts";
import { createBoardsRouter, type BoardRoutesDeps } from "./routes/boards.ts";
import { createCardsRouter, type CardRoutesDeps } from "./routes/cards.ts";
import { createCommentsRouter, type CommentRoutesDeps } from "./routes/comments.ts";
import { createListsRouter, type ListRoutesDeps } from "./routes/lists.ts";
import { createBoardLabelsRouter, createMilestoneLabelsRouter, type BoardLabelRoutesDeps, type MilestoneLabelRoutesDeps } from "./routes/labels.ts";
import { createMilestonesRouter, type MilestoneRoutesDeps } from "./routes/milestones.ts";
import { createProjectsRouter, type ProjectRoutesDeps } from "./routes/projects.ts";
import { createProjectAdminRouter, type ProjectAdminRoutesDeps } from "./routes/project-admin.ts";

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
      deps = buildProjectRoutesDeps({
        identityResolver: new BetterAuthIdentityResolver(r.auth),
        globalClient: r.globalClient,
        turso: readTursoEnvFromProcess(),
      });
      projectDeps = deps;
    }
    return deps;
  };

  let adminDeps: ProjectAdminRoutesDeps | null = null;
  const getProjectAdminDeps = (): ProjectAdminRoutesDeps => {
    let deps = adminDeps;
    if (!deps) {
      const r = ensure();
      deps = buildProjectAdminDeps({
        identityResolver: new BetterAuthIdentityResolver(r.auth),
        globalClient: r.globalClient,
        turso: readTursoEnvFromProcess(),
      });
      adminDeps = deps;
    }
    return deps;
  };

  let milestoneDeps: MilestoneRoutesDeps | null = null;
  const getMilestoneDeps = (): MilestoneRoutesDeps => {
    let deps = milestoneDeps;
    if (!deps) {
      const r = ensure();
      deps = buildMilestoneRoutesDeps({
        identityResolver: new BetterAuthIdentityResolver(r.auth),
        globalClient: r.globalClient,
        turso: readTursoEnvFromProcess(),
      });
      milestoneDeps = deps;
    }
    return deps;
  };

  let boardDeps: BoardRoutesDeps | null = null;
  const getBoardDeps = (): BoardRoutesDeps => {
    let deps = boardDeps;
    if (!deps) {
      const r = ensure();
      deps = buildBoardRoutesDeps({
        identityResolver: new BetterAuthIdentityResolver(r.auth),
        globalClient: r.globalClient,
        turso: readTursoEnvFromProcess(),
      });
      boardDeps = deps;
    }
    return deps;
  };

  let listDeps: ListRoutesDeps | null = null;
  const getListDeps = (): ListRoutesDeps => {
    let deps = listDeps;
    if (!deps) {
      const r = ensure();
      deps = buildListRoutesDeps({
        identityResolver: new BetterAuthIdentityResolver(r.auth),
        globalClient: r.globalClient,
        turso: readTursoEnvFromProcess(),
      });
      listDeps = deps;
    }
    return deps;
  };

  let cardDeps: CardRoutesDeps | null = null;
  const getCardDeps = (): CardRoutesDeps => {
    let deps = cardDeps;
    if (!deps) {
      const r = ensure();
      deps = buildCardRoutesDeps({
        identityResolver: new BetterAuthIdentityResolver(r.auth),
        globalClient: r.globalClient,
        turso: readTursoEnvFromProcess(),
      });
      cardDeps = deps;
    }
    return deps;
  };

  let milestoneLabelDeps: MilestoneLabelRoutesDeps | null = null;
  const getMilestoneLabelDeps = (): MilestoneLabelRoutesDeps => {
    let deps = milestoneLabelDeps;
    if (!deps) {
      const r = ensure();
      deps = buildMilestoneLabelRoutesDeps({
        identityResolver: new BetterAuthIdentityResolver(r.auth),
        globalClient: r.globalClient,
        turso: readTursoEnvFromProcess(),
      });
      milestoneLabelDeps = deps;
    }
    return deps;
  };

  let boardLabelDeps: BoardLabelRoutesDeps | null = null;
  const getBoardLabelDeps = (): BoardLabelRoutesDeps => {
    let deps = boardLabelDeps;
    if (!deps) {
      const r = ensure();
      deps = buildBoardLabelRoutesDeps({
        identityResolver: new BetterAuthIdentityResolver(r.auth),
        globalClient: r.globalClient,
        turso: readTursoEnvFromProcess(),
      });
      boardLabelDeps = deps;
    }
    return deps;
  };

  let activityDeps: ActivityRoutesDeps | null = null;
  const getActivityDeps = (): ActivityRoutesDeps => {
    let deps = activityDeps;
    if (!deps) {
      const r = ensure();
      deps = buildActivityRoutesDeps({
        identityResolver: new BetterAuthIdentityResolver(r.auth),
        globalClient: r.globalClient,
        turso: readTursoEnvFromProcess(),
      });
      activityDeps = deps;
    }
    return deps;
  };

  let commentDeps: CommentRoutesDeps | null = null;
  const getCommentDeps = (): CommentRoutesDeps => {
    let deps = commentDeps;
    if (!deps) {
      const r = ensure();
      deps = buildCommentRoutesDeps({
        identityResolver: new BetterAuthIdentityResolver(r.auth),
        globalClient: r.globalClient,
        turso: readTursoEnvFromProcess(),
      });
      commentDeps = deps;
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
  app.route("/", createMilestonesRouter(getMilestoneDeps));
  app.route("/", createBoardsRouter(getBoardDeps));
  app.route("/", createListsRouter(getListDeps));
  app.route("/", createCardsRouter(getCardDeps));
  app.route("/", createMilestoneLabelsRouter(getMilestoneLabelDeps));
  app.route("/", createBoardLabelsRouter(getBoardLabelDeps));
  app.route("/", createActivitiesRouter(getActivityDeps));
  app.route("/", createCommentsRouter(getCommentDeps));
  app.route("/", createProjectAdminRouter(getProjectAdminDeps));

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
// PATCH dipakai endpoint admin (mis. PATCH /permission-groups/:group_id, C.12).
export const PATCH = vercelHandler;