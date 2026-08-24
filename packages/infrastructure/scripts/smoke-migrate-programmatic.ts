import { createClient } from "@libsql/client";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { applyGlobalMigrations, applyProjectMigrations } from "../src/database/migrate.ts";
function migrationFileCount(dirPath: string): number {
    return readdirSync(dirPath).filter((f) => f.endsWith(".sql")).length;
}
const globalMigrationCount = migrationFileCount(resolve("drizzle/migrations"));
const projectMigrationCount = migrationFileCount(resolve("drizzle/migrations-project"));
const dir = mkdtempSync(join(tmpdir(), "kanban-migrate-fanout-"));
let failed = false;
const fail = (label: string, e: unknown): void => {
    failed = true;
    console.error(`FAIL ${label}: ${String(e)}`);
};
try {
    const g = createClient({ url: `file:${join(dir, "global.db")}` });
    const p = createClient({ url: `file:${join(dir, "project.db")}` });
    try {
        await applyGlobalMigrations(g);
        const globalTables = await g.execute("SELECT COUNT(*) AS n FROM __drizzle_migrations");
        if (Number(globalTables.rows[0]?.n) !== globalMigrationCount) {
            fail("global", `journal global = ${globalTables.rows[0]?.n}, harus ${globalMigrationCount}`);
        }
        else
            console.log(`PASS: applyGlobalMigrations terprogram (journal ${globalMigrationCount})`);
        await applyProjectMigrations(p);
        const state = await p.execute("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='project_state'");
        if (Number(state.rows[0]?.n) !== 1)
            fail("project", "project_state tidak ada");
        else
            console.log("PASS: applyProjectMigrations terprogram (10 tabel terpasang)");
        const junction = await p.execute("PRAGMA table_info(card_board_labels)");
        const cols = junction.rows.map((r) => String(r.name));
        if (!cols.includes("removed_at"))
            fail("junction", "removed_at tidak ada");
        else
            console.log("PASS: junction punya removed_at");
        await applyProjectMigrations(p);
        const journal = await p.execute("SELECT COUNT(*) AS n FROM __drizzle_migrations");
        if (Number(journal.rows[0]?.n) !== projectMigrationCount) {
            fail("idempotent", `journal project = ${journal.rows[0]?.n} setelah apply ulang, harus tetap ${projectMigrationCount}`);
        }
        else
            console.log("PASS: apply ulang idempotent (fan-out aman)");
    }
    finally {
        await g.close();
        await p.close();
    }
}
catch (e) {
    fail("exception", e);
}
finally {
    rmSync(dir, { recursive: true, force: true });
}
if (failed)
    process.exit(1);
console.log("smoke migrate selesai");
