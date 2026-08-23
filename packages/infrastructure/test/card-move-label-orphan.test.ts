import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DrizzleCardRepository } from "../src/database/card-repository.ts";
import { createTestProjectDb, type TestDb } from "./helpers/db.ts";

// Goal 3.7.2 [MODEL LEBIH KUAT WAJIB] — auto-orphan Board Label saat moveCard
// lintas-Board, atomik dengan move (invariant #5/#9). Test baru terpisah
// dari card-move.test.ts (goal 2.10.1 Phase 2 ✅) agar regresi Phase 2 tidak
// tersentuh — moveCard sendiri dimodifikasi, bukan diganti perilakunya.

const T0 = "2026-08-01T00:00:00.000Z";
const PROJECT = "proj_1";
const OWNER = "user_owner_1";

let db: TestDb;
let repo: DrizzleCardRepository;

async function seedChain(): Promise<void> {
  await db.client.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, ?, ?, ?, 1)",
    args: [PROJECT, "Alpha", T0, T0],
  });
  await db.client.execute({
    sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_1', 'M1', NULL, 0, ?, ?, 1)",
    args: [T0, T0],
  });
  // bd_1 dan bd_1b sama-sama di ms_1 (move lintas-Board VALID, BR-018).
  for (const [id] of [["bd_1"], ["bd_1b"]]) {
    await db.client.execute({
      sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES (?, 'ms_1', ?, NULL, ?, ?, 1)",
      args: [id, `B ${id}`, T0, T0],
    });
  }
  for (const [id, bd] of [["ls_src", "bd_1"], ["ls_dst_same", "bd_1"], ["ls_dst_other", "bd_1b"]]) {
    await db.client.execute({
      sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, 1)",
      args: [id, bd, `L ${id}`, T0, T0],
    });
  }
  await db.client.execute({
    sql: "INSERT INTO milestone_labels (id, milestone_id, name, created_at, updated_at, version) VALUES ('ml_1', 'ms_1', 'MsLabel', ?, ?, 1)",
    args: [T0, T0],
  });
  await db.client.execute({
    sql: "INSERT INTO board_labels (id, board_id, name, created_at, updated_at, version) VALUES ('bl_1', 'bd_1', 'BdLabel', ?, ?, 1)",
    args: [T0, T0],
  });
}

async function seedCard(id: string, listId: string): Promise<void> {
  await db.client.execute({
    sql: "INSERT INTO cards (id, list_id, creator_user_id, title, created_at, updated_at, version) VALUES (?, ?, ?, 'C', ?, ?, 3)",
    args: [id, listId, OWNER, T0, T0],
  });
}

async function attachLabels(cardId: string): Promise<void> {
  await db.client.execute({
    sql: "INSERT INTO card_milestone_labels (card_id, label_id, created_at, removed_at) VALUES (?, 'ml_1', ?, NULL)",
    args: [cardId, T0],
  });
  await db.client.execute({
    sql: "INSERT INTO card_board_labels (card_id, label_id, created_at, removed_at) VALUES (?, 'bl_1', ?, NULL)",
    args: [cardId, T0],
  });
}

beforeAll(async () => {
  db = await createTestProjectDb();
  repo = new DrizzleCardRepository(db.client, { assertAssigneeActiveMember: async () => {} });
});

afterEach(async () => {
  await db.truncateAll();
});

afterAll(async () => {
  await db.cleanup();
});

describe("moveCard auto-orphan Board Label (goal 3.7.2)", () => {
  it("[WAJIB] move lintas-Board → Board Label ter-orphan (removed_at terisi) + Activity label.removed, dalam transaksi/Activity list yang sama dengan card.moved", async () => {
    await seedChain();
    await seedCard("c_1", "ls_src");
    await attachLabels("c_1");

    const moved = await repo.moveCard(PROJECT, {
      cardId: "c_1",
      destinationListId: "ls_dst_other",
      expectedVersion: 3,
      actorUserId: OWNER,
    });
    expect(moved.listId).toBe("ls_dst_other");
    expect(moved.version).toBe(4);

    const bdRow = await db.client.execute(
      "SELECT removed_at FROM card_board_labels WHERE card_id = 'c_1' AND label_id = 'bl_1'",
    );
    expect(bdRow.rows[0]!.removed_at).not.toBeNull();

    const activities = await db.client.execute(
      "SELECT action, entity_version, data FROM activities WHERE entity_id = 'c_1' ORDER BY created_at, action",
    );
    const actions = activities.rows.map((r) => String(r.action)).sort();
    expect(actions).toEqual(["card.moved", "label.removed"]);
    const labelRemoved = activities.rows.find((r) => r.action === "label.removed")!;
    expect(labelRemoved.entity_version).toBe(4);
    expect(JSON.parse(String(labelRemoved.data))).toEqual({
      label_id: "bl_1",
      label_scope: "board",
      label_name: "BdLabel",
    });
  });

  it("[Invariant #5/BR-018] Milestone Label pada Card yang sama TIDAK ter-orphan oleh move lintas-Board yang sama", async () => {
    await seedChain();
    await seedCard("c_2", "ls_src");
    await attachLabels("c_2");

    await repo.moveCard(PROJECT, {
      cardId: "c_2",
      destinationListId: "ls_dst_other",
      expectedVersion: 3,
      actorUserId: OWNER,
    });

    const msRow = await db.client.execute(
      "SELECT removed_at FROM card_milestone_labels WHERE card_id = 'c_2' AND label_id = 'ml_1'",
    );
    expect(msRow.rows[0]!.removed_at).toBeNull();

    const activities = await db.client.execute(
      "SELECT action FROM activities WHERE entity_id = 'c_2' AND action = 'label.removed'",
    );
    expect(activities.rows).toHaveLength(1); // hanya Board Label, bukan Milestone Label
  });

  it("[Guard presisi] move List→List DALAM Board yang sama TIDAK meng-orphan Board Label apa pun", async () => {
    await seedChain();
    await seedCard("c_3", "ls_src");
    await attachLabels("c_3");

    await repo.moveCard(PROJECT, {
      cardId: "c_3",
      destinationListId: "ls_dst_same",
      expectedVersion: 3,
      actorUserId: OWNER,
    });

    const bdRow = await db.client.execute(
      "SELECT removed_at FROM card_board_labels WHERE card_id = 'c_3' AND label_id = 'bl_1'",
    );
    expect(bdRow.rows[0]!.removed_at).toBeNull();

    const activities = await db.client.execute(
      "SELECT action FROM activities WHERE entity_id = 'c_3' AND action = 'label.removed'",
    );
    expect(activities.rows).toHaveLength(0);
  });

  it("[Tanpa Board Label] move lintas-Board pada Card tanpa Board Label apa pun → tidak error, tidak ada Activity label.removed", async () => {
    await seedChain();
    await seedCard("c_4", "ls_src");

    const moved = await repo.moveCard(PROJECT, {
      cardId: "c_4",
      destinationListId: "ls_dst_other",
      expectedVersion: 3,
      actorUserId: OWNER,
    });
    expect(moved.version).toBe(4);

    const activities = await db.client.execute(
      "SELECT action FROM activities WHERE entity_id = 'c_4' AND action = 'label.removed'",
    );
    expect(activities.rows).toHaveLength(0);
  });
});
