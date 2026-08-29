import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { applyGlobalMigrations } from "../src/database/migrate.ts";
import { createAuth } from "../src/auth/auth.ts";

// CL-103 — Magic link verify URL must include /api/auth prefix. Previously,
// Better Auth baseURL was set to the origin only (e.g. "https://example.com"),
// causing the magic link email to contain URL "/magic-link/verify" instead of
// "/api/auth/magic-link/verify". Since Hono mounts auth routes at /api/auth/*,
// the email link hit the SPA fallback and never reached Better Auth, resulting
// in no session cookie being set on callback.

const BASE_URL = "http://localhost:8787";

let dir: string;
let globalClient: Client;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kanban-magic-link-url-"));
  globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
});

afterAll(async () => {
  await globalClient.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("magic link verify URL construction (CL-103) — email link must route through /api/auth/*", () => {
  it("verify URL in email must contain /api/auth/magic-link/verify path prefix", async () => {
    let capturedUrl = "";
    const auth = createAuth({
      globalClient,
      baseUrl: BASE_URL,
      secret: "x".repeat(32),
      sendMagicLink: async (data) => {
        capturedUrl = data.url;
      },
    });

    const res = await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "url-test@example.com" }),
      }),
    );
    expect(res.status).toBe(200);
    const parsed = new URL(capturedUrl);
    expect(parsed.pathname).toBe("/api/auth/magic-link/verify");
  });

  it("verify URL must be on the same origin as the base URL", async () => {
    let capturedUrl = "";
    const auth = createAuth({
      globalClient,
      baseUrl: BASE_URL,
      secret: "x".repeat(32),
      sendMagicLink: async (data) => {
        capturedUrl = data.url;
      },
    });

    await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "origin-test@example.com" }),
      }),
    );
    const parsed = new URL(capturedUrl);
    expect(parsed.origin).toBe(BASE_URL);
  });

  it("verify URL must include token and callbackURL query params", async () => {
    let capturedUrl = "";
    const auth = createAuth({
      globalClient,
      baseUrl: BASE_URL,
      secret: "x".repeat(32),
      sendMagicLink: async (data) => {
        capturedUrl = data.url;
      },
    });

    await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "params-test@example.com",
          callbackURL: "https://example.com/projects/p1",
        }),
      }),
    );
    const parsed = new URL(capturedUrl);
    expect(parsed.searchParams.has("token")).toBe(true);
    expect(parsed.searchParams.get("token")!.length).toBeGreaterThan(0);
    expect(parsed.searchParams.get("callbackURL")).toBe(
      "https://example.com/projects/p1",
    );
  });
});
