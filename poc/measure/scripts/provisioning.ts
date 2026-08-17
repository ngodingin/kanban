import { createClient } from "@libsql/client";
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const apiToken = process.env.TURSO_API_TOKEN;

if (!apiToken) {
  throw new Error("TURSO_API_TOKEN wajib diisi (lihat .env).");
}

const API = "https://api.turso.tech/v1";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Turso API ${init?.method ?? "GET"} ${path} -> ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

type Database = {
  database: {
    uuid: string;
    Name: string;
    Hostname: string;
    group: string;
  };
};

type Organization = { name: string; slug: string };
type Group = { name: string; locations: string[] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const organizations = await api<Organization[]>("/organizations");
const org = organizations[0]?.slug;
if (!org) throw new Error("tidak ada organization di akun Turso");

const groups = await api<{ groups: Group[] }>(`/organizations/${org}/groups`);
if (groups.groups.length === 0) throw new Error("tidak ada group; buat group dulu (mis. lewat CLI)");
const group = groups.groups[0]!.name;
const region = groups.groups[0]!.locations[0] ?? "unknown";

const dbName = `poc-prov-${randomUUID().slice(0, 8)}`;

const t0 = performance.now();
const created = await api<Database>(`/organizations/${org}/databases`, {
  method: "POST",
  body: JSON.stringify({ name: dbName, group }),
});
const createMs = performance.now() - t0;

const t1 = performance.now();
const tokenRes = await api<{ jwt: string }>(`/databases/${dbName}/auth/tokens`, {
  method: "POST",
  body: JSON.stringify({ authorization: "full-access" }),
});
const tokenMs = performance.now() - t1;

const client = createClient({ url: `libsql://${created.database.Hostname}`, authToken: tokenRes.jwt });
let readyMs = -1;
for (let i = 0; i < 60; i++) {
  try {
    const res = await client.execute("SELECT 1 AS one");
    if (Number(res.rows[0]?.one) === 1) {
      readyMs = performance.now() - t0;
      break;
    }
  } catch {
    // DB belum siap — poll lagi
  }
  await sleep(250);
}

let firstQueryMs = -1;
if (readyMs >= 0) {
  const q0 = performance.now();
  const res = await client.execute("SELECT 1 AS one");
  firstQueryMs = performance.now() - q0;
  if (Number(res.rows[0]?.one) !== 1) throw new Error("first query hasil tidak sesuai");
}
await client.close();

await api(`/organizations/${org}/databases/${dbName}`, { method: "DELETE" });

const result = {
  mode: "provisioning",
  org,
  group,
  region,
  database: dbName,
  createMs: Math.round(createMs * 100) / 100,
  tokenMs: Math.round(tokenMs * 100) / 100,
  readyMs: Math.round(readyMs * 100) / 100,
  firstQueryMs: Math.round(firstQueryMs * 100) / 100,
  deleted: true,
};

console.log(JSON.stringify(result, null, 2));
appendFileSync("/var/home/arin/Devenv/kanban/poc/results-provisioning.jsonl", JSON.stringify(result) + "\n");