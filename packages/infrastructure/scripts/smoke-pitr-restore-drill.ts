import { createClient } from "@libsql/client";

// TASK-6.5.2 — restore drill NYATA (F.1 "Restore MUST diuji minimal sekali
// sebelum rilis"), dijalankan terhadap staging (group ngodingin-kanban-stag).
// Dua target: (1) Global DB staging langsung, (2) Project DB throwaway yang
// dibuat KHUSUS untuk drill ini (staging tidak punya Project DB nyata —
// belum ada Project dibuat lewat Phase 7 UI). Membuktikan Turso PITR
// restore-to-new-database benar-benar bekerja + data konsisten, BUKAN
// membangun mekanisme backup kustom (Prinsip #4 header PHASE-6-TASKS.md).
//
// Restore-to-new-database (BUKAN overwrite) — non-destruktif terhadap
// database sumber. Seluruh database yang dibuat drill ini (Project DB
// throwaway + kedua hasil restore) DIHAPUS di akhir skrip.

const org = process.env.TURSO_ORG!;
const token = process.env.TURSO_API_TOKEN!;
const group = process.env.TURSO_GROUP!; // ngodingin-kanban-stag
const globalDbName = "kanban-global-stag";

if (!org || !token || !group) {
  console.error("SKIP: TURSO_ORG/TURSO_API_TOKEN/TURSO_GROUP wajib diisi.");
  process.exit(1);
}

async function tursoApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.turso.tech/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Turso API ${res.status} ${path}: ${text}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function createDatabase(name: string, group: string): Promise<{ Hostname: string }> {
  const body = await tursoApi<{ database: { Hostname: string } }>(`/organizations/${org}/databases?group=${group}`, {
    method: "POST",
    body: JSON.stringify({ name, group }),
  });
  return body.database;
}

async function restoreDatabase(newName: string, sourceName: string, group: string, timestamp: string): Promise<{ Hostname: string }> {
  const body = await tursoApi<{ database: { Hostname: string } }>(`/organizations/${org}/databases?group=${group}`, {
    method: "POST",
    body: JSON.stringify({ name: newName, group, seed: { type: "database", name: sourceName, timestamp } }),
  });
  return body.database;
}

async function mintToken(name: string): Promise<string> {
  const body = await tursoApi<{ jwt: string }>(`/databases/${name}/auth/tokens`, { method: "POST", body: JSON.stringify({ expiration: "1h" }) });
  return body.jwt;
}

async function deleteDatabase(name: string): Promise<void> {
  await tursoApi(`/organizations/${org}/databases/${name}`, { method: "DELETE" });
}

async function waitForReady(name: string, maxWaitMs = 60_000): Promise<{ Hostname: string }> {
  const start = Date.now();
  for (;;) {
    try {
      const db = await tursoApi<{ database: { Hostname: string } }>(`/organizations/${org}/databases/${name}`);
      const authToken = await mintToken(name);
      const client = createClient({ url: `libsql://${db.database.Hostname}`, authToken });
      await client.execute("SELECT 1");
      await client.close();
      return db.database;
    } catch {
      if (Date.now() - start > maxWaitMs) throw new Error(`timeout menunggu ${name} siap`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

const createdDatabases: string[] = [];

async function cleanup(): Promise<void> {
  for (const name of createdDatabases) {
    try {
      await deleteDatabase(name);
      console.log(`CLEANUP: ${name} dihapus`);
    } catch (e) {
      console.error(`CLEANUP GAGAL untuk ${name}: ${String(e)}`);
    }
  }
}

try {
  const runId = Date.now();

  // ============ TARGET 1: Global DB staging ============
  console.log("=== [1/2] Restore drill: Global DB staging ===");
  const beforeCounts = await (async () => {
    const authToken = await mintToken(globalDbName);
    const hostRes = await tursoApi<{ database: { Hostname: string } }>(`/organizations/${org}/databases/${globalDbName}`);
    const client = createClient({ url: `libsql://${hostRes.database.Hostname}`, authToken });
    const r = await client.execute("SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM projects) AS projects");
    await client.close();
    return r.rows[0] as unknown as { users: number; projects: number };
  })();
  console.log("Global DB source counts:", beforeCounts);

  const restoreTimestamp = new Date(Date.now() - 30_000).toISOString().replace(/\.\d+Z$/, "Z");
  console.log("Restore point-in-time:", restoreTimestamp);

  const globalRestoreName = `kanban-global-stag-drill-${runId}`;
  console.log(`Membuat ${globalRestoreName} sebagai seed dari ${globalDbName}@${restoreTimestamp}...`);
  await restoreDatabase(globalRestoreName, globalDbName, group, restoreTimestamp);
  createdDatabases.push(globalRestoreName);
  const globalRestored = await waitForReady(globalRestoreName);
  console.log(`${globalRestoreName} siap @ ${globalRestored.Hostname}`);

  const restoredToken = await mintToken(globalRestoreName);
  const restoredClient = createClient({ url: `libsql://${globalRestored.Hostname}`, authToken: restoredToken });
  const afterCounts = (
    await restoredClient.execute("SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM projects) AS projects")
  ).rows[0] as unknown as { users: number; projects: number };
  await restoredClient.close();
  console.log("Global DB restored counts:", afterCounts);
  const globalMatch = Number(afterCounts.users) === Number(beforeCounts.users) && Number(afterCounts.projects) === Number(beforeCounts.projects);
  console.log(globalMatch ? "PASS: Global DB restore -> row count cocok" : "FAIL: Global DB restore -> row count TIDAK cocok");

  // ============ TARGET 2: Project DB throwaway (staging belum punya Project DB nyata) ============
  console.log("\n=== [2/2] Restore drill: Project DB (throwaway, seed data manual) ===");
  const projectDbName = `kanban-drill-project-${runId}`;
  console.log(`Membuat Project DB throwaway ${projectDbName}...`);
  await createDatabase(projectDbName, group);
  createdDatabases.push(projectDbName);
  const projectDb = await waitForReady(projectDbName);
  const projectToken = await mintToken(projectDbName);
  const projectClient = createClient({ url: `libsql://${projectDb.Hostname}`, authToken: projectToken });
  await projectClient.execute("CREATE TABLE drill_probe (id TEXT PRIMARY KEY, label TEXT)");
  await projectClient.execute({ sql: "INSERT INTO drill_probe (id, label) VALUES (?, ?)", args: ["p1", "restore-drill-marker"] });
  const sourceRows = (await projectClient.execute("SELECT COUNT(*) AS n FROM drill_probe")).rows[0] as unknown as { n: number };
  await projectClient.close();
  console.log("Project DB source row count:", sourceRows.n);

  await new Promise((r) => setTimeout(r, 5000)); // beri jeda agar commit ter-capture PITR
  const projectRestoreTimestamp = new Date(Date.now() - 2000).toISOString().replace(/\.\d+Z$/, "Z");
  const projectRestoreName = `kanban-drill-project-restored-${runId}`;
  console.log(`Membuat ${projectRestoreName} sebagai seed dari ${projectDbName}@${projectRestoreTimestamp}...`);
  await restoreDatabase(projectRestoreName, projectDbName, group, projectRestoreTimestamp);
  createdDatabases.push(projectRestoreName);
  const projectRestored = await waitForReady(projectRestoreName);
  console.log(`${projectRestoreName} siap @ ${projectRestored.Hostname}`);

  const projectRestoredToken = await mintToken(projectRestoreName);
  const projectRestoredClient = createClient({ url: `libsql://${projectRestored.Hostname}`, authToken: projectRestoredToken });
  const restoredRows = (await projectRestoredClient.execute("SELECT id, label FROM drill_probe")).rows;
  await projectRestoredClient.close();
  console.log("Project DB restored rows:", JSON.stringify(restoredRows));
  const projectMatch = restoredRows.length === 1 && restoredRows[0]!.id === "p1" && restoredRows[0]!.label === "restore-drill-marker";
  console.log(projectMatch ? "PASS: Project DB restore -> sample row cocok persis" : "FAIL: Project DB restore -> sample row TIDAK cocok");

  console.log("\n=== HASIL AKHIR ===");
  console.log("Global DB restore:", globalMatch ? "PASS" : "FAIL");
  console.log("Project DB restore:", projectMatch ? "PASS" : "FAIL");
  if (!globalMatch || !projectMatch) process.exitCode = 1;
} finally {
  await cleanup();
}
