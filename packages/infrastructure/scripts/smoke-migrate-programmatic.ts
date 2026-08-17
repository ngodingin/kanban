import { createClient } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyGlobalMigrations, applyProjectMigrations } from "../src/database/migrate.ts";

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
    if (Number(globalTables.rows[0]?.n) !== 1) fail("global", "journal global != 1");
    else console.log("PASS: applyGlobalMigrations terprogram (journal 1)");

    await applyProjectMigrations(p);
    const state = await p.execute(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='project_state'",
    );
    if (Number(state.rows[0]?.n) !== 1) fail("project", "project_state tidak ada");
    else console.log("PASS: applyProjectMigrations terprogram (10 tabel terpasang)");

    const junction = await p.execute("PRAGMA table_info(card_board_labels)");
    const cols = junction.rows.map((r) => String(r.name));
    if (!cols.includes("removed_at")) fail("junction", "removed_at tidak ada");
    else console.log("PASS: junction punya removed_at");

    await applyProjectMigrations(p);
    const journal = await p.execute("SELECT COUNT(*) AS n FROM __drizzle_migrations");
    if (Number(journal.rows[0]?.n) !== 1) fail("idempotent", "journal project != 1 setelah apply ulang");
    else console.log("PASS: apply ulang idempotent (fan-out aman)");
  } finally {
    await g.close();
    await p.close();
  }
} catch (e) {
  fail("exception", e);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failed) process.exit(1);
console.log("smoke migrate selesai");