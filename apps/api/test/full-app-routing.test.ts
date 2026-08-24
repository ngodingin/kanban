import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
const repoRoot = resolve(import.meta.dirname, "../../..");
const bundlePath = resolve(repoRoot, ".vercel/output/functions/api.func/index.js");
interface Bundle {
    GET: (req: Request) => Promise<Response>;
    POST: (req: Request) => Promise<Response>;
    PATCH: (req: Request) => Promise<Response>;
    createApiApp: (opts?: Record<string, unknown>) => {
        app: {
            routes: RouteEntry[];
        };
    };
}
interface RouteEntry {
    method: string;
    path: string;
}
let bundle: Bundle;
let routes: RouteEntry[];
beforeAll(() => {
    execFileSync("node", ["scripts/preview-build.mjs"], { cwd: repoRoot, stdio: "pipe" });
    const req = createRequire(import.meta.url);
    bundle = req(bundlePath) as Bundle;
    const { app } = bundle.createApiApp();
    routes = app.routes;
}, 30000);
function fillParams(path: string): string {
    return path.replace(/:[a-zA-Z_]+/g, "dummy-id");
}
describe("Full composed app routing — SETIAP route terdaftar reachable (goal 0.13.2)", () => {
    it("membangun bundle dengan >= 80 route terdaftar (sanity — bukan build kosong/gagal)", () => {
        expect(routes.length).toBeGreaterThanOrEqual(80);
    });
    it("[DoD] TIDAK ADA route terdaftar dengan prefix dobel /api/api/", () => {
        const doubled = routes.filter((r) => r.path.includes("/api/api/"));
        expect(doubled).toEqual([]);
    });
    it("[DoD] GET /api/v1/health reachable dan mengembalikan 200 (bukan 404 unmatched)", async () => {
        const res = await bundle.GET(new Request("http://localhost/api/v1/health"));
        expect(res.status).toBe(200);
    });
    it("[DoD] path tidak terdaftar (unknown) TETAP 404 raw Hono — bukti pembeda dgn 'matched tapi error'", async () => {
        const res = await bundle.GET(new Request("http://localhost/api/definitely-not-a-real-route-xyz"));
        expect(res.status).toBe(404);
        expect(await res.text()).toBe("404 Not Found");
    });
    it("SETIAP route terdaftar (81, dari app.routes — bukan sample) direquest nyata dan TIDAK pernah kena unmatched-404 Hono", async () => {
        const real = routes.filter((r) => r.method !== "ALL");
        expect(real.length).toBeGreaterThan(0);
        const unmatchedFailures: string[] = [];
        for (const route of real) {
            const handler = route.method === "GET"
                ? bundle.GET
                : route.method === "POST"
                    ? bundle.POST
                    : route.method === "PATCH"
                        ? bundle.PATCH
                        : null;
            if (!handler) {
                unmatchedFailures.push(`${route.method} ${route.path} — tidak ada handler ter-export untuk method ini`);
                continue;
            }
            const url = `http://localhost${fillParams(route.path)}`;
            const res = await handler(new Request(url, { method: route.method === "ALL" ? "GET" : route.method }));
            const bodyText = await res.text();
            const isUnmatchedHono404 = res.status === 404 && bodyText === "404 Not Found";
            if (isUnmatchedHono404) {
                unmatchedFailures.push(`${route.method} ${route.path} → 404 Hono unmatched (prefix dobel atau route hilang)`);
            }
        }
        expect(unmatchedFailures, unmatchedFailures.join("\n")).toEqual([]);
    }, 60000);
});
