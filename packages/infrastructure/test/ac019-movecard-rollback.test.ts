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
  dir = mkdtempSync(join(tmpdir(), "ac019-movecard-"));
  client = createClient({ url: `file:${join(dir, "proj.db")}` });
  const mod = await import("@kanban/infrastructure");
  await mod.applyProjectMigrations(client);
  await client.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES ('p1', 'P', ?, ?, 1)",
    args: [BASE, BASE],
  });
  // Dua list untuk move
  for (const lid of ["ls-src", "ls-dst"]) {
    await client.execute({
      sql: `INSERT INTO milestones (id, title, progress, created_at, updated_at, version) VALUES ('ms-${lid}', 'M', 0, ?, ?, 1)`,
      args: [BASE, BASE],
    });
    await client.execute({
      sql: `INSERT INTO boards (id, milestone_id, title, created_at, updated_at, version) VALUES ('bd-${lid}', 'ms-${lid}', 'B', ?, ?, 1)`,
      args: [BASE, BASE],
    });
    await client.execute({
      sql: `INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES (?, 'bd-${lid}', 'L', ?, ?, 1)`,
      args: [lid, BASE, BASE],
    });
  }
  // Card di source
  await client.execute({
    sql: "INSERT INTO cards (id, list_id, title, creator_user_id, created_at, updated_at, version) VALUES ('cd-mv', 'ls-src', 'T', 'u', ?, ?, 1)",
    args: [BASE, BASE],
  });
  // Label milestone + association
  await client.execute({
    sql: "INSERT INTO milestones_labels (id, milestone_id, name, created_at, updated_at, version) VALUES ('ml-1', 'ms-src', 'ML', ?, ?, 1)",
    args: [BASE, BASE],
  }).catch(() => undefined);
});

afterAll(async () => {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("AC-019 — failure-injection moveCard rollback (goal 6.8.4)", () => {
  it("[AC-019] Activity insert gagal → seluruh transaksi rollback (listId/version/labels tidak berubah)", async () => {
    // Proxy yang gagal pada INSERT activities
    const failing = {
      transaction: async () => {
        const tx = await client.transaction("write");
        return {
          execute: async (stmt: unknown) => {
            const sql = typeof stmt === "string" ? stmt : String((stmt as { sql: string }).sql);
            if (sql.includes("INSERT INTO activities")) throw new Error("injected activity failure");
            return tx.execute(stmt as never);
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
    } as never as Client;

    const mod = await import("@kanban/infrastructure");
    void mod;
    const { DrizzleCardRepository } = await import("../src/database/card-repository.ts");
    const repo = new DrizzleCardRepository(failing, { assertAssigneeActiveMember: async () => undefined });

    await expect(
      repo.moveCard("p1", {
        cardId: "cd-mv",
        toListId: "ls-dst",
        expectedVersion: 1,
        actorUserId: "u",
      }),
    ).rejects.toThrow();

    // Rollback penuh: listId & version TIDAK berubah
    const row = await client.execute({ sql: "SELECT list_id, version FROM cards WHERE id = 'cd-mv'" });
    expect(row.rows[0]!.list_id).toBe("ls-src");
    expect(Number(row.rows[0]!.version)).toBe(1);

    // Tidak ada Activity move
    const acts = await client.execute(
      { sql: "SELECT COUNT(*) AS n FROM activities WHERE entity_type = 'card' AND action LIKE '%moved%'" },
    );
    expect(Number(acts.rows[0]!.n)).toBe(0);
  });
});
