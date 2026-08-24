import type { Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { projectDatabases } from "../src/database/global-schema.ts";
import { createGlobalClient } from "../src/database/factory.ts";
import { applyProjectMigrations } from "../src/database/migrate.ts";
import { readTursoEnvFromProcess, resolveProjectDbClient } from "../src/database/project-client.ts";
export async function migrateProjectFanOut(): Promise<{
    total: number;
    ok: number;
    failed: string[];
}> {
    const global = createGlobalClient();
    const turso = readTursoEnvFromProcess();
    try {
        const db = drizzle(global);
        const mappings = await db.select().from(projectDatabases).run();
        const total = mappings.rows.length;
        const failed: string[] = [];
        let ok = 0;
        for (const row of mappings.rows) {
            const databaseId = String(row.database_id);
            try {
                const client: Client = await resolveProjectDbClient(databaseId, turso);
                try {
                    await applyProjectMigrations(client);
                }
                finally {
                    await client.close();
                }
                ok += 1;
            }
            catch (error) {
                failed.push(`${row.project_id}: ${String(error instanceof Error ? error.message : error)}`);
            }
        }
        return { total, ok, failed };
    }
    finally {
        await global.close();
    }
}
if (import.meta.url === `file://${process.argv[1]}`) {
    const result = await migrateProjectFanOut();
    console.log(`[migrate:projects] ${result.ok}/${result.total} Project DB termigrasi` +
        (result.failed.length > 0 ? `\nGAGAL:\n${result.failed.join("\n")}` : ""));
    if (result.failed.length > 0)
        process.exitCode = 1;
}
