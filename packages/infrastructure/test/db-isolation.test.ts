import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestProjectDb, type TestDb } from "./helpers/db";

const now = "2026-08-18T00:00:00.000Z";

describe("DB test terisolasi per suite (04-DEL B.5)", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestProjectDb();
  });

  beforeEach(async () => {
    await db.truncateAll();
  });

  it("suite memakai DB file terpisah dengan 10 tabel termigrasi", async () => {
    const rows = await db.client.execute("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE '__drizzle%'");
    expect(Number(rows.rows[0]?.n)).toBe(10);
  });

  it("rollback antar test: data test sebelumnya tidak terlihat (truncate per test)", async () => {
    await db.client.execute({
      sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES ('proj_a', 'A', ?, ?, 1)",
      args: [now, now],
    });
    const rows = await db.client.execute("SELECT COUNT(*) n FROM project_state");
    expect(Number(rows.rows[0]?.n)).toBe(1);
  });

  it("test lain dimulai bersih (tidak ada sisa proj_a)", async () => {
    const rows = await db.client.execute("SELECT COUNT(*) n FROM project_state");
    expect(Number(rows.rows[0]?.n)).toBe(0);
  });
});

describe("isolasi antar suite: DB berbeda, state tidak bocor", () => {
  it("suite kedua punya DB kosong sendiri", async () => {
    const db = await createTestProjectDb();
    const rows = await db.client.execute("SELECT COUNT(*) n FROM project_state");
    expect(Number(rows.rows[0]?.n)).toBe(0);
    await db.cleanup();
  });
});