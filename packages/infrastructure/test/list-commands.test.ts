import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  AncestorNotActiveError,
  BoardNotFoundError,
  ListInvalidStateError,
  ListNotFoundError,
  ListValidationError,
  ListVersionConflictError,
} from "@kanban/domain";
import { DrizzleListRepository } from "../src/database/list-repository.ts";
import { createTestProjectDb, type TestDb } from "./helpers/db.ts";

const T0 = "2026-08-01T00:00:00.000Z";
const PROJECT = "proj_1";
const OWNER = "user_owner_1";

let db: TestDb;
let repo: DrizzleListRepository;

async function seedProject(opts: { archivedAt?: string | null; deletedAt?: string | null } = {}): Promise<void> {
  await db.client.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, archived_at, deleted_at, version) VALUES (?, ?, ?, ?, ?, ?, 1)",
    args: [PROJECT, "Alpha", T0, T0, opts.archivedAt ?? null, opts.deletedAt ?? null],
  });
}

async function seedMilestone(id: string, opts: { archivedAt?: string | null; deletedAt?: string | null } = {}): Promise<void> {
  await db.client.execute({
    sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, archived_at, deleted_at, version) VALUES (?, ?, NULL, 0, ?, ?, ?, ?, 1)",
    args: [id, `MS ${id}`, T0, T0, opts.archivedAt ?? null, opts.deletedAt ?? null],
  });
}

async function seedBoard(id: string, milestoneId: string, opts: { archivedAt?: string | null; deletedAt?: string | null } = {}): Promise<void> {
  await db.client.execute({
    sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, archived_at, deleted_at, version) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 1)",
    args: [id, milestoneId, `B ${id}`, T0, T0, opts.archivedAt ?? null, opts.deletedAt ?? null],
  });
}

async function seedList(id: string, boardId: string, opts: { archivedAt?: string | null; deletedAt?: string | null; title?: string } = {}): Promise<void> {
  await db.client.execute({
    sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, archived_at, deleted_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
    args: [id, boardId, opts.title ?? `L ${id}`, T0, T0, opts.archivedAt ?? null, opts.deletedAt ?? null],
  });
}

async function seedCard(id: string, listId: string): Promise<void> {
  await db.client.execute({
    sql: "INSERT INTO cards (id, list_id, creator_user_id, title, created_at, updated_at, version) VALUES (?, ?, 'user_1', 'Kartu', ?, ?, 1)",
    args: [id, listId, T0, T0],
  });
}

async function cardRow(id: string): Promise<Record<string, unknown>> {
  const r = await db.client.execute("SELECT * FROM cards WHERE id = ?", [id]);
  return r.rows[0]!;
}

async function activityCount(): Promise<number> {
  const r = await db.client.execute("SELECT COUNT(*) AS n FROM activities");
  return Number(r.rows[0]?.n);
}

beforeAll(async () => {
  db = await createTestProjectDb();
  repo = new DrizzleListRepository(db.client);
});

afterEach(async () => {
  await db.truncateAll();
});

afterAll(async () => {
  await db.cleanup();
});

describe("createList — INV-LIFE-001 chain 3 level / FR-021 (goal 2.6.1)", () => {
  it("positif: Board+Milestone+Project ACTIVE → list dibuat version 1 + Activity list.created", async () => {
    await seedProject();
    await seedMilestone("ms_ok");
    await seedBoard("bd_ok", "ms_ok");
    const created = await repo.createList(PROJECT, {
      id: "ls_new",
      boardId: "bd_ok",
      title: "To Do",
      actorUserId: OWNER,
    });
    expect(created.version).toBe(1);
    expect(created).toMatchObject({ id: "ls_new", boardId: "bd_ok", title: "To Do" });
    const activity = await db.client.execute("SELECT action, data FROM activities WHERE entity_id = 'ls_new'");
    expect(activity.rows[0]).toMatchObject({ action: "list.created" });
    expect(JSON.parse(String(activity.rows[0]!.data))).toEqual({ snapshot: { title: "To Do" } });
  });

  it("[INV-LIFE-001] negatif: Board ARCHIVED (Milestone+Project ACTIVE) → ditolak", async () => {
    await seedProject();
    await seedMilestone("ms_a");
    await seedBoard("bd_a", "ms_a", { archivedAt: T0 });
    await expect(
      repo.createList(PROJECT, { id: "ls_x", boardId: "bd_a", title: "X", actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);
  });

  it("[INV-LIFE-001] negatif: Milestone ARCHIVED (Board local ACTIVE) → ditolak", async () => {
    await seedProject();
    await seedMilestone("ms_m", { archivedAt: T0 });
    await seedBoard("bd_m", "ms_m");
    await expect(
      repo.createList(PROJECT, { id: "ls_x", boardId: "bd_m", title: "X", actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);
  });

  it("[INV-LIFE-001] negatif: Project DELETED (Board+Milestone ACTIVE) → ditolak", async () => {
    await seedProject({ deletedAt: T0 });
    await seedMilestone("ms_p");
    await seedBoard("bd_p", "ms_p");
    await expect(
      repo.createList(PROJECT, { id: "ls_x", boardId: "bd_p", title: "X", actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);
    const rows = await db.client.execute("SELECT COUNT(*) AS n FROM lists");
    expect(Number(rows.rows[0]?.n)).toBe(0);
    expect(await activityCount()).toBe(0);
  });

  it("negatif: board tidak ada → RESOURCE_NOT_FOUND (BoardNotFoundError)", async () => {
    await seedProject();
    await expect(
      repo.createList(PROJECT, { id: "ls_z", boardId: "bd_none", title: "Z", actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(BoardNotFoundError);
  });

  it("[FR-021] negatif: title kosong → VALIDATION_ERROR", async () => {
    await seedProject();
    await seedMilestone("ms_t");
    await seedBoard("bd_t", "ms_t");
    await expect(
      repo.createList(PROJECT, { id: "ls_t", boardId: "bd_t", title: "  ", actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(ListValidationError);
  });
});

describe("update/archive/delete List — A.3 / AC-020 / FR-023 (goal 2.6.1)", () => {
  it("positif: update title dari ACTIVE + Activity changes {before, after}", async () => {
    await seedProject();
    await seedMilestone("ms_u");
    await seedBoard("bd_u", "ms_u");
    await seedList("ls_u", "bd_u");
    const updated = await repo.updateList(PROJECT, {
      listId: "ls_u",
      expectedVersion: 1,
      actorUserId: OWNER,
      title: "Doing",
    });
    expect(updated).toMatchObject({ title: "Doing", version: 2 });
    const activity = await db.client.execute(
      "SELECT data FROM activities WHERE entity_id = 'ls_u' AND action = 'list.updated'",
    );
    expect(JSON.parse(String(activity.rows[0]!.data))).toEqual({
      changes: { title: { before: "L ls_u", after: "Doing" } },
    });
  });

  it("[FR-023] struktur record tanpa field status/wip/dll", async () => {
    await seedProject();
    await seedMilestone("ms_f");
    await seedBoard("bd_f", "ms_f");
    await seedList("ls_f", "bd_f");
    const record = await repo.getList(PROJECT, "ls_f");
    expect(Object.keys(record!).sort()).toEqual(
      ["archivedAt", "boardId", "createdAt", "deletedAt", "id", "title", "updatedAt", "version"].sort(),
    );
  });

  it("[AC-020] negatif: expected_version salah → VERSION_CONFLICT tanpa perubahan/activity", async () => {
    await seedProject();
    await seedMilestone("ms_v");
    await seedBoard("bd_v", "ms_v");
    await seedList("ls_v", "bd_v");
    await expect(
      repo.updateList(PROJECT, { listId: "ls_v", expectedVersion: 99, actorUserId: OWNER, title: "Tabrak" }),
    ).rejects.toBeInstanceOf(ListVersionConflictError);
    const row = await db.client.execute("SELECT title, version FROM lists WHERE id = 'ls_v'");
    expect(row.rows[0]).toMatchObject({ title: "L ls_v", version: 1 });
    expect(await activityCount()).toBe(0);
  });

  it("[A.3] negatif: update dari ARCHIVED ditolak; restore dari DELETED tidak lewat state machine", async () => {
    await seedProject();
    await seedMilestone("ms_s");
    await seedBoard("bd_s", "ms_s");
    await seedList("ls_s", "bd_s", { archivedAt: T0 });
    await expect(
      repo.updateList(PROJECT, { listId: "ls_s", expectedVersion: 1, actorUserId: OWNER, title: "Gagal" }),
    ).rejects.toBeInstanceOf(ListInvalidStateError);
  });

  it("[INV-LIFE-002] negatif: restore List saat Board masih ARCHIVED → ditolak tanpa perubahan row", async () => {
    await seedProject();
    await seedMilestone("ms_r");
    await seedBoard("bd_r", "ms_r", { archivedAt: T0 });
    await seedList("ls_r", "bd_r", { archivedAt: T0 });
    await expect(
      repo.restoreList(PROJECT, { listId: "ls_r", expectedVersion: 1, actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);
    const row = await db.client.execute("SELECT archived_at, version FROM lists WHERE id = 'ls_r'");
    expect(row.rows[0]).toMatchObject({ archived_at: T0, version: 1 });
  });

  it("[INV-LIFE-002] positif: restore List saat chain 3 level ACTIVE semua → archivedAt null + Activity", async () => {
    await seedProject();
    await seedMilestone("ms_ok2");
    await seedBoard("bd_ok2", "ms_ok2");
    await seedList("ls_ok", "bd_ok2", { archivedAt: T0 });
    const restored = await repo.restoreList(PROJECT, {
      listId: "ls_ok",
      expectedVersion: 1,
      actorUserId: OWNER,
    });
    expect(restored.archivedAt).toBeNull();
    expect(restored.version).toBe(2);
    const activity = await db.client.execute(
      "SELECT data FROM activities WHERE entity_id = 'ls_ok' AND action = 'list.restored'",
    );
    expect(JSON.parse(String(activity.rows[0]!.data))).toEqual({ previous_state: "ARCHIVED" });
  });

  it("[A.3] delete dari ARCHIVED diizinkan dengan previous_state ARCHIVED", async () => {
    await seedProject();
    await seedMilestone("ms_d");
    await seedBoard("bd_d", "ms_d");
    await seedList("ls_d", "bd_d", { archivedAt: T0 });
    const deleted = await repo.deleteList(PROJECT, {
      listId: "ls_d",
      expectedVersion: 1,
      actorUserId: OWNER,
    });
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.archivedAt).not.toBeNull();
    const activity = await db.client.execute(
      "SELECT data, entity_version FROM activities WHERE entity_id = 'ls_d' AND action = 'list.deleted'",
    );
    expect(JSON.parse(String(activity.rows[0]!.data))).toEqual({ previous_state: "ARCHIVED" });
    expect(Number(activity.rows[0]!.entity_version)).toBe(2);
  });

  it("[Review-CL-02][INV-LIFE-001] negatif: Board di-archive walau List local ACTIVE → update/archive/delete DITOLAK semua", async () => {
    await seedProject();
    await seedMilestone("ms_pa");
    await seedBoard("bd_pa", "ms_pa");
    await seedList("ls_pa", "bd_pa");
    await db.client.execute({
      sql: "UPDATE boards SET archived_at = ? WHERE id = 'bd_pa'",
      args: [T0],
    });

    await expect(
      repo.updateList(PROJECT, { listId: "ls_pa", expectedVersion: 1, actorUserId: OWNER, title: "Gagal" }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);
    await expect(
      repo.archiveList(PROJECT, { listId: "ls_pa", expectedVersion: 1, actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);
    await expect(
      repo.deleteList(PROJECT, { listId: "ls_pa", expectedVersion: 1, actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);

    const row = await db.client.execute("SELECT title, version FROM lists WHERE id = 'ls_pa'");
    expect(row.rows[0]).toMatchObject({ title: "L ls_pa", version: 1 });
    expect(await activityCount()).toBe(0);
  });

  it("negatif: list tidak ada → RESOURCE_NOT_FOUND", async () => {
    await seedProject();
    await expect(
      repo.archiveList(PROJECT, { listId: "ls_none", expectedVersion: 1, actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(ListNotFoundError);
  });
});

describe("[FR-022][BR-013] archive/delete List TIDAK cascade ke Card descendant (goal 2.6.1)", () => {
  it("archive List: row Card identik sebelum vs sesudah (state/version/list_id/parent utuh)", async () => {
    await seedProject();
    await seedMilestone("ms_c");
    await seedBoard("bd_c", "ms_c");
    await seedList("ls_c", "bd_c");
    await seedCard("cd_c", "ls_c");

    const before = await cardRow("cd_c");

    await repo.archiveList(PROJECT, { listId: "ls_c", expectedVersion: 1, actorUserId: OWNER });

    const after = await cardRow("cd_c");
    expect(after).toEqual(before);

    // hanya satu activity baru (list.archived) — tidak ada activity card
    const activities = await db.client.execute(
      "SELECT DISTINCT entity_type FROM activities WHERE action != 'list.created'",
    );
    expect(activities.rows).toHaveLength(1);
    expect(activities.rows[0]).toMatchObject({ entity_type: "list" });
  });

  it("delete List: row Card identik sebelum vs sesudah — Card non-operational via chain, bukan cascade", async () => {
    await seedProject();
    await seedMilestone("ms_dd");
    await seedBoard("bd_dd", "ms_dd");
    await seedList("ls_dd", "bd_dd");
    await seedCard("cd_dd", "ls_dd");

    const before = await cardRow("cd_dd");

    await repo.deleteList(PROJECT, { listId: "ls_dd", expectedVersion: 1, actorUserId: OWNER });

    const after = await cardRow("cd_dd");
    expect(after).toEqual(before);

    const listRow = await db.client.execute("SELECT deleted_at, version FROM lists WHERE id = 'ls_dd'");
    expect(listRow.rows[0]).toMatchObject({ deleted_at: expect.any(String), version: 2 });
  });
});
