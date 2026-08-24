import { createClient, type Client } from "@libsql/client";
import { createGlobalClient, parseGlobalDbEnv } from "../src/database/factory.ts";

// TASK-0.20.1 — helper LOKAL script ini saja (sebelumnya `createProjectClient`
// diekspor dari src/database/factory.ts/index.ts, padahal hanya dipakai di
// sini). Mewajibkan skema `libsql://` sengaja BERBEDA dari jalur produksi
// (`project-client.ts` pakai `https://` setelah resolusi hostname+token via
// Turso API) — smoke script ini menguji client construction MENTAH dari
// url+token yang sudah diberikan langsung, bukan alur resolusi produksi.
function createProjectClient(opts: { url: string; authToken: string }): Client {
  if (!opts.url.startsWith("libsql://")) {
    throw new Error("Project DB url wajib memakai skema libsql:// (remote Turso)");
  }
  if (opts.authToken.length === 0) {
    throw new Error("Project DB authToken wajib diisi (JWT per-DB)");
  }
  return createClient({ url: opts.url, authToken: opts.authToken });
}

const dbUrl = process.env.TURSO_DB_URL;
const dbToken = process.env.TURSO_DB_TOKEN;

function expectError(fn: () => unknown, label: string): void {
  try {
    fn();
    console.error(`FAIL ${label}: seharusnya throw`);
    process.exitCode = 1;
  } catch {
    console.log(`PASS ${label}: throw sesuai`);
  }
}

if (!dbUrl || !dbToken) {
  console.error("TURSO_DB_URL/TURSO_DB_TOKEN wajib diisi (lihat .env)");
  process.exit(1);
}

expectError(
  () => parseGlobalDbEnv({ GLOBAL_DB_URL: dbUrl! } as NodeJS.ProcessEnv),
  "negatif: GLOBAL_DB_TOKEN hilang -> throw",
);
expectError(
  () => createProjectClient({ url: "file:local.db", authToken: "x" }),
  "negatif: url non-libsql:// -> throw",
);
expectError(
  () => createProjectClient({ url: `libsql://${dbUrl!}`, authToken: "" }),
  "negatif: authToken kosong -> throw",
);

const globalClient = createGlobalClient({
  GLOBAL_DB_URL: dbUrl!,
  GLOBAL_DB_TOKEN: dbToken!,
} as NodeJS.ProcessEnv);
const g = await globalClient.execute("SELECT 1 AS one");
if (Number(g.rows[0]?.one) !== 1) throw new Error("global SELECT 1 gagal");
console.log("PASS positif: createGlobalClient -> SELECT 1 ok");
await globalClient.close();

const projectClient = createProjectClient({ url: dbUrl!, authToken: dbToken! });
const p = await projectClient.execute("SELECT 1 AS one");
if (Number(p.rows[0]?.one) !== 1) throw new Error("project SELECT 1 gagal");
console.log("PASS positif: createProjectClient -> SELECT 1 ok");
await projectClient.close();

console.log("smoke selesai");