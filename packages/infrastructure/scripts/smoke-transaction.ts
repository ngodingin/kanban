import { createClient } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyProjectMigrations } from "../src/database/migrate.ts";
import { runInWriteTransaction } from "../src/database/transaction.ts";

const dir = mkdtempSync(join(tmpdir(), "kanban-tx-"));
const client = createClient({ url: `file:${join(dir, "project.db")}` });
let failed = false;
const fail = (label: string, e?: unknown): void => {
  failed = true;
  console.error(`FAIL ${label}${e ? `: ${String(e)}` : ""}`);
};
const now = "2026-08-18T00:00:00.000Z";

const count = async (sql: string, args: (string | number)[] = []): Promise<number> => {
  const r = await client.execute({ sql, args });
  return Number(r.rows[0]?.n ?? 0);
};

try {
  await applyProjectMigrations(client);
  await client.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES ('proj_1', 'P1', ?, ?, 1)",
    args: [now, now],
  });

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
  if ((await count("SELECT COUNT(*) n FROM milestones WHERE id='ms_1'")) !== 1) fail("commit", "mutation tidak tersimpan");
  else if ((await count("SELECT COUNT(*) n FROM activities WHERE id='act_1'")) !== 1) fail("commit", "activity tidak tersimpan");
  else console.log("PASS: commit menyimpan mutation + activity bersama");

  try {
    await runInWriteTransaction(client, async (tx) => {
      await tx.execute(
        "INSERT INTO milestones (id, title, created_at, updated_at, version) VALUES ('ms_2', 'M2', ?, ?, 1)",
        [now, now],
      );
      throw new Error("sengaja gagal");
    });
    fail("rollback", "harusnya throw");
  } catch {
    if ((await count("SELECT COUNT(*) n FROM milestones WHERE id='ms_2'")) !== 0) fail("rollback", "mutation tidak dibatalkan");
    else console.log("PASS: rollback membatalkan mutation saat fn throw");
  }

  try {
    await runInWriteTransaction(client, async (tx) => {
      await tx.execute(
        "INSERT INTO milestones (id, title, created_at, updated_at, version) VALUES ('ms_3', 'M3', ?, ?, 1)",
        [now, now],
      );
      await tx.execute(
        "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES ('act_2', 'gadget', 'ms_3', 1, 'u1', 'x', '{}', ?)",
        [now],
      );
    });
    fail("atomic", "activity invalid harus menggagalkan transaksi");
  } catch {
    if ((await count("SELECT COUNT(*) n FROM milestones WHERE id='ms_3'")) !== 0) fail("atomic", "mutation lolos walau activity gagal");
    else console.log("PASS: atomik — mutation dibatalkan saat activity gagal (INV #9 / A.6)");
  }
} catch (e) {
  fail("exception", e);
} finally {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
}

if (failed) process.exit(1);
console.log("smoke transaction selesai");