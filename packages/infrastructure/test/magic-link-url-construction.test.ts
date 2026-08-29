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

  it("real callback: verify endpoint creates a database-backed session (QA-CL-69 regression)", async () => {
    let capturedToken = "";
    const auth = createAuth({
      globalClient,
      baseUrl: BASE_URL,
      secret: "x".repeat(32),
      sendMagicLink: async (data) => {
        capturedToken = data.token;
      },
    });

    // 1. Request magic link → token is captured by mock sendMagicLink
    const signInRes = await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "real-callback@example.com" }),
      }),
    );
    expect(signInRes.status).toBe(200);
    expect(capturedToken.length).toBeGreaterThan(0);

    // 2. Verify the token (no callbackURL → returns JSON with session)
    const verifyRes = await auth.handler(
      new Request(
        `${BASE_URL}/api/auth/magic-link/verify?token=${encodeURIComponent(capturedToken)}`,
        { method: "GET", headers: { cookie: "" } },
      ),
    );
    expect(verifyRes.status).toBe(200);
    const body = (await verifyRes.json()) as {
      session?: { token?: string };
      user?: { email?: string };
    };

    // 3. Session must exist with a token
    expect(body.session).toBeDefined();
    expect(body.session!.token!.length).toBeGreaterThan(0);

    // 4. User must match
    expect(body.user).toBeDefined();
    expect(body.user!.email).toBe("real-callback@example.com");

    // 5. Session cookie must be set in response
    const setCookie = verifyRes.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("kanban.session_token=");
  });

  it("redirect callback: verify with callbackURL must include Set-Cookie header on redirect response", async () => {
    let capturedToken = "";
    const auth = createAuth({
      globalClient,
      baseUrl: BASE_URL,
      secret: "x".repeat(32),
      sendMagicLink: async (data) => {
        capturedToken = data.token;
      },
    });

    await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "redirect-callback@example.com" }),
      }),
    );

    // Verify WITH callbackURL → should redirect (302) + Set-Cookie
    const verifyRes = await auth.handler(
      new Request(
        `${BASE_URL}/api/auth/magic-link/verify?token=${encodeURIComponent(capturedToken)}&callbackURL=${encodeURIComponent("https://example.com/projects/p1")}`,
        { method: "GET" },
      ),
    );

    // Should be a redirect
    expect([301, 302, 303, 307]).toContain(verifyRes.status);
    const location = verifyRes.headers.get("location") ?? "";
    expect(location).toContain("example.com");

    // CRITICAL: Set-Cookie must be present on the redirect response
    const setCookie = verifyRes.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("kanban.session_token=");
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
    // CL-105: guardedSendMagicLink rewrites callbackURL ke /login/verify untuk
    // menghindari Vercel CDN yang men-strip Set-Cookie dari 302 redirect.
    const rewrittenCallback = new URL(parsed.searchParams.get("callbackURL")!);
    expect(rewrittenCallback.pathname).toBe("/login/verify");
    expect(rewrittenCallback.searchParams.get("returnTo")).toBe("/projects/p1");
  });
});
