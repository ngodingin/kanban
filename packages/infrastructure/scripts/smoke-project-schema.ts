import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { readdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const EXPECTED_TABLES = [
    "project_state",
    "milestones",
    "boards",
    "lists",
    "cards",
    "milestone_labels",
    "board_labels",
    "card_milestone_labels",
    "card_board_labels",
    "activities",
];
const migrationsDir = resolve("drizzle/migrations-project");
const migrationFile = readdirSync(migrationsDir).find((f) => f.endsWith(".sql"));
if (!migrationFile)
    throw new Error("tidak ada migration project");
const ddl = readFileSync(join(migrationsDir, migrationFile), "utf8");
const ddlTables = new Set([...ddl.matchAll(/CREATE TABLE [`"]?(\w+)[`"]?/g)].map((m) => m[1]!).filter((n) => !n.startsWith("__drizzle")));
for (const name of EXPECTED_TABLES) {
    if (!ddlTables.has(name))
        throw new Error(`migration project tidak membuat tabel ${name}`);
}
if (ddlTables.size !== EXPECTED_TABLES.length) {
    throw new Error(`jumlah tabel migration ${ddlTables.size} != 10 (${[...ddlTables].join(", ")})`);
}
console.log("PASS: migration project memuat tepat 10 tabel sesuai B.3");
const dir = mkdtempSync(join(tmpdir(), "kanban-project-schema-"));
const client = createClient({ url: `file:${join(dir, "project.db")}` });
try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: migrationsDir });
    const versioned = ["project_state", "milestones", "boards", "lists", "cards", "milestone_labels", "board_labels"];
    for (const t of versioned) {
        const info = await client.execute(`PRAGMA table_info(${t})`);
        const cols = info.rows.map((r) => String(r.name));
        if (!cols.includes("version"))
            throw new Error(`${t} tidak punya version`);
        if (!cols.includes("archived_at") || !cols.includes("deleted_at")) {
            throw new Error(`${t} tidak punya archived_at/deleted_at`);
        }
    }
    const stateCols = (await client.execute("PRAGMA table_info(project_state)")).rows.map((r) => String(r.name));
    if (!stateCols.includes("project_id"))
        throw new Error("project_state harus punya project_id");
    console.log("PASS: project_state otoritatif + version + lifecycle timestamp di seluruh entity (B.1/B.3)");
    const junction = ["card_milestone_labels", "card_board_labels"];
    for (const t of junction) {
        const info = await client.execute(`PRAGMA table_info(${t})`);
        const cols = info.rows.map((r) => String(r.name));
        if (!cols.includes("removed_at"))
            throw new Error(`${t} tidak punya removed_at`);
    }
    console.log("PASS: junction label punya removed_at (NULL = asosiasi aktif)");
    await migrate(db, { migrationsFolder: migrationsDir });
    const journal = await client.execute("SELECT COUNT(*) AS n FROM __drizzle_migrations");
    if (Number(journal.rows[0]?.n) !== 1)
        throw new Error("migration project tidak idempotent");
    console.log("PASS: migration project idempotent");
    console.log("smoke project schema selesai");
}
finally {
    await client.close();
    rmSync(dir, { recursive: true, force: true });
}
