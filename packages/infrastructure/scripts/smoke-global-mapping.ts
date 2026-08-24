import { createClient } from "@libsql/client";
import { applyGlobalMigrations } from "../src/database/migrate.ts";
import { recordProjectDatabaseMapping, registerProject, MappingAlreadyExistsError } from "./smoke-global-store-helpers.ts";
import { drizzle } from "drizzle-orm/libsql";
import { projectDatabases, projects, users } from "../src/database/global-schema.ts";
import { eq } from "drizzle-orm";

const url = process.env.GLOBAL_DB_URL;
const token = process.env.GLOBAL_DB_TOKEN;
if (!url || !token) {
  console.log("SKIP: GLOBAL_DB_URL/GLOBAL_DB_TOKEN tidak ada");
  process.exit(0);
}

const now = new Date().toISOString();
const projectId = `proj_mapping_smoke_${now.replace(/[^0-9]/g, "")}`;
const userId = "user_mapping_smoke";
const databaseId = "kanban-proj-mapping-smoke";
const client = createClient({ url, authToken: token });
const db = drizzle(client);
let failed = false;
const fail = (label: string, e?: unknown): void => {
  failed = true;
  console.error(`FAIL ${label}${e ? `: ${String(e)}` : ""}`);
};

try {
  await applyGlobalMigrations(client);
  const tables = await client.execute("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE '__drizzle%'");
  if (Number(tables.rows[0]?.n) !== 16) fail("migrate", "Global DB harus 16 tabel");
  else console.log("PASS: Global DB nyata (Turso) siap — 16 tabel via applyGlobalMigrations");

  await db.insert(users).values({
    id: userId,
    email: `${userId}@smoke.local`,
    email_verified: false,
    name: "Smoke User",
    created_at: now,
    updated_at: now,
  }).run();
  await registerProject(client, { projectId, ownerUserId: userId, now });
  await recordProjectDatabaseMapping(client, { projectId, databaseId, now });
  const read = await db.select().from(projectDatabases).where(eq(projectDatabases.projectId, projectId)).get();
  if (!read || read.databaseId !== databaseId) fail("mapping", "mapping tidak terbaca");
  else console.log("PASS: mapping tercatat di project_databases (A.4/B.1) dan terbaca ulang");

  try {
    await recordProjectDatabaseMapping(client, { projectId, databaseId, now });
    fail("duplicate", "mapping duplikat harus ditolak");
  } catch (e) {
    if (e instanceof MappingAlreadyExistsError) console.log("PASS: mapping duplikat ditolak (satu Project = satu database)");
    else fail("duplicate", e);
  }

  await db.delete(projectDatabases).where(eq(projectDatabases.projectId, projectId)).run();
  await db.delete(projects).where(eq(projects.id, projectId)).run();
  await db.delete(users).where(eq(users.id, userId)).run();
  console.log("INFO: data uji dihapus (cleanup)");
} catch (e) {
  fail("exception", e);
} finally {
  await client.close();
}

if (failed) process.exit(1);
console.log("smoke global mapping selesai");