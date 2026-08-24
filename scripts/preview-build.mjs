import { build } from "esbuild";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const output = resolve(import.meta.dirname, "../.vercel/output");
const apiDir = resolve(output, "functions/api.func");
const staticDir = resolve(output, "static");

// TASK-7.1.1 — static origin kini berasal dari production build Vite
// (apps/web/dist), bukan lagi public/index.html statis. Build web di sini
// agar vercel.json buildCommand tetap satu langkah.
const webBuild = spawnSync(
  "pnpm",
  ["--filter", "@kanban/web", "run", "build"],
  { cwd: resolve(import.meta.dirname, ".."), stdio: "inherit" },
);
if (webBuild.status !== 0) {
  throw new Error(`[preview-build] build @kanban/web gagal (exit ${webBuild.status})`);
}

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
  // `libsql` me-resolve native binding platform-nya (mis. @libsql/linux-x64-gnu)
  // via require() dinamis — esbuild tidak bisa membundle ini secara statis.
  // Dibiarkan external lalu closure dependency-nya disalin utuh di bawah.
  external: ["libsql"],
});

const apiRequire = createRequire(resolve(import.meta.dirname, "../apps/api/package.json"));
const libsqlClientEntry = apiRequire.resolve("@libsql/client");
const libsqlClientRequire = createRequire(libsqlClientEntry);
// dirname(...) dua kali: resolve("libsql") -> .../node_modules/libsql/index.js,
// node_modules privat pnpm untuk libsql (berisi libsql/, @libsql/<platform>, @neon-rs, detect-libc
// sebagai sibling — bukan nested di dalam folder libsql/) ada satu level di atasnya.
const libsqlPkgDir = dirname(libsqlClientRequire.resolve("libsql"));
const libsqlPrivateNodeModules = dirname(libsqlPkgDir);
await cp(libsqlPrivateNodeModules, resolve(apiDir, "node_modules"), { recursive: true, dereference: true });

// Migration SQL dibaca runtime (provisionProjectDatabase -> applyProjectMigrations,
// dipanggil dari POST /projects) via `migrate.ts` -> `__dirname`-relatif fallback
// (esbuild men-stub import.meta kosong di output CJS). File .sql-nya sendiri
// TIDAK ikut ter-bundle esbuild (bukan kode JS) sehingga wajib disalin manual
// bersebelahan dengan index.js, sinkron dengan offset yang dipakai migrate.ts.
await cp(
  resolve(import.meta.dirname, "../packages/infrastructure/drizzle/migrations"),
  resolve(apiDir, "drizzle/migrations"),
  { recursive: true },
);
await cp(
  resolve(import.meta.dirname, "../packages/infrastructure/drizzle/migrations-project"),
  resolve(apiDir, "drizzle/migrations-project"),
  { recursive: true },
);

await cp(resolve(import.meta.dirname, "../apps/web/dist"), staticDir, { recursive: true });

await writeFile(
  resolve(apiDir, ".vc-config.json"),
  JSON.stringify({ runtime: "nodejs24.x", handler: "index.js" }, null, 2),
);

await writeFile(
  resolve(output, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { handle: "filesystem" },
        { src: "/api(?:/(.*))?", dest: "/api" },
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);

console.log("[preview-build] .vercel/output siap (api.func + static + config.json)");