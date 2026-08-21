import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { isValid as isValidUlid } from "ulid";
import { provisionProjectDatabase, ProjectProvisioningError } from "../src/provisioning/provision.ts";
import { activities, projectState } from "../src/database/project-schema.ts";
import { deleteDatabase, projectDatabaseName } from "../src/provisioning/turso.ts";

const token = process.env.TURSO_API_TOKEN;
const group = process.env.TURSO_GROUP;
if (!token || !group) {
  console.log("SKIP: TURSO_API_TOKEN/TURSO_GROUP tidak ada (live integration butuh kredensial; TURSO_GROUP wajib eksplisit per environment, tidak ada default)");
  process.exit(0);
}

const turso = {
  org: process.env.TURSO_ORG ?? "ngodingin-ai",
  group,
  apiToken: token,
};

const now = new Date().toISOString();
const projectId = `proj_smoke_${now.replace(/[^0-9]/g, "")}`;
const dbName = projectDatabaseName(projectId);
let client: Awaited<ReturnType<typeof createClient>> | undefined;
let failed = false;
const fail = (label: string, e: unknown): void => {
  failed = true;
  console.error(`FAIL ${label}: ${String(e)}`);
};

try {
  const result = await provisionProjectDatabase({
    turso,
    projectId,
    projectName: "Smoke Provisioning",
    creatorUserId: "user_smoke",
    now,
  });
  client = createClient({ url: result.url, authToken: result.authToken });
  console.log(`INFO: Project DB dibuat ${result.databaseName} @ ${result.hostname}`);

  const states = await client.execute(
    "SELECT project_id, name, version, archived_at, deleted_at FROM project_state WHERE project_id = ?",
    [projectId],
  );
  if (states.rows.length !== 1) fail("state", "project_state harus tepat satu");
  else {
    const s = states.rows[0] as unknown as { version: number; archived_at: null; deleted_at: null; name: string };
    if (s.version !== 1 || s.archived_at !== null || s.deleted_at !== null || s.name !== "Smoke Provisioning") {
      fail("state", "project_state bukan ACTIVE version=1 dengan nama benar");
    } else console.log("PASS: project_state tepat satu, ACTIVE (version=1, archived_at/deleted_at NULL)");
  }

  const acts = await client.execute(
    "SELECT id, entity_type, entity_id, entity_version, actor_user_id, action, data FROM activities WHERE entity_type='project' AND entity_id = ?",
    [projectId],
  );
  if (acts.rows.length !== 1) fail("activity", "Activity project.created harus tepat satu");
  else {
    const a = acts.rows[0] as unknown as { id: string; action: string; entity_version: number; data: string };
    const data = JSON.parse(a.data) as { snapshot?: { name?: string } };
    if (a.action !== "project.created" || a.entity_version !== 1 || data.snapshot?.name !== "Smoke Provisioning") {
      fail("activity", "payload project.created tidak sesuai B.5 (snapshot.name)");
    } else console.log("PASS: Activity project.created tunggal, entity_version=1, data B.5 snapshot.name");
    if (!isValidUlid(a.id)) fail("activity", `id activity bukan ULID (A.13): ${a.id}`);
    else console.log("PASS: Activity project.created id memakai ULID (A.13)");
  }

  const db = drizzle(client);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(projectState).values({
        projectId,
        name: "Dup",
        createdAt: now,
        updatedAt: now,
        version: 1,
      }).run();
      await tx.insert(activities).values({
        id: "act_dup",
        entityType: "project",
        entityId: projectId,
        entityVersion: 1,
        actorUserId: "user_smoke",
        action: "project.created",
        data: {},
        createdAt: now,
      }).run();
    });
    fail("atomic", "transaksi seed duplikat harus gagal (project_state PK)");
  } catch {
    const after = await client.execute("SELECT COUNT(*) AS n FROM activities WHERE entity_type='project' AND entity_id = ?", [
      projectId,
    ]);
    if (Number(after.rows[0]?.n) !== 1) fail("atomic", "tx gagal meninggalkan sisa (orphan activity)");
    else console.log("PASS: seed atomik — tx gagal tidak meninggalkan activity yatim (F.2)");
  }
} catch (e) {
  fail("provision", e);
  if (!(e instanceof ProjectProvisioningError)) fail("provision", "harus ProjectProvisioningError");
} finally {
  await client?.close();
  if (dbName) {
    await deleteDatabase(turso, dbName).catch((e) => console.warn(`WARN: cleanup ${dbName}: ${String(e)}`));
    console.log(`INFO: DB uji ${dbName} dihapus (cleanup)`);
  }
}

if (failed) process.exit(1);
console.log("smoke provision selesai");