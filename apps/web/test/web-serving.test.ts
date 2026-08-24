import { mkdtempSync, readFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { build } from "vite";
// API Hono sungguhan (bukan stub) agar kontrak satu-origin teruji apa adanya;
// seluruh koneksi DB-nya lazy (ensure()) sehingga hanya /api/v1/* routing yang
// dieksekusi di sini.
import { createApiApp } from "../../../apps/api/src/index.ts";

const webRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

let distDir: string;

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

// Topologi satu-origin yang identik dengan scripts/preview-build.mjs +
// .vercel/output/config.json: filesystem dulu -> /api/* ke Hono ->
// sisanya fallback index.html (SPA deep link).
async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    return apiApp.fetch(request);
  }
  const filePath = resolve(distDir, "." + url.pathname);
  if (
    filePath.startsWith(distDir) &&
    existsSync(filePath) &&
    statSync(filePath).isFile()
  ) {
    return new Response(readFileSync(filePath), {
      headers: { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" },
    });
  }
  return new Response(readFileSync(join(distDir, "index.html")), {
    headers: { "content-type": "text/html" },
  });
}

const { app: apiApp } = createApiApp();

beforeAll(async () => {
  distDir = mkdtempSync(join(tmpdir(), "kanban-web-dist-"));
  // Build produksi memakai vite.config.ts yang benar-benar di-commit
  // (plugin react + tailwind + alias "@" ikut teruji).
  await build({
    root: webRoot,
    logLevel: "warn",
    build: { outDir: distDir, emptyOutDir: true },
  });
}, 180_000);

afterAll(() => {
  // distDir ada di os.tmpdir(); biarkan OS membersihkan.
});

describe("TASK-7.1.1 — production build SPA tersaji bersama Hono pada satu origin", () => {
  test("GET / mengembalikan HTML SPA produksi dengan aset ter-hash", async () => {
    const res = await handle(new Request("http://localhost/"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain('<div id="root"></div>');
    expect(html).toMatch(/assets\/.+\.js/);
  });

  test("deep link SPA jatuh ke index.html (fallback aktif)", async () => {
    const indexHtml = readFileSync(join(distDir, "index.html"), "utf8");
    for (const path of ["/projects/p1/boards/b1", "/login", "/a/b/c/d"]) {
      const res = await handle(new Request(`http://localhost${path}`));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(await res.text()).toBe(indexHtml);
    }
  });

  test("GET /api/v1/health dijawab Hono pada origin yang sama", async () => {
    const res = await handle(new Request("http://localhost/api/v1/health"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { data?: { status?: string } };
    expect(body.data?.status).toBe("ok");
  });

  test("negatif: /api/* tak dikenal TIDAK tertangkap fallback SPA", async () => {
    const res = await handle(
      new Request("http://localhost/api/v1/tidak-ada"),
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).not.toContain("text/html");
    const body = await res.text();
    expect(body).not.toContain('<div id="root">');
  });

  test("aset hasil build dilayani dari filesystem sebelum fallback", async () => {
    const html = readFileSync(join(distDir, "index.html"), "utf8");
    const asset = html.match(/(assets\/[^"]+\.js)/)?.[1];
    expect(asset).toBeTruthy();
    const res = await handle(new Request(`http://localhost/${asset}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
  });
});
