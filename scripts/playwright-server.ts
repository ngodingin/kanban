import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createApiApp } from "../apps/api/src/index.ts";

const ORIGIN = process.env.BETTER_AUTH_URL ?? "http://localhost:3100";
const port = Number(new URL(ORIGIN).port) || 3100;

const staticDir = resolve(import.meta.dirname, "../apps/web/dist");

async function ensureBuild(): Promise<void> {
  const built = spawnSync("pnpm", ["--filter", "@kanban/web", "run", "build"], {
    cwd: resolve(import.meta.dirname, ".."),
    stdio: "inherit",
  });
  if (built.status !== 0) {
    throw new Error(`[playwright-server] build @kanban/web gagal (exit ${built.status})`);
  }
}

const captured: string[] = [];
const { app } = createApiApp({
  sendMagicLink: async (data) => {
    captured.push(data.url);
  },
});

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

async function main() {
  await ensureBuild();
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

      // Test-only endpoint: expose captured magic link URLs for E2E verification.
      // This is ONLY available on the playwright test server, never on production.
      if (pathname === "/__test/captured-urls") {
        const body = JSON.stringify({ urls: captured });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(body);
        return;
      }
      if (pathname === "/__test/captured-urls/reset") {
        captured.length = 0;
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"ok":true}');
        return;
      }

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

  server.listen(port, () => {
    console.log(`[playwright-server] listening on ${ORIGIN}`);
  });
}

main();
