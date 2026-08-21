import { createClient } from "@libsql/client";
import { applyGlobalMigrations } from "../src/database/migrate.ts";
import { registerProject, recordProjectDatabaseMapping, deleteProjectRegistry } from "../src/database/global-store.ts";
import { createDatabase, deleteDatabase, getDatabase, mintDatabaseToken, projectDatabaseName } from "../src/provisioning/turso.ts";
import { migrateProjectFanOut } from "./migrate-projects.ts";

const apiToken = process.env.TURSO_API_TOKEN;
const globalUrl = process.env.GLOBAL_DB_URL;
const globalToken = process.env.GLOBAL_DB_TOKEN;
if (!apiToken || !globalUrl || !globalToken) {
  console.log("SKIP: kredensial Turso/Global tidak lengkap");
  process.exit(0);
}

const turso = {
  org: process.env.TURSO_ORG ?? "ngodingin-ai",
  group: process.env.TURSO_GROUP ?? "ngodingin-kanban",
  apiToken,
};
const now = new Date().toISOString();
const stamp = now.replace(/[^0-9]/g, "");
const globalClient = createClient({ url: globalUrl, authToken: globalToken });
let failed = false;
const fail = (label: string, e?: unknown): void => {
  failed = true;
  console.error(`FAIL ${label}${e ? `: ${String(e)}` : ""}`);
};

const projectId = `proj_migfanout_${stamp}`;
const userId = `user_migfanout_${stamp}`;
const dbName = projectDatabaseName(projectId);

try {
  await applyGlobalMigrations(globalClient);
  await globalClient.execute({
    sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)",
    args: [userId, `user-migfanout-${stamp}@smoke.local`, "Smoke MigFanout", now, now],
  });

  // Project DB dibuat langsung via Turso API (bukan lewat provisionProjectDatabase)
  // supaya BELUM termigrasi — membuktikan migrateProjectFanOut() yang menerapkannya,
  // bukan sudah termigrasi sejak awal.
  await createDatabase(turso, dbName);

  await registerProject(globalClient, { projectId, ownerUserId: userId, now });
  // database_id = NAMA Turso ("proj-xxx"), bukan URL — sesuai kontrak provision.ts.
  await recordProjectDatabaseMapping(globalClient, { projectId, databaseId: dbName, now });

  const result = await migrateProjectFanOut();
  if (result.total < 1) fail("total", `total mapping harus >=1, dapat ${result.total}`);
  else console.log(`PASS: fan-out melihat ${result.total} mapping (termasuk project uji)`);
  if (result.failed.length > 0) fail("gagal", result.failed.join("; "));
  else console.log("PASS: tidak ada kegagalan fan-out untuk mapping manapun");
  if (result.ok < 1) fail("ok", `ok harus >=1, dapat ${result.ok}`);

  const { hostname } = await getDatabase(turso, dbName);
  const jwt = await mintDatabaseToken(turso, dbName);
  const projectClient = createClient({ url: `https://${hostname}`, authToken: jwt });
  try {
    const tables = await projectClient.execute(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'",
    );
    if (Number(tables.rows[0]?.n) !== 10) fail("migrasi", `10 tabel Project diharapkan, dapat ${tables.rows[0]?.n}`);
    else console.log("PASS: fan-out benar-benar menerapkan migration (10 tabel Project DB terpasang di DB nyata)");
  } finally {
    await projectClient.close();
  }

  console.log("smoke migrate-projects (fan-out nyata) selesai");
} catch (e) {
  fail("exception", e);
} finally {
  await globalClient.execute({ sql: "DELETE FROM users WHERE id = ?", args: [userId] }).catch(() => undefined);
  await deleteProjectRegistry(globalClient, projectId).catch(() => undefined);
  await deleteDatabase(turso, dbName).catch(() => undefined);
  await globalClient.close();
  console.log("INFO: data uji dihapus (cleanup)");
}

if (failed) process.exit(1);
