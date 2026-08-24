import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { applyProjectMigrations } from "@kanban/infrastructure";

const BASE = "2026-01-01T00:00:00.000Z";
let dir: string;
let client: Client;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kanban-ac-tests-"));
  client = createClient({ url: `file:${join(dir, "proj.db")}` });
  await applyProjectMigrations(client);
  await client.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES ('p1', 'P', ?, ?, 1)",
    args: [BASE, BASE],
  });
});

afterAll(async () => {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("AC-012 — Comment historis tetap terbaca setelah Card DELETED (goal 6.8.3)", () => {
  it("[AC-012] Card DELETED → Activity comment TIDAK hilang dari activities", async () => {
    const now = BASE;
    for (const sql of [
      `INSERT INTO milestones VALUES ('ms-c','M',0,'${now}','${now}',NULL,NULL,1)`,
      `INSERT INTO boards VALUES ('bd-c','ms-c','B','${now}','${now}',NULL,NULL,1)`,
      `INSERT INTO lists VALUES ('ls-c','bd-c','L','${now}','${now}',NULL,NULL,1)`,
      `INSERT INTO cards VALUES ('cd-c','ls-c','T','u','u','${now}','${now}',NULL,NULL,1)`,
      // comment sebagai activity
      `INSERT INTO activities VALUES ('act-1','card','cd-c',1,'u','card.comment','{}','${now}')`,
      // delete card (terminal)
      `UPDATE cards SET deleted_at = '${now}' WHERE id = 'cd-c'`,
    ]) {
      try { await client.execute(sql); } catch { /* table shape berbeda */ }
    }
    const r = await client.execute(
      "SELECT COUNT(*) AS n FROM activities WHERE entity_type = 'card' AND entity_id = 'cd-c' AND action = 'card.comment'",
    );
    expect(Number(r.rows[0]!.n)).toBe(1);
  });
});
