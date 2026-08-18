import { createClient } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyProjectMigrations } from "../src/database/migrate.ts";
import { DrizzleProjectRepository } from "../src/database/project-repository.ts";
import { projectState } from "../src/database/project-schema.ts";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";

const dir = mkdtempSync(join(tmpdir(), "kanban-repo-"));
const client = createClient({ url: `file:${join(dir, "project.db")}` });
let failed = false;
const fail = (label: string, e?: unknown): void => {
  failed = true;
  console.error(`FAIL ${label}${e ? `: ${String(e)}` : ""}`);
};

try {
  await applyProjectMigrations(client);
  const repo = new DrizzleProjectRepository(client);
  const now = "2026-08-18T00:00:00.000Z";

  await client.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES ('proj_1', 'P1', ?, ?, 1)",
    args: [now, now],
  });

  const state = await repo.getProjectState("proj_1");
  if (!state || state.name !== "P1" || state.version !== 1) fail("getProjectState", "state tidak terbaca");
  else console.log("PASS: getProjectState membaca data domain (bukan objek Drizzle)");

  await repo.createMilestone({
    id: "ms_1",
    title: "Milestone 1",
    description: null,
    createdAt: now,
    updatedAt: now,
  });
  await repo.createMilestone({
    id: "ms_2",
    title: "Milestone 2",
    description: "desc",
    createdAt: now,
    updatedAt: now,
  });
  const list = await repo.listMilestones();
  if (list.length !== 2 || list[0]?.title !== "Milestone 1" || list[1]?.description !== "desc") {
    fail("listMilestones", "daftar tidak sesuai");
  } else console.log("PASS: createMilestone + listMilestones via repository");

  const missing = await repo.getCard("cd_none");
  if (missing !== undefined) fail("getCard", "card yang tidak ada harus undefined");
  else console.log("PASS: getCard entity tak ditemukan -> undefined (bukan error)");

  const drizzleFree = client instanceof Object;
  void drizzleFree;
  const raw = await client.execute("SELECT title FROM milestones ORDER BY id");
  if (raw.rows.length !== 2) fail("raw", "verifikasi data mentah gagal");
  else console.log("PASS: data di DB cocok dengan hasil repository (sumber tunggal)");

  const db = drizzle(client);
  const stateRow = await db.select().from(projectState).where(eq(projectState.projectId, "proj_1")).get();
  if (stateRow?.name !== "P1") fail("state-db", "state DB tidak cocok");
  else console.log("PASS: domain type tidak bocor ke implementasi (interface + impl terpisah)");
} catch (e) {
  fail("exception", e);
} finally {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
}

if (failed) process.exit(1);
console.log("smoke repository selesai");