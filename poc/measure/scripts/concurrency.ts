import { createClient } from "@libsql/client";
import { appendFileSync } from "node:fs";

const dbUrl = process.env.TURSO_DB_URL;
const dbToken = process.env.TURSO_DB_TOKEN;

if (!dbUrl || !dbToken) {
  throw new Error("TURSO_DB_URL/TURSO_DB_TOKEN wajib diisi (lihat .env).");
}

const CONCURRENCY = Number(process.env.POC_WORKERS ?? "20");
const MAX_RETRY = 50;

async function setup(client: ReturnType<typeof createClient>, table: string): Promise<void> {
  await client.execute(`CREATE TABLE IF NOT EXISTS ${table} (id INTEGER PRIMARY KEY, value INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 0)`);
  await client.execute(`DELETE FROM ${table}`);
  await client.execute(`INSERT INTO ${table} (id, value) VALUES (1, 0)`);
}

async function finalValue(client: ReturnType<typeof createClient>, table: string): Promise<number> {
  const res = await client.execute(`SELECT value FROM ${table} WHERE id = 1`);
  return Number(res.rows[0]?.value ?? -1);
}

function isBusy(e: unknown): boolean {
  return e instanceof Error && (e as { code?: string }).code === "SQLITE_BUSY";
}

async function runNaive(client: ReturnType<typeof createClient>, table: string): Promise<number> {
  await setup(client, table);
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    const row = await client.execute(`SELECT value FROM ${table} WHERE id = 1`);
    const current = Number(row.rows[0]?.value ?? 0);
    await client.execute(`UPDATE ${table} SET value = ${current + 1} WHERE id = 1`);
  });
  await Promise.all(workers);
  return finalValue(client, table);
}

async function runWriteMode(client: ReturnType<typeof createClient>, table: string): Promise<{ final: number; busyErrors: number }> {
  await setup(client, table);
  let busyErrors = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      const tx = await client.transaction("write");
      try {
        const row = await tx.execute(`SELECT value FROM ${table} WHERE id = 1`);
        const current = Number(row.rows[0]?.value ?? 0);
        await tx.execute(`UPDATE ${table} SET value = ${current + 1} WHERE id = 1`);
        await tx.commit();
        return;
      } catch (e) {
        await tx.rollback();
        if (isBusy(e)) {
          busyErrors++;
          continue;
        }
        throw e;
      }
    }
    throw new Error("retry limit exceeded");
  });
  await Promise.all(workers);
  return { final: await finalValue(client, table), busyErrors };
}

async function runOptimistic(client: ReturnType<typeof createClient>, table: string): Promise<{ final: number; conflicts: number }> {
  await setup(client, table);
  let conflicts = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      const row = await client.execute(`SELECT value, version FROM ${table} WHERE id = 1`);
      const current = Number(row.rows[0]?.value ?? 0);
      const version = Number(row.rows[0]?.version ?? 0);
      const res = await client.execute({
        sql: `UPDATE ${table} SET value = ?, version = ? WHERE id = 1 AND version = ?`,
        args: [current + 1, version + 1, version],
      });
      if (res.rowsAffected === 1) return;
      conflicts++;
    }
    throw new Error("retry limit exceeded");
  });
  await Promise.all(workers);
  return { final: await finalValue(client, table), conflicts };
}

const client = createClient({ url: dbUrl, authToken: dbToken });

const t0 = performance.now();
const naive = await runNaive(client, "poc_c_naive");
const naiveMs = performance.now() - t0;

const t1 = performance.now();
const writeMode = await runWriteMode(client, "poc_c_write");
const writeModeMs = performance.now() - t1;

const t2 = performance.now();
const optimistic = await runOptimistic(client, "poc_c_opt");
const optimisticMs = performance.now() - t2;

const result = {
  mode: "concurrency",
  workers: CONCURRENCY,
  naive: {
    finalValue: naive,
    expected: CONCURRENCY,
    lostUpdates: CONCURRENCY - naive,
    durationMs: Math.round(naiveMs * 100) / 100,
  },
  writeModeWithRetry: {
    finalValue: writeMode.final,
    expected: CONCURRENCY,
    lostUpdates: CONCURRENCY - writeMode.final,
    busyErrors: writeMode.busyErrors,
    durationMs: Math.round(writeModeMs * 100) / 100,
  },
  optimistic: {
    finalValue: optimistic.final,
    expected: CONCURRENCY,
    lostUpdates: CONCURRENCY - optimistic.final,
    conflicts: optimistic.conflicts,
    durationMs: Math.round(optimisticMs * 100) / 100,
  },
};

console.log(JSON.stringify(result, null, 2));
appendFileSync("/var/home/arin/Devenv/kanban/poc/results-concurrency.jsonl", JSON.stringify(result) + "\n");
await client.close();