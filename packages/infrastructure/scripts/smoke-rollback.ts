import { createClient } from "@libsql/client";
import { applyGlobalMigrations } from "../src/database/migrate.ts";
import { deleteProjectRegistry, registerProject } from "../src/database/global-store.ts";
import { provisionProjectWithMapping, ProjectProvisioningError } from "../src/provisioning/provision.ts";
import {
  createDatabase,
  databaseExists,
  mintDatabaseToken,
  projectDatabaseName,
  deleteDatabase,
} from "../src/provisioning/turso.ts";

const token = process.env.TURSO_API_TOKEN;
const globalUrl = process.env.GLOBAL_DB_URL;
const globalToken = process.env.GLOBAL_DB_TOKEN;
if (!token || !globalUrl || !globalToken) {
  console.log("SKIP: kredensial Turso/Global tidak lengkap");
  process.exit(0);
}

const turso = {
  org: process.env.TURSO_ORG ?? "ngodingin-ai",
  group: process.env.TURSO_GROUP ?? "ngodingin-kanban",
  apiToken: token,
};
const now = new Date().toISOString();
const stamp = now.replace(/[^0-9]/g, "");
const globalClient = createClient({ url: globalUrl, authToken: globalToken });
let failed = false;
const fail = (label: string, e?: unknown): void => {
  failed = true;
  console.error(`FAIL ${label}${e ? `: ${String(e)}` : ""}`);
};

try {
  await applyGlobalMigrations(globalClient);
  const userId = "user_rollback_smoke";
  await globalClient.execute({
    sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)",
    args: [userId, `user-rollback-${stamp}@smoke.local`, "Smoke Rollback", now, now],
  });

  const projectA = `proj_rollback_a_${stamp}`;
  const dbNameA = projectDatabaseName(projectA);
  try {
    await provisionProjectWithMapping({
      turso: { ...turso, apiToken: "invalid-token" },
      globalClient,
      projectId: projectA,
      projectName: "Rollback A",
      ownerUserId: userId,
      creatorUserId: userId,
      now,
    });
    fail("A: provision dengan apiToken invalid harus gagal");
  } catch (e) {
    if (!(e instanceof ProjectProvisioningError)) fail("A: tipe error harus ProjectProvisioningError", e);
    else if (await databaseExists(turso, dbNameA)) fail("A: DB yatim masih ada");
    else console.log("PASS A: tidak ada DB yatim saat provisioning gagal di awal");
  }
  const registryA = await globalClient.execute("SELECT COUNT(*) AS n FROM projects WHERE id = ?", [projectA]);
  if (Number(registryA.rows[0]?.n) !== 0) fail("A: baris projects yatim masih ada");
  else console.log("PASS A: registry projects di-rollback saat provisioning gagal");

  const projectC = `proj_rollback_c_${stamp}`;
  const dbNameC = projectDatabaseName(projectC);
  const pre = await createDatabase(turso, dbNameC);
  await mintDatabaseToken(turso, dbNameC);
  try {
    await provisionProjectWithMapping({
      turso,
      globalClient,
      projectId: projectC,
      projectName: "Rollback C",
      ownerUserId: userId,
      creatorUserId: userId,
      now,
    });
    fail("C: provision dengan nama DB sudah ada harus gagal");
  } catch (e) {
    if (!(e instanceof ProjectProvisioningError)) fail("C: tipe error harus ProjectProvisioningError", e);
    else if (!(await databaseExists(turso, dbNameC))) fail("C: DB existing (name conflict, bukan hasil invocation ini) tidak boleh ikut terhapus");
    else console.log("PASS C: kompensasi hanya DB hasil invocation gagal — DB existing (name conflict) tidak disentuh");
  }
  const registryC = await globalClient.execute("SELECT COUNT(*) AS n FROM projects WHERE id = ?", [projectC]);
  if (Number(registryC.rows[0]?.n) !== 0) fail("C: baris projects yatim masih ada");
  else console.log("PASS C: registry projects di-rollback saat provisioning gagal di tengah");
  void pre;

  const projectB = `proj_rollback_b_${stamp}`;
  const dbNameB = projectDatabaseName(projectB);
  await registerProject(globalClient, { projectId: projectB, ownerUserId: userId, now });
  try {
    await provisionProjectWithMapping({
      turso,
      globalClient,
      projectId: projectB,
      projectName: "Rollback B",
      ownerUserId: userId,
      creatorUserId: userId,
      now,
    });
    fail("B: pencatatan mapping duplikat harus gagal");
  } catch (e) {
    if (!(e instanceof ProjectProvisioningError)) fail("B: tipe error harus ProjectProvisioningError", e);
    else {
      if (await databaseExists(turso, dbNameB)) fail("B: DB yatim masih ada setelah mapping gagal");
      else console.log("PASS B: DB dihapus saat pencatatan mapping gagal (tidak ada DB yatim)");
      const rows = await globalClient.execute("SELECT COUNT(*) AS n FROM projects WHERE id = ?", [projectB]);
      if (Number(rows.rows[0]?.n) !== 1) fail("B: baris projects eksisting tidak boleh terhapus");
      else console.log("PASS B: registry eksisting tidak tersentuh (rollback hanya scope operasi ini)");
      const maps = await globalClient.execute("SELECT COUNT(*) AS n FROM project_databases WHERE project_id = ?", [projectB]);
      if (Number(maps.rows[0]?.n) !== 0) fail("B: mapping yatim tidak boleh ada");
      else console.log("PASS B: tidak ada mapping yatim (registrasi+mapping atomik)");
    }
  }

  await deleteProjectRegistry(globalClient, projectB);
  await globalClient.execute("DELETE FROM users WHERE id = ?", [userId]);
  await deleteDatabase(turso, dbNameC).catch(() => undefined);
  console.log("INFO: data uji dihapus (cleanup)");
} catch (e) {
  fail("exception", e);
} finally {
  await globalClient.close();
}

if (failed) process.exit(1);
console.log("smoke rollback selesai");