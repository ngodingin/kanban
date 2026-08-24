import { createClient } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectDatabaseNotFoundError, SqliteProjectDatabaseResolver, resolveOrThrow, } from "../src/database/project-resolver.ts";
const dir = mkdtempSync(join(tmpdir(), "kanban-guard-"));
const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
const projectClient = createClient({ url: `file:${join(dir, "projectA.db")}` });
try {
    await globalClient.execute("CREATE TABLE project_databases (project_id TEXT PRIMARY KEY, database_id TEXT NOT NULL, created_at TEXT NOT NULL)");
    await globalClient.execute({
        sql: "INSERT INTO project_databases (project_id, database_id, created_at) VALUES (?, ?, ?)",
        args: ["proj_A", "db_projA", "2026-08-18T00:00:00.000Z"],
    });
    await projectClient.execute("CREATE TABLE markers (id TEXT PRIMARY KEY)");
    await projectClient.execute({ sql: "INSERT INTO markers (id) VALUES (?)", args: ["hanya-A"] });
    const resolver = new SqliteProjectDatabaseResolver(globalClient);
    const mapping = await resolveOrThrow(resolver, "proj_A");
    if (mapping.databaseId !== "db_projA")
        throw new Error("mapping proj_A salah");
    console.log("PASS positif: resolveOrThrow project dikenal -> mapping");
    let threw = false;
    try {
        await resolveOrThrow(resolver, "proj_GAIB");
    }
    catch (e) {
        threw = e instanceof ProjectDatabaseNotFoundError;
    }
    if (!threw)
        throw new Error("project_id tak dikenal harus throw ProjectDatabaseNotFoundError");
    console.log("PASS negatif: resolveOrThrow project tak dikenal -> throw ProjectDatabaseNotFoundError");
    const rows = await projectClient.execute("SELECT id FROM markers");
    if (rows.rows.length !== 1 || String(rows.rows[0]!.id) !== "hanya-A")
        throw new Error("project DB berubah");
    console.log("PASS negatif: guard tidak pernah menyentuh/mengubah Project DB lain");
    console.log("smoke guard selesai");
}
finally {
    await globalClient.close();
    await projectClient.close();
    rmSync(dir, { recursive: true, force: true });
}
