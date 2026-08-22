import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  AncestorNotActiveError,
  CardInvalidStateError,
  CardNotFoundError,
  CardValidationError,
  CardVersionConflictError,
  ListNotFoundError,
} from "@kanban/domain";
import { DrizzleCardRepository } from "../src/database/card-repository.ts";
import { createTestProjectDb, type TestDb } from "./helpers/db.ts";

const T0 = "2026-08-01T00:00:00.000Z";
const PROJECT = "proj_1";
const OWNER = "user_owner_1";

let db: TestDb;
let repo: DrizzleCardRepository;

/** Validator assignee nyata lintas-DB: cek project_memberships di Global DB test. */
async function assertAssigneeActiveMember(projectId: string, userId: string): Promise<void> {
  const r = await db.client.execute({
    sql: "SELECT user_id FROM active_members_test WHERE project_id = ? AND user_id = ?",
    args: [projectId, userId],
  });
  if (r.rows.length === 0) {
    throw Object.assign(new Error(`User ${userId} bukan member aktif`), { code: "PERMISSION_DENIED" });
  }
}

beforeAll(async () => {
  db = await createTestProjectDb();
  await db.client.execute(
    "CREATE TABLE active_members_test (project_id TEXT NOT NULL, user_id TEXT NOT NULL)",
  );
  repo = new DrizzleCardRepository(db.client, { assertAssigneeActiveMember: assertAssigneeActiveMember });
});

afterEach(async () => {
  await db.truncateAll();
  await db.client.execute("DELETE FROM active_members_test");
});

afterAll(async () => {
  await db.cleanup();
});

interface ChainOpts {
  listArchivedAt?: string | null;
  boardArchivedAt?: string | null;
  milestoneArchivedAt?: string | null;
  projectArchivedAt?: string | null;
}

async function seedChain(listId: string = "ls_c", opts: ChainOpts = {}): Promise<void> {
  await db.client.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, archived_at, deleted_at, version) VALUES (?, ?, ?, ?, ?, NULL, 1)",
    args: [PROJECT, "Alpha", T0, T0, opts.projectArchivedAt ?? null],
  });
  await db.client.execute({
    sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, archived_at, version) VALUES ('ms_x', 'M', NULL, 0, ?, ?, ?, 1)",
    args: [T0, T0, opts.milestoneArchivedAt ?? null],
  });
  await db.client.execute({
    sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, archived_at, version) VALUES ('bd_x', 'ms_x', 'B', NULL, ?, ?, ?, 1)",
    args: [T0, T0, opts.boardArchivedAt ?? null],
  });
  await db.client.execute({
    sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, archived_at, version) VALUES (?, 'bd_x', 'L', ?, ?, ?, 1)",
    args: [listId, T0, T0, opts.listArchivedAt ?? null],
  });
  await db.client.execute({ sql: "INSERT INTO active_members_test (project_id, user_id) VALUES (?, 'user_member')", args: [PROJECT] });
}

async function seedCard(id: string, opts: { archivedAt?: string | null; deletedAt?: string | null; assignee?: string | null; creator?: string; listId?: string } = {}): Promise<void> {
  await db.client.execute({
    sql: "INSERT INTO cards (id, list_id, creator_user_id, assignee_user_id, title, subtitle, description, due_date, created_at, updated_at, archived_at, deleted_at, version) VALUES (?, ?, ?, ?, 'Kartu', 'sub', 'desc', NULL, ?, ?, ?, ?, 1)",
    args: [id, opts.listId ?? "ls_c", opts.creator ?? OWNER, opts.assignee ?? null, T0, T0, opts.archivedAt ?? null, opts.deletedAt ?? null],
  });
}

async function activityCount(): Promise<number> {
  const r = await db.client.execute("SELECT COUNT(*) AS n FROM activities");
  return Number(r.rows[0]?.n);
}

describe("createCard — INV-LIFE-001 chain 4 level / FR-024–026 / 03-ENG A.5 (goal 2.8.1)", () => {
  it("positif: chain ACTIVE → card dibuat version 1, creator=actor, Activity card.created", async () => {
    await seedChain();
    const created = await repo.createCard(PROJECT, {
      id: "cd_new",
      listId: "ls_c",
      title: "Kerjakan",
      subtitle: "sub",
      description: "desc",
      dueDate: "2026-09-01",
      assigneeUserId: "user_member",
      actorUserId: OWNER,
    });
    expect(created.version).toBe(1);
    expect(created).toMatchObject({ id: "cd_new", listId: "ls_c", creatorUserId: OWNER, assigneeUserId: "user_member" });
    const activity = await db.client.execute("SELECT action, data FROM activities WHERE entity_id = 'cd_new'");
    expect(activity.rows[0]).toMatchObject({ action: "card.created" });
    expect(JSON.parse(String(activity.rows[0]!.data))).toEqual({
      snapshot: { title: "Kerjakan", creator_user_id: OWNER },
    });
  });

  it("[INV-LIFE-001] negatif: masing-masing ancestor ARCHIVED (List/Board/Milestone/Project) → ditolak", async () => {
    const cases: Array<{ label: string; opts: ChainOpts }> = [
      { label: "List", opts: { listArchivedAt: T0 } },
      { label: "Board", opts: { boardArchivedAt: T0 } },
      { label: "Milestone", opts: { milestoneArchivedAt: T0 } },
      { label: "Project", opts: { projectArchivedAt: T0 } },
    ];
    for (const [i, testCase] of cases.entries()) {
      await db.truncateAll();
      await db.client.execute("DELETE FROM active_members_test");
      await seedChain(`ls_case${i}`, testCase.opts);
      await expect(
        repo.createCard(PROJECT, {
          id: `cd_case${i}`,
          listId: `ls_case${i}`,
          title: "X",
          subtitle: null,
          description: null,
          dueDate: null,
          assigneeUserId: null,
          actorUserId: OWNER,
        }),
      ).rejects.toBeInstanceOf(AncestorNotActiveError);
    }
    expect(await activityCount()).toBe(0);
  });

  it("[03-ENG A.5][FR-026] negatif: assignee bukan member aktif → ditolak tanpa row/activity", async () => {
    await seedChain();
    await expect(
      repo.createCard(PROJECT, {
        id: "cd_asg",
        listId: "ls_c",
        title: "X",
        subtitle: null,
        description: null,
        dueDate: null,
        assigneeUserId: "user_bukan_member",
        actorUserId: OWNER,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const rows = await db.client.execute("SELECT COUNT(*) AS n FROM cards");
    expect(Number(rows.rows[0]?.n)).toBe(0);
    expect(await activityCount()).toBe(0);
  });

  it("[FR-024] negatif: title kosong → VALIDATION_ERROR; list tidak ada → ditolak", async () => {
    await seedChain();
    await expect(
      repo.createCard(PROJECT, {
        id: "cd_t",
        listId: "ls_c",
        title: " ",
        subtitle: null,
        description: null,
        dueDate: null,
        assigneeUserId: null,
        actorUserId: OWNER,
      }),
    ).rejects.toBeInstanceOf(CardValidationError);

    await expect(
      repo.createCard(PROJECT, {
        id: "cd_n",
        listId: "ls_none",
        title: "Y",
        subtitle: null,
        description: null,
        dueDate: null,
        assigneeUserId: null,
        actorUserId: OWNER,
      }),
    ).rejects.toBeInstanceOf(ListNotFoundError);
  });
});

describe("update/archive/restore/delete Card — A.3/AC-020/BR-045A/C.15 (goal 2.8.2)", () => {
  it("positif: update field + validasi assignee baru + Activity changes", async () => {
    await seedChain();
    await seedCard("cd_u");
    const updated = await repo.updateCard(PROJECT, {
      cardId: "cd_u",
      expectedVersion: 1,
      actorUserId: OWNER,
      title: "Baru",
      dueDate: "2026-10-10",
      assigneeUserId: "user_member",
    });
    expect(updated).toMatchObject({ title: "Baru", dueDate: "2026-10-10", assigneeUserId: "user_member", version: 2 });
    const activity = await db.client.execute(
      "SELECT data FROM activities WHERE entity_id = 'cd_u' AND action = 'card.updated'",
    );
    expect(JSON.parse(String(activity.rows[0]!.data))).toEqual({
      changes: {
        title: { before: "Kartu", after: "Baru" },
        dueDate: { before: null, after: "2026-10-10" },
        assignee_user_id: { before: null, after: "user_member" },
      },
    });
  });

  it("[BR-061/062][C.15] updateCard tidak menyentuh list_id — record tetap; input tak punya field list", async () => {
    await seedChain();
    await seedCard("cd_l");
    const updated = await repo.updateCard(PROJECT, {
      cardId: "cd_l",
      expectedVersion: 1,
      actorUserId: OWNER,
      title: "Pindah?",
    });
    expect(updated.listId).toBe("ls_c"); // tetap
    const row = await db.client.execute("SELECT list_id, version FROM cards WHERE id = 'cd_l'");
    expect(row.rows[0]).toMatchObject({ list_id: "ls_c", version: 2 });
  });

  it("[BR-025/FR-025] creator_user_id tidak pernah berubah lewat updateCard", async () => {
    await seedChain();
    await seedCard("cd_cr", { creator: "user_pembuat" });
    const updated = await repo.updateCard(PROJECT, {
      cardId: "cd_cr",
      expectedVersion: 1,
      actorUserId: "user_lain_sekali",
      title: "Diubah aktor lain",
    });
    expect(updated.creatorUserId).toBe("user_pembuat"); // historis utuh
  });

  it("[03-ENG A.5] negatif: ganti assignee ke non-member → ditolak tanpa perubahan", async () => {
    await seedChain();
    await seedCard("cd_bad");
    await expect(
      repo.updateCard(PROJECT, {
        cardId: "cd_bad",
        expectedVersion: 1,
        actorUserId: OWNER,
        assigneeUserId: "user_bukan_member",
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const row = await db.client.execute("SELECT assignee_user_id, version FROM cards WHERE id = 'cd_bad'");
    expect(row.rows[0]).toMatchObject({ assignee_user_id: null, version: 1 });
    expect(await activityCount()).toBe(0);
  });

  it("[AC-020] expected_version salah → VERSION_CONFLICT tanpa perubahan/activity", async () => {
    await seedChain();
    await seedCard("cd_v");
    await expect(
      repo.updateCard(PROJECT, { cardId: "cd_v", expectedVersion: 99, actorUserId: OWNER, title: "Tabrak" }),
    ).rejects.toBeInstanceOf(CardVersionConflictError);
    const row = await db.client.execute("SELECT title, version FROM cards WHERE id = 'cd_v'");
    expect(row.rows[0]).toMatchObject({ title: "Kartu", version: 1 });
    expect(await activityCount()).toBe(0);
  });

  it("[Review-CL-02][INV-LIFE-001] negatif: Project ARCHIVED walau Card local ACTIVE → update/archive/delete DITOLAK semua", async () => {
    await db.truncateAll();
    await db.client.execute("DELETE FROM active_members_test");
    await seedChain("ls_pa", { projectArchivedAt: T0 });
    await seedCard("cd_pa", { listId: "ls_pa" });

    await expect(
      repo.updateCard(PROJECT, { cardId: "cd_pa", expectedVersion: 1, actorUserId: OWNER, title: "Gagal" }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);
    await expect(
      repo.archiveCard(PROJECT, { cardId: "cd_pa", expectedVersion: 1, actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);
    await expect(
      repo.deleteCard(PROJECT, { cardId: "cd_pa", expectedVersion: 1, actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);

    const row = await db.client.execute("SELECT title, version FROM cards WHERE id = 'cd_pa'");
    expect(row.rows[0]).toMatchObject({ title: "Kartu", version: 1 });
    expect(await activityCount()).toBe(0);
  });

  it("[A.3] update dari ARCHIVED ditolak; archive sukses lalu diulang ditolak", async () => {
    await seedChain();
    await seedCard("cd_a", { archivedAt: T0 });
    await expect(
      repo.updateCard(PROJECT, { cardId: "cd_a", expectedVersion: 1, actorUserId: OWNER, title: "Gagal" }),
    ).rejects.toBeInstanceOf(CardInvalidStateError);

    await seedCard("cd_arc");
    const archived = await repo.archiveCard(PROJECT, {
      cardId: "cd_arc",
      expectedVersion: 1,
      actorUserId: OWNER,
    });
    expect(archived.archivedAt).not.toBeNull();
    await expect(
      repo.archiveCard(PROJECT, { cardId: "cd_arc", expectedVersion: 2, actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(CardInvalidStateError);
  });

  it("[BR-045A] restore blanket: Card di-archive User A berhasil di-restore User B", async () => {
    await seedChain();
    await seedCard("cd_bl");
    // archive oleh User A
    await repo.archiveCard(PROJECT, { cardId: "cd_bl", expectedVersion: 1, actorUserId: "user_a_pengarsip" });
    // restore oleh User B yang berbeda
    const restored = await repo.restoreCard(PROJECT, {
      cardId: "cd_bl",
      expectedVersion: 2,
      actorUserId: "user_b_restorer",
    });
    expect(restored.archivedAt).toBeNull();
    const activity = await db.client.execute(
      "SELECT data, actor_user_id FROM activities WHERE entity_id = 'cd_bl' AND action = 'card.restored'",
    );
    expect(String(activity.rows[0]!.actor_user_id)).toBe("user_b_restorer");
    expect(JSON.parse(String(activity.rows[0]!.data))).toEqual({ previous_state: "ARCHIVED" });
  });

  it("[INV-LIFE-002] restore Card saat ancestor Board ARCHIVED → ditolak", async () => {
    await db.truncateAll();
    await db.client.execute("DELETE FROM active_members_test");
    await seedChain("ls_rb", { boardArchivedAt: T0 });
    await seedCard("cd_rb", { archivedAt: T0, listId: "ls_rb" });
    await expect(
      repo.restoreCard(PROJECT, { cardId: "cd_rb", expectedVersion: 1, actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);
  });

  it("[A.3] delete dari ARCHIVED diizinkan previous_state ARCHIVED; delete dari DELETED ditolak", async () => {
    await seedChain();
    await seedCard("cd_d", { archivedAt: T0 });
    const deleted = await repo.deleteCard(PROJECT, {
      cardId: "cd_d",
      expectedVersion: 1,
      actorUserId: OWNER,
    });
    expect(deleted.deletedAt).not.toBeNull();

    await seedCard("cd_term", { deletedAt: T0 });
    await expect(
      repo.deleteCard(PROJECT, { cardId: "cd_term", expectedVersion: 1, actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(CardInvalidStateError);
  });

  it("negatif: card tidak ada → RESOURCE_NOT_FOUND", async () => {
    await seedChain();
    await expect(
      repo.archiveCard(PROJECT, { cardId: "cd_none", expectedVersion: 1, actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(CardNotFoundError);
  });
});
