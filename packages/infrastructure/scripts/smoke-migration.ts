import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "kanban-migration-"));
const client = createClient({ url: `file:${join(dir, "global.db")}` });
const db = drizzle(client);
const migrationsFolder = resolve("drizzle/migrations");
const migrationFileCount = readdirSync(migrationsFolder).filter((f) => f.endsWith(".sql")).length;

async function appliedCount(): Promise<number> {
  const res = await client.execute("SELECT COUNT(*) AS n FROM __drizzle_migrations");
  return Number(res.rows[0]?.n ?? 0);
}

async function tableCount(): Promise<number> {
  const res = await client.execute(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'",
  );
  return Number(res.rows[0]?.n ?? 0);
}

try {
  await migrate(db, { migrationsFolder });
  const afterFirst = await appliedCount();
  if (afterFirst !== migrationFileCount) {
    throw new Error(`journal setelah apply pertama = ${afterFirst}, harus ${migrationFileCount}`);
  }

  await migrate(db, { migrationsFolder });
  const afterSecond = await appliedCount();
  if (afterSecond !== migrationFileCount) {
    throw new Error(`journal setelah apply ulang = ${afterSecond}, harus tetap ${migrationFileCount} (idempotent)`);
  }

  const tables = await tableCount();
  if (tables !== 16) throw new Error(`jumlah tabel setelah apply ulang = ${tables}, harus 16`);

  await client.execute("INSERT INTO permissions (id, key) VALUES ('perm_idem', 'card.move')");
  await migrate(db, { migrationsFolder });
  const afterData = await appliedCount();
  if (afterData !== migrationFileCount) throw new Error("apply ulang dengan data ada harus tetap no-op");
  const perm = await client.execute("SELECT id FROM permissions WHERE id = 'perm_idem'");
  if (perm.rows.length !== 1) throw new Error("data hilang setelah apply ulang");
  console.log("PASS: migration up idempotent — apply 2x (sebelum & sesudah data) tidak mengubah journal/struktur/data");

  console.log("smoke migration selesai");
} finally {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
}