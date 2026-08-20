import { Hono } from "hono";
import { handle } from "hono/vercel";
import { ok } from "@kanban/contracts";
import { createAuth, createGlobalClient, loadAppConfig, type SendMagicLinkData } from "@kanban/infrastructure";

export function createApiApp(opts: { sendMagicLink?: (data: SendMagicLinkData) => Promise<void> } = {}): {
  app: Hono;
  getAuth: () => ReturnType<typeof createAuth>;
  getConfig: () => ReturnType<typeof loadAppConfig>;
} {
  const app = new Hono().basePath("/api");

  let ready: { config: ReturnType<typeof loadAppConfig>; auth: ReturnType<typeof createAuth> } | null = null;
  const ensure = () => {
    if (!ready) {
      const config = loadAppConfig();
      ready = {
        config,
        auth: createAuth({
          globalClient: createGlobalClient(),
          baseUrl: config.BETTER_AUTH_URL,
          secret: config.BETTER_AUTH_SECRET,
          trustedOrigins: [config.BETTER_AUTH_URL],
          sendMagicLink: opts.sendMagicLink,
        }),
      };
    }
    return ready;
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

  return { app, getAuth: () => ensure().auth, getConfig: () => ensure().config };
}

export default handle(createApiApp().app);