import { Hono } from "hono";
import { handle } from "hono/vercel";
import { createClient } from "@libsql/client";

type Bindings = {
  TURSO_DB_URL: string;
  TURSO_DB_TOKEN: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/measure", async (c) => {
  const client = createClient({
    url: c.env.TURSO_DB_URL,
    authToken: c.env.TURSO_DB_TOKEN,
  });
  const dbStarted = performance.now();
  const res = await client.execute("SELECT 1");
  const dbMs = performance.now() - dbStarted;
  return c.json({ ok: res.rows.length === 1, dbMs: Math.round(dbMs * 100) / 100 });
});

export const GET = handle(app);