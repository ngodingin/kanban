import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { projectDatabases } from "../src/database/global-schema.ts";
import { createGlobalClient } from "../src/database/factory.ts";
import { applyProjectMigrations } from "../src/database/migrate.ts";
import { getDatabase, mintDatabaseToken, type TursoEnv } from "../src/provisioning/turso.ts";

function urlIsFile(databaseId: string): boolean {
  return databaseId.startsWith("file:");
}

// `project_databases.database_id` menyimpan NAMA database Turso (mis. "proj-xxx",
// lihat provision.ts), bukan URL koneksi — resolusi hostname + JWT per-DB (A.4,
// pola sama dengan provisioning 0.6.1) wajib dilakukan di sini, satu token
// org-level TIDAK bisa dipakai langsung sebagai authToken libsql (temuan CL-06).
async function resolveProjectClient(databaseId: string, turso: TursoEnv | null): Promise<Client> {
  if (urlIsFile(databaseId)) return createClient({ url: databaseId });
  if (!turso) throw new Error("TURSO_API_TOKEN/TURSO_ORG/TURSO_GROUP wajib diisi untuk resolusi database Turso nyata");
  const { hostname } = await getDatabase(turso, databaseId);
  const authToken = await mintDatabaseToken(turso, databaseId);
  return createClient({ url: `https://${hostname}`, authToken });
}

export async function migrateProjectFanOut(): Promise<{ total: number; ok: number; failed: string[] }> {
  const global = createGlobalClient();
  const apiToken = process.env.TURSO_API_TOKEN;
  const turso: TursoEnv | null = apiToken
    ? { org: process.env.TURSO_ORG ?? "ngodingin-ai", group: process.env.TURSO_GROUP ?? "ngodingin-kanban", apiToken }
    : null;
  try {
    const db = drizzle(global);
    const mappings = await db.select().from(projectDatabases).run();
    const total = mappings.rows.length;
    const failed: string[] = [];
    let ok = 0;
    for (const row of mappings.rows) {
      const databaseId = String(row.database_id);
      try {
        const client = await resolveProjectClient(databaseId, turso);
        try {
          await applyProjectMigrations(client);
        } finally {
          await client.close();
        }
        ok += 1;
      } catch (error) {
        failed.push(`${row.project_id}: ${String(error instanceof Error ? error.message : error)}`);
      }
    }
    return { total, ok, failed };
  } finally {
    await global.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await migrateProjectFanOut();
  console.log(
    `[migrate:projects] ${result.ok}/${result.total} Project DB termigrasi` +
      (result.failed.length > 0 ? `\nGAGAL:\n${result.failed.join("\n")}` : ""),
  );
  if (result.failed.length > 0) process.exitCode = 1;
}
