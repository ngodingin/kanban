import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyGlobalMigrations } from "@kanban/infrastructure";
import { createApiApp } from "../src/index.ts";

// TASK-7.15.0 (dependency TASK-7.16.1) — regresi QA-CL-90 / QA-CL-89:
// GET /api/auth/get-session tanpa cookie harus mengembalikan HTTP 200 dengan
// body { session: null, user: null } (anonymous), BUKAN HTTP 500 INTERNAL_ERROR.
// Jalur ini dipakai SessionGate web untuk memutuskan redirect ke /login.

let dir: string;
let client: ReturnType<typeof createClient>;

function withEnv(env: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) saved[k] = process.env[k];
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  return fn().finally(() => {
    for (const k of Object.keys(env)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kanban-anon-session-"));
  const dbPath = join(dir, "global.db");
  client = createClient({ url: `file:${dbPath}` });
  await applyGlobalMigrations(client);
});

afterAll(async () => {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("TASK-7.15.0 — GET /api/auth/get-session anonymous (SOT 4.3.0, A.14)", () => {
  it("[SEC-SESSION] tanpa cookie mengembalikan HTTP 200 dengan session:null (bukan 500)", async () => {
    await withEnv(
      {
        BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long!!",
        BETTER_AUTH_URL: "http://localhost:3100",
        AUTH_RESEND_KEY: "re_test",
        MAIL_FROM: "noreply@kanban.ngodingin.xyz",
        AUTH_ALLOW_NON_CANONICAL: "1",
        GLOBAL_DB_URL: `file:${join(dir, "global.db")}`,
        GLOBAL_DB_TOKEN: "test-token",
        VERCEL_ENV: "",
        NODE_ENV: "development",
      },
      async () => {
        const { app } = createApiApp(() => Promise.resolve());
        const res = await app.request("http://localhost:3100/api/auth/get-session");
        expect(res.status).toBe(200);
        const json = (await res.json()) as { session?: unknown; user?: unknown };
        expect(json.session).toBeNull();
        expect(json.user).toBeNull();
      },
    );
  });
});
