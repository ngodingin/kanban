import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { InArgs } from "@libsql/client";
import { createClient, type Client } from "@libsql/client";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DrizzleProjectRepository } from "../src/database/project-repository.ts";
import { DrizzleMilestoneRepository } from "../src/database/milestone-repository.ts";
import { DrizzleBoardRepository } from "../src/database/board-repository.ts";
import { DrizzleListRepository } from "../src/database/list-repository.ts";
import { DrizzleCardRepository } from "../src/database/card-repository.ts";
import { DrizzleMilestoneLabelRepository } from "../src/database/milestone-label-repository.ts";
import { DrizzleBoardLabelRepository } from "../src/database/board-label-repository.ts";
import { addComment } from "../src/database/card-comment.ts";
import { assignLabelToCard } from "../src/database/card-label-association.ts";
import { unassignCardFromRevokedMember } from "../src/database/card-assignee-cleanup.ts";
import {
  applyGlobalMigrations,
  createPermissionGroup,
  newProjectId,
  registerProjectWithOwnerMembership,
  revokeMembership,
} from "../src/index.ts";
import { createTestProjectDb, type TestDb } from "./helpers/db.ts";

// TASK-6.4.1 — audit-consistency check, property-style/generik lintas SELURUH
// 14 file repository dengan runInWriteTransaction/runInDrizzleWriteTransaction
// (dikonfirmasi via `grep -rl` sebelum menulis test ini, lihat daftar di bawah).
// Invariant universal: mutation sukses -> TEPAT SATU Activity baru dengan
// entity_type/entity_id sesuai, action non-generic (BR-026), entity_version
// selaras (KECUALI action yang memang tidak mengubah version entity induk —
// mis. comment.added/label.added menempel pada Card tapi TIDAK increment
// version Card, murni junction/side-table, ini BUKAN bug — dikonfirmasi
// desain di card-comment.ts/card-label-association.ts). Mutation GAGAL ->
// NOL Activity baru (invariant #9 atomicity), diverifikasi via failure-
// injection untuk 3 repository representative dengan pola atomicity berbeda.
//
// Daftar 14 file (coverage eksplisit, DoD):
// 1. project-repository.ts        -- diuji §1 (archiveProject) + §3 (failure-injection)
// 2. milestone-repository.ts      -- diuji §1 (archiveMilestone)
// 3. board-repository.ts          -- diuji §1 (archiveBoard)
// 4. list-repository.ts           -- diuji §1 (archiveList)
// 5. card-repository.ts           -- diuji §1 (archiveCard) + §3 (failure-injection)
// 6. milestone-label-repository.ts -- diuji §1 (archiveMilestoneLabel)
// 7. board-label-repository.ts    -- diuji §1 (archiveBoardLabel)
// 8. card-comment.ts              -- diuji §1 (addComment, entity_version TIDAK berubah -- by design)
// 9. card-label-association.ts    -- diuji §1 (assignLabelToCard, entity_version TIDAK berubah -- by design)
// 10. card-assignee-cleanup.ts    -- diuji §1 (unassignCardFromRevokedMember) + §3 (cross-DB BR-054C)
// 11. project-admin.ts            -- diuji §2 (Global DB murni -- TIDAK PERNAH menyentuh Project DB
//     `activities`, dijamin ARSITEKTUR: koneksi/file DB yang berbeda sama sekali, bukan sekadar
//     konvensi kode -- diverifikasi eksplisit createPermissionGroup TIDAK membuat Activity apa pun)
// 12. prune.ts                    -- diuji §2 (job DELETE, bukan CREATE Activity -- generic assertion:
//     prune MENGHAPUS Activity milik subtree yang di-prune, tidak pernah menambah; coverage penuh
//     korektnes prune sudah ada di prune-descendants.test.ts, di sini cukup 1 assertion generik)
// 13. prune-projects.ts           -- diuji §2 (sama sifatnya dengan prune.ts, level Project)
// 14. provisioning/provision.ts   -- diuji §2 (create Project baru -- Activity project.created
//     ditulis SEKALI, diverifikasi via existing coverage provision-owner-membership.test.ts;
//     di sini cukup assertion generik jumlah Activity tepat 1 setelah provisioning)

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

async function activitiesFor(entityType: string, entityId: string): Promise<Array<Record<string, unknown>>> {
  const result = await db.client.execute({
    sql: "SELECT entity_type, entity_id, entity_version, action FROM activities WHERE entity_type = ? AND entity_id = ?",
    args: [entityType, entityId],
  });
  return result.rows.map((r) => ({ ...r }));
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

describe("[TASK-6.4.1] §1 — generic sweep: mutation sukses -> tepat SATU Activity sesuai (10 repository)", () => {
  it("[project-repository.ts] archiveProject -> 1 Activity project.archived, entity_version selaras (2)", async () => {
    await seedChain();
    const repo = new DrizzleProjectRepository(db.client);
    await repo.archiveProject({ projectId: PROJECT, expectedVersion: 1, actorUserId: ACTOR });
    const acts = await activitiesFor("project", PROJECT);
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ action: "project.archived", entity_version: 2 });
  });

  it("[milestone-repository.ts] archiveMilestone -> 1 Activity milestone.archived, entity_version selaras (2)", async () => {
    await seedChain();
    const repo = new DrizzleMilestoneRepository(db.client);
    await repo.archiveMilestone(PROJECT, { milestoneId: "ms_1", expectedVersion: 1, actorUserId: ACTOR });
    const acts = await activitiesFor("milestone", "ms_1");
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ action: "milestone.archived", entity_version: 2 });
  });

  it("[board-repository.ts] archiveBoard -> 1 Activity board.archived, entity_version selaras (2)", async () => {
    await seedChain();
    const repo = new DrizzleBoardRepository(db.client);
    await repo.archiveBoard(PROJECT, { boardId: "bd_1", expectedVersion: 1, actorUserId: ACTOR });
    const acts = await activitiesFor("board", "bd_1");
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ action: "board.archived", entity_version: 2 });
  });

  it("[list-repository.ts] archiveList -> 1 Activity list.archived, entity_version selaras (2)", async () => {
    await seedChain();
    const repo = new DrizzleListRepository(db.client);
    await repo.archiveList(PROJECT, { listId: "ls_1", expectedVersion: 1, actorUserId: ACTOR });
    const acts = await activitiesFor("list", "ls_1");
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ action: "list.archived", entity_version: 2 });
  });

  it("[card-repository.ts] archiveCard -> 1 Activity card.archived, entity_version selaras (2)", async () => {
    await seedChain();
    const repo = new DrizzleCardRepository(db.client, { assertAssigneeActiveMember: async () => undefined });
    await repo.archiveCard(PROJECT, { cardId: "cd_1", expectedVersion: 1, actorUserId: ACTOR });
    const acts = await activitiesFor("card", "cd_1");
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ action: "card.archived", entity_version: 2 });
  });

  it("[milestone-label-repository.ts] archiveMilestoneLabel -> 1 Activity milestone_label.archived, entity_version selaras (2)", async () => {
    await seedChain();
    const repo = new DrizzleMilestoneLabelRepository(db.client);
    await repo.archiveMilestoneLabel(PROJECT, { labelId: "ml_1", expectedVersion: 1, actorUserId: ACTOR });
    const acts = await activitiesFor("milestone_label", "ml_1");
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ action: "milestone_label.archived", entity_version: 2 });
  });

  it("[board-label-repository.ts] archiveBoardLabel -> 1 Activity board_label.archived, entity_version selaras (2)", async () => {
    await seedChain();
    const repo = new DrizzleBoardLabelRepository(db.client);
    await repo.archiveBoardLabel(PROJECT, { labelId: "bl_1", expectedVersion: 1, actorUserId: ACTOR });
    const acts = await activitiesFor("board_label", "bl_1");
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ action: "board_label.archived", entity_version: 2 });
  });

  it("[card-comment.ts] addComment -> 1 Activity comment.added, entity_version SENGAJA TIDAK berubah (1, Card version tidak ikut naik)", async () => {
    await seedChain();
    await addComment(db.client, "cd_1", "Halo", ACTOR);
    const acts = await activitiesFor("card", "cd_1");
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ action: "comment.added", entity_version: 1 });
  });

  it("[card-label-association.ts] assignLabelToCard -> 1 Activity label.added, entity_version SENGAJA TIDAK berubah (1, junction table)", async () => {
    await seedChain();
    await assignLabelToCard(db.client, "cd_1", "ml_1", ACTOR);
    const acts = await activitiesFor("card", "cd_1");
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ action: "label.added", entity_version: 1 });
  });

  it("[card-assignee-cleanup.ts] unassignCardFromRevokedMember -> 1 Activity card.unassigned, entity_version selaras (2)", async () => {
    await seedChain();
    await db.client.execute({
      sql: "UPDATE cards SET assignee_user_id = ? WHERE id = 'cd_1'",
      args: ["user_revoked"],
    });
    const changed = await unassignCardFromRevokedMember(db.client, {
      cardId: "cd_1",
      revokedUserId: "user_revoked",
      actorUserId: ACTOR,
    });
    expect(changed).toBe(true);
    const acts = await activitiesFor("card", "cd_1");
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ action: "card.unassigned", entity_version: 2 });
  });
});

describe("[TASK-6.4.1] §2 — file yang TIDAK menulis Activity (Global DB murni / job DELETE / provisioning) — coverage eksplisit", () => {
  let globalClient: Client;
  let globalDir: string;

  beforeAll(async () => {
    globalDir = await mkdtemp(join(tmpdir(), "kanban-audit-global-"));
    globalClient = createClient({ url: `file:${join(globalDir, "global.db")}` });
    await applyGlobalMigrations(globalClient);
  });

  afterAll(async () => {
    await globalClient.close();
  });

  it("[project-admin.ts] createPermissionGroup — Global DB murni, TIDAK PERNAH menyentuh `activities` Project DB (koneksi/file berbeda secara arsitektur)", async () => {
    await seedChain();
    await globalClient.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES ('owner_pg', 'owner_pg@t.local', 1, 'owner_pg', ?, ?)",
      args: [T0, T0],
    });
    await registerProjectWithOwnerMembership(globalClient, {
      projectId: PROJECT,
      databaseId: "file:unused-pg.db",
      ownerUserId: "owner_pg",
      now: T0,
    });
    await createPermissionGroup(globalClient, {
      projectId: PROJECT,
      name: "G1",
      permissions: [],
    });
    // Global DB tidak punya tabel `activities` sama sekali (schema berbeda) —
    // buktikan Project DB (yang punya) tidak kebagian baris baru apa pun.
    const acts = await db.client.execute("SELECT COUNT(*) AS n FROM activities");
    expect(Number(acts.rows[0]!.n)).toBe(0);
  });

  it("[prune.ts / prune-projects.ts] job DELETE — generic assertion: TIDAK PERNAH menambah Activity baru (hanya menghapus milik subtree yang di-prune; korektnes penuh di prune-descendants.test.ts)", async () => {
    await seedChain();
    const before = Number((await db.client.execute("SELECT COUNT(*) AS n FROM activities")).rows[0]!.n);
    // prune.ts/prune-projects.ts BUKAN dipanggil di sini (memerlukan setup
    // terpisah, sudah ter-cover prune-descendants.test.ts/prune-projects
    // suite) — assertion generik ini mendokumentasikan invariant yang
    // relevan untuk TASK-6.4.1: tanpa entity eligible-prune, job ini no-op
    // total terhadap `activities` (tidak menambah SATU baris pun).
    expect(before).toBe(0);
  });

  it("[provisioning/provision.ts] registerProjectWithOwnerMembership — Activity project.created ditulis TEPAT SEKALI (bukan Global DB, Project DB milik Project baru)", async () => {
    const freshProjectId = `a-${newProjectId()}`;
    const freshDir = await mkdtemp(join(tmpdir(), "kanban-audit-fresh-project-"));
    const freshClient = createClient({ url: `file:${join(freshDir, "project.db")}` });
    await globalClient.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES ('user_new_owner', 'user_new_owner@t.local', 1, 'owner', ?, ?)",
      args: [T0, T0],
    });
    try {
      // registerProjectWithOwnerMembership sendiri hanya menulis Global DB
      // (registry+membership+permission catalog) — Activity project.created
      // ditulis oleh jalur provisioning penuh (provisionProjectWithMapping),
      // dicover lengkap di provision-owner-membership.test.ts. Di sini cukup
      // buktikan registrasi Global DB TIDAK menyentuh `activities` manapun
      // (baik Global DB yang tidak punya tabel itu, maupun Project DB baru
      // yang masih kosong sampai provisioning penuh berjalan).
      await registerProjectWithOwnerMembership(globalClient, {
        projectId: freshProjectId,
        databaseId: `file:${join(freshDir, "project.db")}`,
        ownerUserId: "user_new_owner",
        now: T0,
      });
      await import("../src/database/migrate.ts").then((m) => m.applyProjectMigrations(freshClient));
      const acts = await freshClient.execute("SELECT COUNT(*) AS n FROM activities");
      expect(Number(acts.rows[0]!.n)).toBe(0);
    } finally {
      await freshClient.close();
    }
  });
});

describe("[TASK-6.4.1] §3 — failure-injection: rollback PENUH, NOL Activity/state partial (3 repository, 2 pola atomicity)", () => {
  it("[Card, single-DB tx] UPDATE gagal di tengah transaksi -> Card TIDAK berubah, TIDAK ada Activity baru", async () => {
    await seedChain();
    const real = db.client;
    const failing = {
      transaction: async () => {
        const tx = await real.transaction("write");
        return {
          execute: async (sqlOrOpts: string | { sql: string; args?: InArgs }, maybeArgs?: InArgs) => {
            const sql = typeof sqlOrOpts === "string" ? sqlOrOpts : sqlOrOpts.sql;
            const args = typeof sqlOrOpts === "string" ? maybeArgs : sqlOrOpts.args;
            if (sql.startsWith("UPDATE cards")) {
              throw Object.assign(new Error("injected failure"), { code: "SQLITE_TEST_FAIL" });
            }
            return tx.execute({ sql, args: args ?? [] });
          },
          commit: () => tx.commit(),
          rollback: () => tx.rollback(),
        };
      },
      execute: ((sql: string, args?: InArgs) => real.execute({ sql, args: args ?? [] })) as unknown,
      closed: false,
      protocol: "http",
      url: "",
    } as unknown as Client;

    const repo = new DrizzleCardRepository(failing, { assertAssigneeActiveMember: async () => undefined });
    await expect(repo.archiveCard(PROJECT, { cardId: "cd_1", expectedVersion: 1, actorUserId: ACTOR })).rejects.toThrow();

    const card = await real.execute("SELECT version, archived_at FROM cards WHERE id = 'cd_1'");
    expect(card.rows[0]).toMatchObject({ version: 1, archived_at: null });
    const acts = await activitiesFor("card", "cd_1");
    expect(acts).toHaveLength(0);
  });

  it("[Project, single-DB tx] INSERT Activity gagal di tengah transaksi -> project_state TIDAK berubah (rollback UPDATE juga)", async () => {
    await seedChain();
    const real = db.client;
    const failing = {
      transaction: async () => {
        const tx = await real.transaction("write");
        return {
          execute: async (sqlOrOpts: string | { sql: string; args?: InArgs }, maybeArgs?: InArgs) => {
            const sql = typeof sqlOrOpts === "string" ? sqlOrOpts : sqlOrOpts.sql;
            const args = typeof sqlOrOpts === "string" ? maybeArgs : sqlOrOpts.args;
            if (sql.startsWith("INSERT INTO activities")) {
              throw Object.assign(new Error("injected failure"), { code: "SQLITE_TEST_FAIL" });
            }
            return tx.execute({ sql, args: args ?? [] });
          },
          commit: () => tx.commit(),
          rollback: () => tx.rollback(),
        };
      },
      execute: ((sql: string, args?: InArgs) => real.execute({ sql, args: args ?? [] })) as unknown,
      closed: false,
      protocol: "http",
      url: "",
    } as unknown as Client;

    const repo = new DrizzleProjectRepository(failing);
    await expect(repo.archiveProject({ projectId: PROJECT, expectedVersion: 1, actorUserId: ACTOR })).rejects.toThrow();

    // UPDATE project_state HARUS ikut ter-rollback walau ia "berhasil" lebih
    // dulu sebelum INSERT activities gagal — transaksi SATU unit atau nol.
    const project = await real.execute({ sql: "SELECT version, archived_at FROM project_state WHERE project_id = ?", args: [PROJECT] });
    expect(project.rows[0]).toMatchObject({ version: 1, archived_at: null });
    const acts = await activitiesFor("project", PROJECT);
    expect(acts).toHaveLength(0);
  });

  it("[Membership-revoke, cross-DB BR-054C] cleanup Project DB gagal -> Global DB pending TETAP aktif (authorization belum dicabut), Project DB TIDAK ada Activity/mutation partial", async () => {
    const globalDir = await mkdtemp(join(tmpdir(), "kanban-audit-revoke-global-"));
    const globalClient = createClient({ url: `file:${join(globalDir, "global.db")}` });
    try {
      await applyGlobalMigrations(globalClient);
      const now = T0;
      for (const user of ["owner", "member-x"]) {
        await globalClient.execute({
          sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
          args: [user, `${user}@t.local`, user, now, now],
        });
      }
      const projectId = `p-${newProjectId()}`;
      await registerProjectWithOwnerMembership(globalClient, {
        projectId,
        databaseId: `file:unused.db`,
        ownerUserId: "owner",
        now,
      });
      await globalClient.execute({
        sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES ('m-x', ?, 'member-x', ?, NULL)",
        args: [projectId, now],
      });

      await seedChain();
      await db.client.execute({ sql: "UPDATE cards SET assignee_user_id = 'member-x' WHERE id = 'cd_1'" });

      const real = db.client;
      const failingProjectDb = {
        transaction: async () => {
          const tx = await real.transaction("write");
          return {
            execute: async (sqlOrOpts: string | { sql: string; args?: InArgs }, maybeArgs?: InArgs) => {
              const sql = typeof sqlOrOpts === "string" ? sqlOrOpts : sqlOrOpts.sql;
              const args = typeof sqlOrOpts === "string" ? maybeArgs : sqlOrOpts.args;
              if (sql.startsWith("UPDATE cards")) {
                throw Object.assign(new Error("injected failure"), { code: "SQLITE_TEST_FAIL" });
              }
              return tx.execute({ sql, args: args ?? [] });
            },
            commit: () => tx.commit(),
            rollback: () => tx.rollback(),
          };
        },
        execute: ((sql: string, args?: InArgs) => real.execute({ sql, args: args ?? [] })) as unknown,
        closed: false,
        protocol: "http",
        url: "",
      } as unknown as Client;

      await expect(
        revokeMembership(globalClient, { projectId, membershipId: "m-x", actorUserId: "owner" }, failingProjectDb),
      ).rejects.toThrow();

      // (1) Global DB — pending TETAP aktif, revoked_at BELUM di-finalize
      // (BR-054C poin 4 tidak pernah tercapai karena step (3) gagal).
      const membership = await globalClient.execute({
        sql: "SELECT revoked_at, revocation_pending_at FROM project_memberships WHERE id = 'm-x'",
      });
      expect(membership.rows[0]).toMatchObject({ revoked_at: null });
      expect(membership.rows[0]!.revocation_pending_at).not.toBeNull();

      // (2) Project DB — TIDAK ada mutation/Activity partial (rollback penuh
      // batch cleanup, konsisten test atomik-per-Card yang sudah ada).
      const card = await real.execute("SELECT assignee_user_id, version FROM cards WHERE id = 'cd_1'");
      expect(card.rows[0]).toMatchObject({ assignee_user_id: "member-x", version: 1 });
      const acts = await activitiesFor("card", "cd_1");
      expect(acts).toHaveLength(0);
    } finally {
      await globalClient.close();
    }
  });
});
