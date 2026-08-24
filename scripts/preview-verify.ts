import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { ulid } from "ulid";
import { createGlobalClient } from "../packages/infrastructure/src/database/factory.ts";
import { createApiApp } from "../apps/api/src/index.ts";

const ORIGIN = process.env.BETTER_AUTH_URL ?? "http://localhost:8787";
const port = Number(new URL(ORIGIN).port) || 8787;
// TASK-7.1.1 — static origin kini production build Vite (apps/web/dist);
// build otomatis bila belum ada.
const staticDir = resolve(import.meta.dirname, "../apps/web/dist");
if (!existsSync(resolve(staticDir, "index.html"))) {
  const built = spawnSync("pnpm", ["--filter", "@kanban/web", "run", "build"], {
    cwd: resolve(import.meta.dirname, ".."),
    stdio: "inherit",
  });
  if (built.status !== 0) {
    throw new Error(`[preview-verify] build @kanban/web gagal (exit ${built.status})`);
  }
}

const captured: string[] = [];
const { app, getAuth } = createApiApp({
  sendMagicLink: async (data) => {
    captured.push(data.url);
  },
});

const testEmail = `one-origin-${Date.now()}@example.com`;
const testUserId = ulid();

const authContext = await getAuth().$context;
const existing = await authContext.internalAdapter.findUserByEmail(testEmail);
if (!existing) {
  const now = new Date().toISOString();
  await authContext.internalAdapter.createUser({
    id: testUserId,
    email: testEmail,
    name: "One Origin",
    emailVerified: false,
    image: null,
    createdAt: now,
    updatedAt: now,
  });
}

const contentType: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

async function serveStatic(reqUrl: string): Promise<{ status: number; body: Buffer; type: string } | null> {
  const pathname = new URL(reqUrl, ORIGIN).pathname;
  if (pathname.startsWith("/api/")) return null;
  const file = resolve(staticDir, pathname === "/" ? "index.html" : pathname.slice(1));
  if (!file.startsWith(staticDir)) return null;
  try {
    const body = await readFile(file);
    return { status: 200, body, type: contentType[extname(file)] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

const indexHtml = await readFile(resolve(staticDir, "index.html"));

const server = createServer(async (req, res) => {
  try {
    const staticHit = await serveStatic(req.url ?? "/");
    if (staticHit) {
      res.writeHead(staticHit.status, { "content-type": staticHit.type });
      res.end(staticHit.body);
      return;
    }
    const pathname = new URL(req.url ?? "/", ORIGIN).pathname;
    if (pathname.startsWith("/api/")) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const appRes = await app.request(new Request(new URL(req.url ?? "/", ORIGIN), {
        method: req.method,
        headers: { ...req.headers, origin: ORIGIN } as HeadersInit,
        body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
      }));
      res.writeHead(appRes.status, Object.fromEntries(appRes.headers.entries()));
      res.end(Buffer.from(await appRes.arrayBuffer()));
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(indexHtml);
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(String(error instanceof Error ? error.message : error));
  }
});

function check(name: string, condition: boolean, detail: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} ${name}${condition ? "" : ` — ${detail}`}`);
  if (!condition) process.exitCode = 1;
}

server.listen(port, async () => {
  const base = `http://localhost:${port}`;
  try {
    const health = await fetch(`${base}/api/v1/health`);
    const healthBody = await health.json();
    check("routing: /api/v1/health -> 200 JSON kanonik", health.status === 200 && healthBody.data?.status === "ok", JSON.stringify(healthBody));

    const home = await fetch(`${base}/`);
    const homeHtml = await home.text();
    check("routing: / -> 200 index.html (static)", home.status === 200 && homeHtml.includes("NGodingin Kanban"), `status=${home.status}`);

    const spa = await fetch(`${base}/board/some/route`);
    const spaHtml = await spa.text();
    check("routing: route web -> SPA fallback index.html", spa.status === 200 && spaHtml.includes("NGodingin Kanban"), `status=${spa.status}`);

    const unknownApi = await fetch(`${base}/api/unknown-xyz`);
    const unknownType = unknownApi.headers.get("content-type") ?? "";
    const unknownBody = await unknownApi.text();
    check("routing: unknown /api/* TIDAK pernah index.html", unknownApi.status === 404 && !unknownType.includes("text/html") && !unknownBody.includes("NGodingin Kanban"), `status=${unknownApi.status} type=${unknownType}`);

    const signIn = await fetch(`${base}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: testEmail }),
    });
    check("auth: sign-in/magic-link 200 (link dikirim via sender injectable)", signIn.status === 200, `status=${signIn.status}`);

    const magicUrl = captured[0];
    check("auth: magic link callback dihasilkan same-origin", typeof magicUrl === "string" && magicUrl.startsWith(base), `url=${magicUrl ?? "tidak ada"}`);

    if (magicUrl) {
      const verify = await fetch(magicUrl, { redirect: "manual" });
      const setCookie = verify.headers.get("set-cookie") ?? "";
      const ok = (verify.status === 200 || verify.status === 302) && setCookie.includes("kanban.session_token") && setCookie.includes("Path=/");
      check("auth: verifikasi callback -> session cookie same-origin (kanban.session_token)", ok, `status=${verify.status} cookie=${setCookie.split(";")[0] ?? "tidak ada"}`);
    }
  } finally {
    server.close();
    const cleanupClient = createGlobalClient();
    try {
      await cleanupClient.execute({ sql: "DELETE FROM auth_sessions WHERE user_id = ?", args: [testUserId] });
      await cleanupClient.execute({ sql: "DELETE FROM users WHERE id = ?", args: [testUserId] });
      await cleanupClient.execute({ sql: "DELETE FROM auth_verifications WHERE value LIKE ?", args: [`%${testEmail}%`] });
    } finally {
      await cleanupClient.close();
    }
  }
});