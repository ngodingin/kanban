import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { applyProjectMigrations, pruneDescendantSubtrees } from "../src/index.ts";

const NOW = new Date("2026-08-23T00:00:00.000Z");
const daysAgoIso = (days: number): string =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

let dir: string;

/** DB Project segar per skenario — isolasi antar-test struktural. */
async function makeProjectDb(): Promise<Client> {
  const client = createClient({ url: `file:${join(dir, `proj-${Math.random().toString(36).slice(2)}.db`)}` });
  await applyProjectMigrations(client);
  await client.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES ('p1', 'P', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 1)",
  });
  return client;
}

async function seedChain(client: Client, prefix: string, milestoneDeletedAt: string | null, cardDeletedAt: string | null = null): Promise<void> {
  const base = "2026-01-01T00:00:00.000Z";
  await client.execute({
    sql: "INSERT INTO milestones (id, title, progress, created_at, updated_at, deleted_at) VALUES (?, ?, 0, ?, ?, ?)",
    args: [`${prefix}-ms`, "M", base, base, milestoneDeletedAt],
  });
  await client.execute({
    sql: "INSERT INTO boards (id, milestone_id, title, created_at, updated_at, version) VALUES (?, ?, 'B', ?, ?, 1)",
    args: [`${prefix}-bd`, `${prefix}-ms`, base, base],
  });
  await client.execute({
    sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES (?, ?, 'L', ?, ?, 1)",
    args: [`${prefix}-ls`, `${prefix}-bd`, base, base],
  });
  await client.execute({
    sql: "INSERT INTO cards (id, list_id, title, creator_user_id, created_at, updated_at, deleted_at) VALUES (?, ?, 'C', 'u1', ?, ?, ?)",
    args: [`${prefix}-cd`, `${prefix}-ls`, base, base, cardDeletedAt],
  });
  await client.execute({
    sql: "INSERT INTO milestone_labels (id, milestone_id, name, created_at, updated_at, version) VALUES (?, ?, 'ML', ?, ?, 1)",
    args: [`${prefix}-ml`, `${prefix}-ms`, base, base],
  });
  await client.execute({
    sql: "INSERT INTO card_milestone_labels (card_id, label_id, created_at) VALUES (?, ?, ?)",
    args: [`${prefix}-cd`, `${prefix}-ml`, base],
  });
  for (const [type, eid] of [
    ["milestone", `${prefix}-ms`],
    ["card", `${prefix}-cd`],
    ["milestone_label", `${prefix}-ml`],
  ] as const) {
    await client.execute({
      sql: "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, ?, ?, 1, 'u1', 'x.y', '{}', ?)",
      args: [`act-${type}-${prefix}`, type, eid, base],
    });
  }
}

const count = async (client: Client, sql: string, args: string[] = []): Promise<number> =>
  Number((await client.execute({ sql, args })).rows[0]!.n);

/** Proxy yang menyuntik kegagalan DI DALAM transaksi (bukan autocommit). */
function clientFailingOn(base: Client, needle: string): Client {
  const wrapper = {
    async transaction() {
      const tx = await base.transaction("write");
      return {
        async execute(stmt: Parameters<typeof tx.execute>[0]) {
          const sql = typeof stmt === "string" ? stmt : stmt.sql;
          if (sql.includes(needle)) throw new Error(`injected failure on ${needle}`);
          return tx.execute(stmt);
        },
        commit: () => tx.commit(),
        rollback: () => tx.rollback(),
        close: () => tx.close(),
      };
    },
    execute: base.execute.bind(base),
    batch: base.batch.bind(base),
    closed: false,
    close: () => base.close(),
  };
  return wrapper as unknown as Client;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "kanban-prune-desc-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("pruneDescendantSubtrees — goal 5.2.1", () => {
  it("[BR-016][subtree cascade] Milestone DELETED 31 hari → seluruh subtree fisik terhapus walau descendant ACTIVE", async () => {
    const client = await makeProjectDb();
    await seedChain(client, "old", daysAgoIso(31));
    const result = await pruneDescendantSubtrees(client, NOW);
    expect(result.milestones).toBe(1);
    expect(result.boards).toBe(1);
    expect(result.lists).toBe(1);
    expect(result.cards).toBe(1);
    expect(result.labels).toBe(1);
    for (const table of ["milestones", "boards", "lists", "cards", "milestone_labels", "card_milestone_labels"]) {
      expect(await count(client, `SELECT COUNT(*) AS n FROM ${table}`), table).toBe(0);
    }
    expect(await count(client, "SELECT COUNT(*) AS n FROM activities")).toBe(0);
    await client.close();
  });

  it("[negatif BR-016A] Milestone DELETED 29 hari → SAMA SEKALI tidak disentuh", async () => {
    const client = await makeProjectDb();
    await seedChain(client, "fresh", daysAgoIso(29));
    const result = await pruneDescendantSubtrees(client, NOW);
    expect(result.milestones).toBe(0);
    expect(await count(client, "SELECT COUNT(*) AS n FROM milestones WHERE id = 'fresh-ms'")).toBe(1);
    expect(await count(client, "SELECT COUNT(*) AS n FROM cards WHERE id = 'fresh-cd'")).toBe(1);
    expect(await count(client, "SELECT COUNT(*) AS n FROM activities WHERE entity_id = 'fresh-ms'")).toBe(1);
    await client.close();
  });

  it("[Prinsip #4] Card DELETED independen (induk ACTIVE) 31 hari → Card+junction+Activity hilang, induk utuh", async () => {
    const client = await makeProjectDb();
    await seedChain(client, "indep", null, daysAgoIso(31));
    const result = await pruneDescendantSubtrees(client, NOW);
    expect(result.cards).toBe(1);
    expect(result.labels).toBe(0); // definisi Label milik Milestone & dipakai bersama — hanya JUNCTION yang ikut
    expect(await count(client, "SELECT COUNT(*) AS n FROM card_milestone_labels WHERE card_id = 'indep-cd'")).toBe(0);
    expect(await count(client, "SELECT COUNT(*) AS n FROM milestone_labels WHERE id = 'indep-ml'")).toBe(1);
    expect(await count(client, "SELECT COUNT(*) AS n FROM cards WHERE id = 'indep-cd'")).toBe(0);
    expect(await count(client, "SELECT COUNT(*) AS n FROM milestones WHERE id = 'indep-ms'")).toBe(1);
    expect(await count(client, "SELECT COUNT(*) AS n FROM lists WHERE id = 'indep-ls'")).toBe(1);
    expect(await count(client, "SELECT COUNT(*) AS n FROM activities WHERE entity_id = 'indep-cd'")).toBe(0);
    expect(await count(client, "SELECT COUNT(*) AS n FROM activities WHERE entity_id = 'indep-ms'")).toBe(1);
    await client.close();
  });

  it("[rollback] kegagalan di tengah transaksi → TIDAK ada partial-prune; retry sukses", async () => {
    const client = await makeProjectDb();
    await seedChain(client, "rb", daysAgoIso(40));
    const failing = clientFailingOn(client, "DELETE FROM lists");
    await expect(pruneDescendantSubtrees(failing, NOW)).rejects.toThrow("injected failure");
    // Seluruh subtree masih utuh — rollback penuh
    for (const [table, id] of [
      ["milestones", "rb-ms"],
      ["boards", "rb-bd"],
      ["lists", "rb-ls"],
      ["cards", "rb-cd"],
      ["milestone_labels", "rb-ml"],
      ["activities", "act-milestone-rb"],
    ] as const) {
      expect(await count(client, `SELECT COUNT(*) AS n FROM ${table} WHERE id = ?`, [id]), table).toBe(1);
    }
    const retry = await pruneDescendantSubtrees(client, NOW); // Prinsip #7 — tetap eligible
    expect(retry.milestones).toBe(1);
    expect(await count(client, "SELECT COUNT(*) AS n FROM milestones WHERE id = 'rb-ms'")).toBe(0);
    await client.close();
  });

  it("[kosong] tanpa entity eligible → hasil nol", async () => {
    const client = await makeProjectDb();
    const result = await pruneDescendantSubtrees(client, NOW);
    expect(result).toEqual({ milestones: 0, boards: 0, lists: 0, cards: 0, labels: 0 });
    await client.close();
  });
});
