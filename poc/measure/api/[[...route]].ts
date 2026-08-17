import { Hono } from "hono";
import { handle } from "hono/vercel";
import { createClient } from "@libsql/client";

const dbUrl = process.env.TURSO_DB_URL;
const dbToken = process.env.TURSO_DB_TOKEN;
const client = dbUrl && dbToken ? createClient({ url: dbUrl, authToken: dbToken }) : null;

export const app = new Hono();

app.get("/api/measure", async (c) => {
  if (!client) {
    return c.json({ ok: false, error: "TURSO_DB_URL/TURSO_DB_TOKEN missing" }, 500);
  }
  try {
    const dbStarted = performance.now();
    const res = await client.execute("SELECT 1");
    const dbMs = performance.now() - dbStarted;
    return c.json({ ok: res.rows.length === 1, dbMs: Math.round(dbMs * 100) / 100 });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

export const GET = handle(app);
export const POST = handle(app);