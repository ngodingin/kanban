import { serve } from "@hono/node-server";
import { createApiApp } from "./index.ts";

const port = Number(process.env.PORT ?? 3100);
const { app } = createApiApp();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[apps/api] listening on http://localhost:${info.port}`);
});
