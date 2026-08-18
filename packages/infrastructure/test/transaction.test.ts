import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyProjectMigrations } from "../src/database/migrate.ts";
import { runInWriteTransaction } from "../src/database/transaction.ts";

const dir = mkdtempSync(join(tmpdir(), "kanban-vitest-"));
const now = "2026-08-18T00:00:00.000Z";
let client: Client;

beforeAll(async () => {
  client = createClient({ url: `file:${join(dir, "project.db")}` });
  await applyProjectMigrations(client);
  await client.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES ('proj_1', 'P1', ?, ?, 1)",
    args: [now, now],
  });
});

afterAll(async () => {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("runInWriteTransaction (integration, local Project DB)", () => {
  it("commit menyimpan mutation + activity bersama (AC-020-friendly)", async () => {
    await runInWriteTransaction(client, async (tx) => {
      await tx.execute(
        "INSERT INTO milestones (id, title, created_at, updated_at, version) VALUES ('ms_1', 'M1', ?, ?, 1)",
        [now, now],
      );
      await tx.execute(
        "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES ('act_1', 'milestone', 'ms_1', 1, 'u1', 'milestone.created', '{}', ?)",
        [now],
      );
    });
    const rows = await client.execute("SELECT (SELECT COUNT(*) FROM milestones WHERE id='ms_1') m, (SELECT COUNT(*) FROM activities WHERE id='act_1') a");
    expect(Number(rows.rows[0]?.m)).toBe(1);
    expect(Number(rows.rows[0]?.a)).toBe(1);
  });

  it("rollback membatalkan mutation saat fn throw", async () => {
    await expect(
      runInWriteTransaction(client, async (tx) => {
        await tx.execute(
          "INSERT INTO milestones (id, title, created_at, updated_at, version) VALUES ('ms_2', 'M2', ?, ?, 1)",
          [now, now],
        );
        throw new Error("sengaja gagal");
      }),
    ).rejects.toThrow("sengaja gagal");
    const rows = await client.execute("SELECT COUNT(*) n FROM milestones WHERE id='ms_2'");
    expect(Number(rows.rows[0]?.n)).toBe(0);
  });

  it("mutation + activity atomik: activity invalid membatalkan mutation (INV #9)", async () => {
    await expect(
      runInWriteTransaction(client, async (tx) => {
        await tx.execute(
          "INSERT INTO milestones (id, title, created_at, updated_at, version) VALUES ('ms_3', 'M3', ?, ?, 1)",
          [now, now],
        );
        await tx.execute(
          "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES ('act_3', 'gadget', 'ms_3', 1, 'u1', 'x', '{}', ?)",
          [now],
        );
      }),
    ).rejects.toThrow();
    const rows = await client.execute("SELECT COUNT(*) n FROM milestones WHERE id='ms_3'");
    expect(Number(rows.rows[0]?.n)).toBe(0);
  });
});