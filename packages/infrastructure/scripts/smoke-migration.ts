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

  // Daftar ekspektasinya eksplisit (diselaraskan dengan global-schema.ts) —
  // perubahan skema WAJIB memperbarui daftar ini, menjadi gate review yang
  // sengaja (QA-CL-68: harness tidak boleh diam saat skema berubah).
  const expectedTableNames = [
    "api_keys",
    "auth_accounts",
    "auth_sessions",
    "auth_verifications",
    "group_permissions",
    "idempotency_keys",
    "invitation_group_assignments",
    "invitations",
    "membership_group_assignments",
    "membership_permission_assignments",
    "permission_groups",
    "permissions",
    "personal_access_tokens",
    "project_databases",
    "project_deprovision_jobs",
    "project_memberships",
    "projects",
    "users",
  ].sort();
  const actualTables = (
    await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name",
    )
  ).rows.map((r) => String(r.name));
  if (JSON.stringify(actualTables) !== JSON.stringify(expectedTableNames)) {
    throw new Error(
      `daftar tabel tidak cocok — hilang: ${expectedTableNames.filter((t) => !actualTables.includes(t)).join(",") || "-"}; ekstra: ${actualTables.filter((t) => !expectedTableNames.includes(t)).join(",") || "-"}`,
    );
  }

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