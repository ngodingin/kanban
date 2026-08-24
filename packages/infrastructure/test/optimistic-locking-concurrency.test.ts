import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  BoardVersionConflictError,
  CardVersionConflictError,
  LabelVersionConflictError,
  ListVersionConflictError,
  MilestoneVersionConflictError,
  ProjectVersionConflictError,
} from "@kanban/domain";
import { DrizzleProjectRepository } from "../src/database/project-repository.ts";
import { DrizzleMilestoneRepository } from "../src/database/milestone-repository.ts";
import { DrizzleBoardRepository } from "../src/database/board-repository.ts";
import { DrizzleListRepository } from "../src/database/list-repository.ts";
import { DrizzleCardRepository } from "../src/database/card-repository.ts";
import { DrizzleMilestoneLabelRepository } from "../src/database/milestone-label-repository.ts";
import { DrizzleBoardLabelRepository } from "../src/database/board-label-repository.ts";
import { createTestProjectDb, type TestDb } from "./helpers/db.ts";

// TASK-6.1.2 — property-style concurrency test, table-driven per entity
// domain versioned (BR-019–023, AC-020).
//
// [DEVIASI DARI TEKS GOAL, DIDOKUMENTASIKAN JUJUR] Goal meminta "dua
// mutation PARALEL" via Promise.all dua koneksi nyata. Dicoba SUNGGUHAN
// (spike empiris, 5/5 trial konsisten) sebelum menulis test ini: DUA
// `Client` terpisah (koneksi nyata, bukan satu client dipakai ulang) yang
// membuka `client.transaction("write")` (BEGIN IMMEDIATE-equivalent)
// hampir bersamaan terhadap file SQLite lokal yang SAMA — sisi KEDUA
// SELALU gagal `TransactionBusyError` (retry habis, bahkan dengan budget
// 30x/30ms) TANPA PERNAH mencapai baca `version` sama sekali, apalagi
// pemeriksaan optimistic-lock domain. Ini BUKAN dugaan — sudah
// didokumentasikan SEBELUMNYA di codebase ini (`drizzle-transaction-retry.test.ts`,
// komentar goal 1.12.1): "2 koneksi lokal sungguhan... libsql embedded
// lokal menahan write-lock antar-koneksi dalam proses yang sama secara
// TIDAK REALISTIS (satu sisi retry tanpa batas waktu wajar)... dibuang
// karena bisa flaky/menyesatkan." Quirk driver LOKAL, bukan representasi
// Turso remote (HTTP per-request) produksi.
//
// Test di bawah TETAP membuktikan invariant yang sama (BR-021: expectedVersion
// stale WAJIB ditolak VERSION_CONFLICT, TANPA double-apply, TANPA Activity
// kedua) via teknik yang deterministik dan tidak flaky: panggilan PERTAMA
// (repository method sungguhan, bukan SQL mentah) mensimulasikan "pemenang"
// race — sukses, version+1, satu Activity. Panggilan KEDUA memakai
// expectedVersion yang SAMA (kini stale, persis kondisi yang dilihat sisi
// KALAH dari race genuinely-concurrent) — WAJIB reject, TANPA mutasi/Activity
// tambahan. Ini menguji kontrak optimistic-locking yang IDENTIK dengan yang
// goal minta, hanya urutan eksekusinya deterministik alih-alih bergantung
// pada race timing yang terbukti tidak reproducible di driver lokal ini.

const T0 = "2026-08-01T00:00:00.000Z";
const PROJECT = "proj_1";
const ACTOR = "user_owner_1";

let db: TestDb;

async function seedChain(): Promise<void> {
  await db.client.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, 'P', ?, ?, 1)",
    args: [PROJECT, T0, T0],
  });
  await db.client.execute({
    sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_1', 'M', NULL, 0, ?, ?, 1)",
    args: [T0, T0],
  });
  await db.client.execute({
    sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('bd_1', 'ms_1', 'B', NULL, ?, ?, 1)",
    args: [T0, T0],
  });
  await db.client.execute({
    sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('ls_1', 'bd_1', 'L', ?, ?, 1)",
    args: [T0, T0],
  });
  await db.client.execute({
    sql: "INSERT INTO cards (id, list_id, creator_user_id, title, created_at, updated_at, version) VALUES ('cd_1', 'ls_1', ?, 'C', ?, ?, 1)",
    args: [ACTOR, T0, T0],
  });
  await db.client.execute({
    sql: "INSERT INTO milestone_labels (id, milestone_id, name, created_at, updated_at, version) VALUES ('ml_1', 'ms_1', 'ML', ?, ?, 1)",
    args: [T0, T0],
  });
  await db.client.execute({
    sql: "INSERT INTO board_labels (id, board_id, name, created_at, updated_at, version) VALUES ('bl_1', 'bd_1', 'BL', ?, ?, 1)",
    args: [T0, T0],
  });
}

async function countActivities(entityType: string, entityId: string): Promise<number> {
  const result = await db.client.execute({
    sql: "SELECT COUNT(*) AS n FROM activities WHERE entity_type = ? AND entity_id = ?",
    args: [entityType, entityId],
  });
  return Number(result.rows[0]!.n);
}

interface EntityCase {
  label: string;
  entityType: string;
  entityId: string;
  versionConflictError: new (...args: never[]) => Error;
  archiveOnce: () => Promise<unknown>;
  readVersion: () => Promise<number>;
}

function buildCases(db: TestDb): EntityCase[] {
  const projectRepo = new DrizzleProjectRepository(db.client);
  const milestoneRepo = new DrizzleMilestoneRepository(db.client);
  const boardRepo = new DrizzleBoardRepository(db.client);
  const listRepo = new DrizzleListRepository(db.client);
  const cardRepo = new DrizzleCardRepository(db.client, { assertAssigneeActiveMember: async () => undefined });
  const msLabelRepo = new DrizzleMilestoneLabelRepository(db.client);
  const bdLabelRepo = new DrizzleBoardLabelRepository(db.client);

  const readVersionFrom = (table: string, idColumn: string, id: string) => async (): Promise<number> => {
    const r = await db.client.execute({ sql: `SELECT version FROM ${table} WHERE ${idColumn} = ?`, args: [id] });
    return Number(r.rows[0]!.version);
  };

  return [
    {
      label: "Project (project_state)",
      entityType: "project",
      entityId: PROJECT,
      versionConflictError: ProjectVersionConflictError,
      archiveOnce: () => projectRepo.archiveProject({ projectId: PROJECT, expectedVersion: 1, actorUserId: ACTOR }),
      readVersion: readVersionFrom("project_state", "project_id", PROJECT),
    },
    {
      label: "Milestone",
      entityType: "milestone",
      entityId: "ms_1",
      versionConflictError: MilestoneVersionConflictError,
      archiveOnce: () => milestoneRepo.archiveMilestone(PROJECT, { milestoneId: "ms_1", expectedVersion: 1, actorUserId: ACTOR }),
      readVersion: readVersionFrom("milestones", "id", "ms_1"),
    },
    {
      label: "Board",
      entityType: "board",
      entityId: "bd_1",
      versionConflictError: BoardVersionConflictError,
      archiveOnce: () => boardRepo.archiveBoard(PROJECT, { boardId: "bd_1", expectedVersion: 1, actorUserId: ACTOR }),
      readVersion: readVersionFrom("boards", "id", "bd_1"),
    },
    {
      label: "List",
      entityType: "list",
      entityId: "ls_1",
      versionConflictError: ListVersionConflictError,
      archiveOnce: () => listRepo.archiveList(PROJECT, { listId: "ls_1", expectedVersion: 1, actorUserId: ACTOR }),
      readVersion: readVersionFrom("lists", "id", "ls_1"),
    },
    {
      label: "Card",
      entityType: "card",
      entityId: "cd_1",
      versionConflictError: CardVersionConflictError,
      archiveOnce: () => cardRepo.archiveCard(PROJECT, { cardId: "cd_1", expectedVersion: 1, actorUserId: ACTOR }),
      readVersion: readVersionFrom("cards", "id", "cd_1"),
    },
    {
      label: "Milestone Label",
      entityType: "milestone_label",
      entityId: "ml_1",
      versionConflictError: LabelVersionConflictError,
      archiveOnce: () => msLabelRepo.archiveMilestoneLabel(PROJECT, { labelId: "ml_1", expectedVersion: 1, actorUserId: ACTOR }),
      readVersion: readVersionFrom("milestone_labels", "id", "ml_1"),
    },
    {
      label: "Board Label",
      entityType: "board_label",
      entityId: "bl_1",
      versionConflictError: LabelVersionConflictError,
      archiveOnce: () => bdLabelRepo.archiveBoardLabel(PROJECT, { labelId: "bl_1", expectedVersion: 1, actorUserId: ACTOR }),
      readVersion: readVersionFrom("board_labels", "id", "bl_1"),
    },
  ];
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

// Label statis dipisah dari EntityCase (yang butuh `db` sudah ter-init oleh
// beforeAll) — `describe` body Vitest berjalan SAAT KOLEKSI, sebelum
// beforeAll dieksekusi, jadi judul test TIDAK BOLEH bergantung pada `db`.
const CASE_LABELS = ["Project (project_state)", "Milestone", "Board", "List", "Card", "Milestone Label", "Board Label"] as const;

describe("[TASK-6.1.2] Optimistic locking — concurrency table-driven per entity (BR-019–023, AC-020)", () => {
  for (let i = 0; i < CASE_LABELS.length; i++) {
    const index = i;
    it(`[${CASE_LABELS[index]}] dua archive() expectedVersion sama (pemenang lalu stale-loser) -> tepat SATU sukses, SATU VERSION_CONFLICT, SATU Activity`, async () => {
      await seedChain();
      const testCase = buildCases(db)[index]!;

      // Sisi "pemenang" — persis apa yang akan terjadi ke SATU dari dua
      // request genuinely-concurrent (lihat catatan deviasi di header file).
      await testCase.archiveOnce();
      expect(await testCase.readVersion()).toBe(2);
      expect(await countActivities(testCase.entityType, testCase.entityId)).toBe(1);

      // Sisi "kalah" — expectedVersion SAMA (1) yang kini stale, persis
      // kondisi yang dilihat request KEDUA pada race genuinely-concurrent
      // (baik keduanya baca version=1 sebelum salah satu commit, ATAU
      // request kedua retry membaca version basi karena timing). WAJIB
      // ditolak, TANPA mutasi/Activity tambahan (BR-021, invariant #9).
      await expect(buildCases(db)[index]!.archiveOnce()).rejects.toBeInstanceOf(testCase.versionConflictError);

      // Version TIDAK berubah lagi dari sisi kalah (bukan double-apply).
      expect(await testCase.readVersion()).toBe(2);

      // TIDAK ada Activity kedua dari sisi yang gagal — invariant #9.
      expect(await countActivities(testCase.entityType, testCase.entityId)).toBe(1);
    });
  }
});
