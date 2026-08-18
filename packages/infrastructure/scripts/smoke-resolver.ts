import { createClient } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteProjectDatabaseResolver, type ProjectDatabaseMapping } from "../src/database/project-resolver.ts";

const dir = mkdtempSync(join(tmpdir(), "kanban-resolver-"));
const client = createClient({ url: `file:${join(dir, "global.db")}` });
try {
  await client.execute(
    "CREATE TABLE project_databases (project_id TEXT PRIMARY KEY, database_id TEXT NOT NULL, created_at TEXT NOT NULL)",
  );
  await client.execute({
    sql: "INSERT INTO project_databases (project_id, database_id, created_at) VALUES (?, ?, ?)",
    args: ["proj_01HZ", "db_000001", "2026-08-18T00:00:00.000Z"],
  });

  const resolver = new SqliteProjectDatabaseResolver(client);

  const found = await resolver.resolve("proj_01HZ");
  const expected: ProjectDatabaseMapping = {
    projectId: "proj_01HZ",
    databaseId: "db_000001",
    createdAt: "2026-08-18T00:00:00.000Z",
  };
  if (JSON.stringify(found) !== JSON.stringify(expected)) {
    throw new Error(`resolve proj_01HZ salah: ${JSON.stringify(found)}`);
  }
  console.log("PASS positif: resolve project_id dikenal -> mapping benar");

  const unknown = await resolver.resolve("proj_NOPE");
  if (unknown !== null) throw new Error(`project_id tak dikenal seharusnya null: ${JSON.stringify(unknown)}`);
  console.log("PASS negatif: resolve project_id tak dikenal -> null (tidak menyentuh DB lain)");

  const empty = await resolver.resolve("");
  if (empty !== null) throw new Error("project_id kosong seharusnya null");
  console.log("PASS negatif: resolve project_id kosong -> null");

  console.log("smoke resolver selesai");
} finally {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
}