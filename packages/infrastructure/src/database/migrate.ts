import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { Client } from "@libsql/client";
import { resolve } from "node:path";

// `import.meta.dirname` hanya berfungsi saat file ini dieksekusi sebagai ESM
// asli (CLI scripts, vitest). esbuild men-stub `import.meta` jadi objek kosong
// pada output CJS (bundle Vercel, scripts/preview-build.mjs) -- `.dirname`
// (maupun `.url`) jadi undefined dan resolve() throw saat modul di-load,
// meng-crash seluruh fungsi API (ditemukan QA full-suite 2026-08-22).
// Fallback ke `__dirname` bawaan wrapper CJS saat bundled; preview-build.mjs
// menyalin folder `drizzle/` langsung bersebelahan dengan bundle agar offset
// relatifnya cocok.
function migrationsRoot(): string {
  const metaDirname = (import.meta as { dirname?: string }).dirname;
  if (metaDirname) return resolve(metaDirname, "../..", "drizzle");
  // __dirname (ambient global @types/node) hanya benar-benar terdefinisi di
  // runtime CJS (wrapper bundle) -- tidak pernah dievaluasi di jalur ESM asli
  // karena metaDirname sudah truthy dan return lebih dulu di branch atas.
  return resolve(__dirname, "drizzle");
}

const migrationsDir = resolve(migrationsRoot(), "migrations");
const projectMigrationsDir = resolve(migrationsRoot(), "migrations-project");

export async function applyGlobalMigrations(client: Client): Promise<void> {
  await migrate(drizzle(client), { migrationsFolder: migrationsDir });
}

export async function applyProjectMigrations(client: Client): Promise<void> {
  await migrate(drizzle(client), { migrationsFolder: projectMigrationsDir });
}