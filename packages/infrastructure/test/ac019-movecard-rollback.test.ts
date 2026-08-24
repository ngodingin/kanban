import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { applyProjectMigrations } from "@kanban/infrastructure";
import { DrizzleCardRepository } from "../src/database/card-repository.ts";

const BASE = "2026-01-01T00:00:00.000Z";

let dir: string;
let client: Client;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ac019-movecard-"));
  client = createClient({ url: `file:${join(dir, "proj.db")}` });
  await applyProjectMigrations(client);
  const seeds: Array<[sql: string, args: string[]]> = [
    ["INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES ('p1', 'P', ?, ?, 1)", [BASE, BASE]],
    // SATU Milestone — dua Board di dalamnya (BR-018: move lintas Board hanya dalam Milestone sama)
    ["INSERT INTO milestones (id, title, progress, created_at, updated_at, version) VALUES ('ms1', 'M', 0, ?, ?, 1)", [BASE, BASE]],
    ["INSERT INTO boards (id, milestone_id, title, created_at, updated_at, version) VALUES ('bd-src', 'ms1', 'BS', ?, ?, 1)", [BASE, BASE]],
    ["INSERT INTO boards (id, milestone_id, title, created_at, updated_at, version) VALUES ('bd-dst', 'ms1', 'BD', ?, ?, 1)", [BASE, BASE]],
    ["INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('ls-src', 'bd-src', 'LS', ?, ?, 1)", [BASE, BASE]],
    ["INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('ls-dst', 'bd-dst', 'LD', ?, ?, 1)", [BASE, BASE]],
    ["INSERT INTO cards (id, list_id, creator_user_id, title, created_at, updated_at, version) VALUES ('cd-mv', 'ls-src', 'u', 'T', ?, ?, 1)", [BASE, BASE]],
    // Dua Board Label aktif menempel pada Card (target orphan saat move lintas Board)
    ["INSERT INTO board_labels (id, board_id, name, created_at, updated_at) VALUES ('bl-a', 'bd-src', 'A', ?, ?)", [BASE, BASE]],
    ["INSERT INTO board_labels (id, board_id, name, created_at, updated_at) VALUES ('bl-b', 'bd-src', 'B', ?, ?)", [BASE, BASE]],
    ["INSERT INTO card_board_labels (card_id, label_id, created_at) VALUES ('cd-mv', 'bl-a', ?)", [BASE]],
    ["INSERT INTO card_board_labels (card_id, label_id, created_at) VALUES ('cd-mv', 'bl-b', ?)", [BASE]],
    // Milestone Label + association — move sah TIDAK boleh menyentuhnya (invariant #5 / BR-018)
    ["INSERT INTO milestone_labels (id, milestone_id, name, created_at, updated_at) VALUES ('ml-1', 'ms1', 'ML', ?, ?)", [BASE, BASE]],
    ["INSERT INTO card_milestone_labels (card_id, label_id, created_at) VALUES ('cd-mv', 'ml-1', ?)", [BASE]],
  ];
  for (const [sql, args] of seeds) {
    await client.execute({ sql, args });
  }
});

afterAll(async () => {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Client proxy yang menyuntikkan kegagalan mid-transaksi pada statement yang dicocokkan. */
const failingClientOn = (failWhen: (sql: string) => boolean): Client =>
  ({
    transaction: async () => {
      const tx = await client.transaction("write");
      return {
        execute: async (stmt: { sql: string }) => {
          if (failWhen(stmt.sql)) throw new Error("injected mid-transaction failure");
          return tx.execute(stmt);
        },
        commit: () => tx.commit(),
        rollback: () => tx.rollback(),
        close: () => tx.close(),
      };
    },
    execute: client.execute.bind(client),
    batch: client.batch.bind(client),
    closed: false,
    close: () => client.close(),
  }) as unknown as Client;

const moveViaFailingRepo = (c: Client): Promise<never> => {
  const repo = new DrizzleCardRepository(c, { assertAssigneeActiveMember: async () => undefined });
  return repo.moveCard("p1", {
    cardId: "cd-mv",
    destinationListId: "ls-dst",
    expectedVersion: 1,
    actorUserId: "u",
  }) as Promise<never>;
};

/** Rollback penuh AC-019: listId & version kembali, NOL Activity baru, board-label tetap aktif, milestone-label utuh. */
async function assertFullyRolledBack(): Promise<void> {
  const card = await client.execute("SELECT list_id, version FROM cards WHERE id = 'cd-mv'");
  expect(card.rows[0]!.list_id).toBe("ls-src");
  expect(Number(card.rows[0]!.version)).toBe(1);

  const acts = await client.execute(
    "SELECT action, COUNT(*) AS n FROM activities WHERE entity_type = 'card' AND entity_id = 'cd-mv' GROUP BY action",
  );
  expect(acts.rows).toHaveLength(0);

  const cbl = await client.execute(
    "SELECT label_id, removed_at FROM card_board_labels WHERE card_id = 'cd-mv' ORDER BY label_id",
  );
  expect(cbl.rows.map((r) => String(r.label_id))).toEqual(["bl-a", "bl-b"]);
  expect(cbl.rows.every((r) => r.removed_at === null)).toBe(true);

  const cml = await client.execute(
    "SELECT COUNT(*) AS n FROM card_milestone_labels WHERE card_id = 'cd-mv' AND removed_at IS NULL",
  );
  expect(Number(cml.rows[0]!.n)).toBe(1);
}

describe("AC-019 — failure-injection moveCard: rollback penuh listId/version/label/Activity (goal 6.8.4)", () => {
  it("[AC-019] injeksi gagal pada append Activity 'card.moved' → seluruh transaksi rollback", async () => {
    await expect(moveViaFailingRepo(failingClientOn((sql) => sql.includes("'card.moved'")))).rejects.toThrow(
      "injected mid-transaction failure",
    );
    await assertFullyRolledBack();
  });

  it("[AC-019] injeksi gagal pada 'label.removed' SETELAH card_board_labels terlanjur diubah → partial progress ikut rollback", async () => {
    // Urutan di dalam transaksi: UPDATE cards → INSERT card.moved → soft-remove
    // bl-a → INSERT 'label.removed' (GAGAL di sini). Rollback MUST memulihkan
    // update label yang sudah dieksekusi — inilah inti "label association ikut
    // berubah ... MUST rollback bersama" pada goal.
    await expect(moveViaFailingRepo(failingClientOn((sql) => sql.includes("'label.removed'")))).rejects.toThrow(
      "injected mid-transaction failure",
    );
    await assertFullyRolledBack();
  });
});
