import { build } from "esbuild";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
const output = resolve(import.meta.dirname, "../.vercel/output");
const apiDir = resolve(output, "functions/api.func");
const staticDir = resolve(output, "static");
await rm(output, { recursive: true, force: true });
await mkdir(apiDir, { recursive: true });
await mkdir(staticDir, { recursive: true });
await build({
    entryPoints: [resolve(import.meta.dirname, "../apps/api/src/index.ts")],
    outfile: resolve(apiDir, "index.js"),
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node22",
    sourcemap: true,
    logLevel: "warning",
    external: ["libsql"],
});
const apiRequire = createRequire(resolve(import.meta.dirname, "../apps/api/package.json"));
const libsqlClientEntry = apiRequire.resolve("@libsql/client");
const libsqlClientRequire = createRequire(libsqlClientEntry);
const libsqlPkgDir = dirname(libsqlClientRequire.resolve("libsql"));
const libsqlPrivateNodeModules = dirname(libsqlPkgDir);
await cp(libsqlPrivateNodeModules, resolve(apiDir, "node_modules"), { recursive: true, dereference: true });
await cp(resolve(import.meta.dirname, "../packages/infrastructure/drizzle/migrations"), resolve(apiDir, "drizzle/migrations"), { recursive: true });
await cp(resolve(import.meta.dirname, "../packages/infrastructure/drizzle/migrations-project"), resolve(apiDir, "drizzle/migrations-project"), { recursive: true });
await cp(resolve(import.meta.dirname, "../apps/web/public"), staticDir, { recursive: true });
await writeFile(resolve(apiDir, ".vc-config.json"), JSON.stringify({ runtime: "nodejs24.x", handler: "index.js" }, null, 2));
await writeFile(resolve(output, "config.json"), JSON.stringify({
    version: 3,
    routes: [
        { handle: "filesystem" },
        { src: "/api(?:/(.*))?", dest: "/api" },
        { src: "/(.*)", dest: "/index.html" },
    ],
}, null, 2));
console.log("[preview-build] .vercel/output siap (api.func + static + config.json)");
