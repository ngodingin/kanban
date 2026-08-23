import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { loadEntityHierarchy } from "../src/database/entity-permissions.ts";
import { createTestProjectDb, type TestDb } from "./helpers/db.ts";

// TASK-4.3.1 (keputusan teknis) — loadEntityHierarchy jalan naik rantai
// entity yang dialamati route (card->list->board->milestone) untuk resolusi
// permission per-entity. Verifikasi independen: belum ada test langsung
// sebelumnya untuk walker 4-level ini, hanya teruji tidak langsung.

const T0 = "2026-08-01T00:00:00.000Z";

let db: TestDb;

async function seedChain(): Promise<void> {
  await db.client.execute({
    sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_1', 'M1', NULL, 0, ?, ?, 1)",
    args: [T0, T0],
  });
  await db.client.execute({
    sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('bd_1', 'ms_1', 'B1', NULL, ?, ?, 1)",
    args: [T0, T0],
  });
  await db.client.execute({
    sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('l_1', 'bd_1', 'L1', ?, ?, 1)",
    args: [T0, T0],
  });
  await db.client.execute({
    sql: "INSERT INTO cards (id, list_id, creator_user_id, title, created_at, updated_at, version) VALUES ('c_1', 'l_1', 'user-a', 'C1', ?, ?, 1)",
    args: [T0, T0],
  });
}

beforeAll(async () => {
  db = await createTestProjectDb();
});

afterEach(async () => {
  await db.truncateAll();
});

afterAll(async () => {
  await db.cleanup();
});

describe("loadEntityHierarchy — walk ancestor chain (goal 4.3.1)", () => {
  it("[card] mengembalikan seluruh 4 level (cardId+listId+boardId+milestoneId)", async () => {
    await seedChain();
    const h = await loadEntityHierarchy(db.client, "card", "c_1");
    expect(h).toEqual({ milestoneId: "ms_1", boardId: "bd_1", listId: "l_1", cardId: "c_1" });
  });

  it("[list] mengembalikan 3 level (listId+boardId+milestoneId), cardId undefined", async () => {
    await seedChain();
    const h = await loadEntityHierarchy(db.client, "list", "l_1");
    expect(h).toEqual({ milestoneId: "ms_1", boardId: "bd_1", listId: "l_1", cardId: undefined });
  });

  it("[board] mengembalikan 2 level (boardId+milestoneId), list/card undefined", async () => {
    await seedChain();
    const h = await loadEntityHierarchy(db.client, "board", "bd_1");
    expect(h).toEqual({ milestoneId: "ms_1", boardId: "bd_1", listId: undefined, cardId: undefined });
  });

  it("[milestone] mengembalikan cuma milestoneId, level lain undefined", async () => {
    await seedChain();
    const h = await loadEntityHierarchy(db.client, "milestone", "ms_1");
    expect(h).toEqual({ milestoneId: "ms_1", boardId: undefined, listId: undefined, cardId: undefined });
  });

  it("[tidak ada] entity tidak ditemukan di level manapun → null (bukan throw)", async () => {
    await seedChain();
    expect(await loadEntityHierarchy(db.client, "card", "c_missing")).toBeNull();
    expect(await loadEntityHierarchy(db.client, "list", "l_missing")).toBeNull();
    expect(await loadEntityHierarchy(db.client, "board", "bd_missing")).toBeNull();
    expect(await loadEntityHierarchy(db.client, "milestone", "ms_missing")).toBeNull();
  });
});
