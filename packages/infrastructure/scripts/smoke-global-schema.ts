import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { readdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const EXPECTED_TABLES = [
    "users",
    "auth_sessions",
    "auth_accounts",
    "auth_verifications",
    "projects",
    "project_databases",
    "project_memberships",
    "permissions",
    "permission_groups",
    "group_permissions",
    "membership_group_assignments",
    "membership_permission_assignments",
    "invitations",
    "invitation_group_assignments",
    "api_keys",
    "personal_access_tokens",
];
const migrationsDir = resolve("drizzle/migrations");
const migrationFile = readdirSync(migrationsDir).find((f) => f.endsWith(".sql"));
if (!migrationFile)
    throw new Error("tidak ada file migration di drizzle/migrations");
const ddl = readFileSync(join(migrationsDir, migrationFile), "utf8");
const ddlTables = new Set([...ddl.matchAll(/CREATE TABLE [`"]?(\w+)[`"]?/g)].map((m) => m[1]!).filter((n) => !n.startsWith("__drizzle")));
for (const name of EXPECTED_TABLES) {
    if (!ddlTables.has(name))
        throw new Error(`migration tidak membuat tabel ${name}`);
}
if (ddlTables.size !== EXPECTED_TABLES.length) {
    throw new Error(`jumlah tabel migration ${ddlTables.size} != 16 (${[...ddlTables].join(", ")})`);
}
console.log("PASS: migration DDL (dari schema TS via drizzle-kit generate) memuat tepat 16 tabel sesuai B.2");
const dir = mkdtempSync(join(tmpdir(), "kanban-global-schema-"));
const client = createClient({ url: `file:${join(dir, "global.db")}` });
try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: resolve("drizzle/migrations") });
    const tables = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'");
    const created = new Set(tables.rows.map((r) => String(r.name)));
    for (const name of EXPECTED_TABLES) {
        if (!created.has(name))
            throw new Error(`tabel ${name} tidak ada di DB hasil migrasi`);
    }
    console.log(`PASS: migrasi menghasilkan ${created.size} tabel di DB (semua 16 ada)`);
    const indexNames = await client.execute("SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'");
    const idx = new Set(indexNames.rows.map((r) => String(r.name)));
    for (const expected of [
        "users_email_unique",
        "auth_sessions_token_unique",
        "auth_accounts_provider_account_unique",
        "auth_verifications_identifier_unique",
        "project_memberships_project_user_unique",
        "group_permissions_group_permission_unique",
        "membership_group_assignments_active_unique",
        "membership_permission_assignments_active_unique",
    ]) {
        if (!idx.has(expected))
            throw new Error(`index ${expected} tidak ada`);
    }
    console.log("PASS: UNIQUE index inti ada (email, token, provider+account, identifier, membership, group_permission, scoped partial)");
    console.log("smoke global schema selesai");
}
finally {
    await client.close();
    rmSync(dir, { recursive: true, force: true });
}
