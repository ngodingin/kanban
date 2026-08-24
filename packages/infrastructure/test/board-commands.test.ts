import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AncestorNotActiveError, BoardInvalidStateError, BoardNotFoundError, BoardValidationError, BoardVersionConflictError, MilestoneNotFoundError, } from "@kanban/domain";
import { DrizzleBoardRepository } from "../src/database/board-repository.ts";
import { createTestProjectDb, type TestDb } from "./helpers/db.ts";
const T0 = "2026-08-01T00:00:00.000Z";
const PROJECT = "proj_1";
const OWNER = "user_owner_1";
let db: TestDb;
let repo: DrizzleBoardRepository;
async function seedEntity(table: "project_state" | "milestones" | "boards", id: string, opts: {
    title?: string;
    archivedAt?: string | null;
    deletedAt?: string | null;
    parentColumn?: string;
    parentId?: string;
} = {}): Promise<void> {
    const archived = opts.archivedAt ?? null;
    const deleted = opts.deletedAt ?? null;
    if (table === "project_state") {
        await db.client.execute({
            sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, archived_at, deleted_at, version) VALUES (?, ?, ?, ?, ?, ?, 1)",
            args: [id, "Alpha", T0, T0, archived, deleted],
        });
        return;
    }
    if (table === "milestones") {
        await db.client.execute({
            sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, archived_at, deleted_at, version) VALUES (?, ?, NULL, 0, ?, ?, ?, ?, 1)",
            args: [id, opts.title ?? `MS ${id}`, T0, T0, archived, deleted],
        });
        return;
    }
    await db.client.execute({
        sql: `INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, archived_at, deleted_at, version) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 1)`,
        args: [id, opts.parentId!, opts.title ?? `B ${id}`, T0, T0, archived, deleted],
    });
}
async function activityCount(): Promise<number> {
    const r = await db.client.execute("SELECT COUNT(*) AS n FROM activities");
    return Number(r.rows[0]?.n);
}
beforeAll(async () => {
    db = await createTestProjectDb();
    repo = new DrizzleBoardRepository(db.client);
});
afterEach(async () => {
    await db.truncateAll();
});
afterAll(async () => {
    await db.cleanup();
});
describe("createBoard — INV-LIFE-001 chain 2 level / FR-018 (goal 2.4.1)", () => {
    it("positif: Project ACTIVE + Milestone ACTIVE → board dibuat version 1 + Activity board.created", async () => {
        await seedEntity("project_state", PROJECT);
        await seedEntity("milestones", "ms_ok");
        const created = await repo.createBoard(PROJECT, {
            id: "bd_new",
            milestoneId: "ms_ok",
            title: "Papan Utama",
            description: null,
            actorUserId: OWNER,
        });
        expect(created.version).toBe(1);
        expect(created).toMatchObject({ id: "bd_new", milestoneId: "ms_ok", title: "Papan Utama" });
        const activity = await db.client.execute("SELECT action, data FROM activities WHERE entity_id = 'bd_new'");
        expect(activity.rows[0]).toMatchObject({ action: "board.created" });
        expect(JSON.parse(String(activity.rows[0]!.data))).toEqual({ snapshot: { title: "Papan Utama" } });
    });
    it("[INV-LIFE-001] negatif: Milestone ARCHIVED walau Project ACTIVE → ditolak", async () => {
        await seedEntity("project_state", PROJECT);
        await seedEntity("milestones", "ms_arc", { archivedAt: T0 });
        await expect(repo.createBoard(PROJECT, { id: "bd_x", milestoneId: "ms_arc", title: "X", description: null, actorUserId: OWNER })).rejects.toBeInstanceOf(AncestorNotActiveError);
    });
    it("[INV-LIFE-001] negatif: Milestone DELETED walau Project ACTIVE → ditolak", async () => {
        await seedEntity("project_state", PROJECT);
        await seedEntity("milestones", "ms_del", { deletedAt: T0 });
        await expect(repo.createBoard(PROJECT, { id: "bd_x", milestoneId: "ms_del", title: "X", description: null, actorUserId: OWNER })).rejects.toBeInstanceOf(AncestorNotActiveError);
    });
    it("[INV-LIFE-001] negatif: Project ARCHIVED/DELETED walau Milestone local ACTIVE → ditolak (satu saja cukup)", async () => {
        for (const lifecycle of [
            { archivedAt: T0, deletedAt: null },
            { archivedAt: null, deletedAt: T0 },
        ]) {
            await db.truncateAll();
            await seedEntity("project_state", PROJECT, lifecycle);
            await seedEntity("milestones", "ms_live");
            await expect(repo.createBoard(PROJECT, { id: "bd_y", milestoneId: "ms_live", title: "Y", description: null, actorUserId: OWNER })).rejects.toBeInstanceOf(AncestorNotActiveError);
        }
        const rows = await db.client.execute("SELECT COUNT(*) AS n FROM boards");
        expect(Number(rows.rows[0]?.n)).toBe(0);
        expect(await activityCount()).toBe(0);
    });
    it("negatif: milestone tidak ada → RESOURCE_NOT_FOUND (MilestoneNotFoundError)", async () => {
        await seedEntity("project_state", PROJECT);
        await expect(repo.createBoard(PROJECT, { id: "bd_z", milestoneId: "ms_none", title: "Z", description: null, actorUserId: OWNER })).rejects.toBeInstanceOf(MilestoneNotFoundError);
    });
    it("[FR-019] negatif: title kosong → VALIDATION_ERROR", async () => {
        await seedEntity("project_state", PROJECT);
        await seedEntity("milestones", "ms_t");
        await expect(repo.createBoard(PROJECT, { id: "bd_t", milestoneId: "ms_t", title: "  ", description: null, actorUserId: OWNER })).rejects.toBeInstanceOf(BoardValidationError);
    });
});
describe("update/archive/delete Board — state machine A.3 / AC-020 (goal 2.4.1)", () => {
    it("positif: update title/description dari ACTIVE + Activity changes", async () => {
        await seedEntity("project_state", PROJECT);
        await seedEntity("milestones", "ms_u");
        await seedEntity("boards", "bd_u", { parentId: "ms_u", title: "Lama" });
        const updated = await repo.updateBoard(PROJECT, {
            boardId: "bd_u",
            expectedVersion: 1,
            actorUserId: OWNER,
            title: "Baru",
            description: "desc baru",
        });
        expect(updated).toMatchObject({ title: "Baru", description: "desc baru", version: 2 });
        const activity = await db.client.execute("SELECT data FROM activities WHERE entity_id = 'bd_u' AND action = 'board.updated'");
        expect(JSON.parse(String(activity.rows[0]!.data))).toEqual({
            changes: {
                title: { before: "Lama", after: "Baru" },
                description: { before: null, after: "desc baru" },
            },
        });
    });
    it("[FR-019] struktur record/input hanya field non-MVP-free — tidak ada status/warna/ikon/WIP", async () => {
        await seedEntity("project_state", PROJECT);
        await seedEntity("milestones", "ms_f");
        await seedEntity("boards", "bd_f", { parentId: "ms_f" });
        const record = await repo.getBoard(PROJECT, "bd_f");
        expect(Object.keys(record!).sort()).toEqual(["archivedAt", "createdAt", "deletedAt", "description", "id", "milestoneId", "title", "updatedAt", "version"].sort());
    });
    it("[AC-020] negatif: expected_version salah → VERSION_CONFLICT tanpa perubahan/activity", async () => {
        await seedEntity("project_state", PROJECT);
        await seedEntity("milestones", "ms_v");
        await seedEntity("boards", "bd_v", { parentId: "ms_v" });
        await expect(repo.updateBoard(PROJECT, { boardId: "bd_v", expectedVersion: 99, actorUserId: OWNER, title: "Tabrak" })).rejects.toBeInstanceOf(BoardVersionConflictError);
        const row = await db.client.execute("SELECT title, version FROM boards WHERE id = 'bd_v'");
        expect(row.rows[0]).toMatchObject({ title: "B bd_v", version: 1 });
        expect(await activityCount()).toBe(0);
    });
    it("[Review-CL-02][INV-LIFE-001] negatif: Project di-archive walau Board local ACTIVE → update/archive/delete DITOLAK semua", async () => {
        await seedEntity("project_state", PROJECT);
        await seedEntity("milestones", "ms_pa");
        await seedEntity("boards", "bd_pa", { parentId: "ms_pa" });
        await db.client.execute({
            sql: "UPDATE project_state SET archived_at = ? WHERE project_id = ?",
            args: [T0, PROJECT],
        });
        await expect(repo.updateBoard(PROJECT, { boardId: "bd_pa", expectedVersion: 1, actorUserId: OWNER, title: "Gagal" })).rejects.toBeInstanceOf(AncestorNotActiveError);
        await expect(repo.archiveBoard(PROJECT, { boardId: "bd_pa", expectedVersion: 1, actorUserId: OWNER })).rejects.toBeInstanceOf(AncestorNotActiveError);
        await expect(repo.deleteBoard(PROJECT, { boardId: "bd_pa", expectedVersion: 1, actorUserId: OWNER })).rejects.toBeInstanceOf(AncestorNotActiveError);
        const row = await db.client.execute("SELECT title, version FROM boards WHERE id = 'bd_pa'");
        expect(row.rows[0]).toMatchObject({ title: "B bd_pa", version: 1 });
        expect(await activityCount()).toBe(0);
    });
    it("negatif: update dari ARCHIVED ditolak; delete dari DELETED ditolak (terminal)", async () => {
        await seedEntity("project_state", PROJECT);
        await seedEntity("milestones", "ms_a");
        await seedEntity("boards", "bd_a", { parentId: "ms_a", archivedAt: T0 });
        await expect(repo.updateBoard(PROJECT, { boardId: "bd_a", expectedVersion: 1, actorUserId: OWNER, title: "Gagal" })).rejects.toBeInstanceOf(BoardInvalidStateError);
        await seedEntity("boards", "bd_d", { parentId: "ms_a", deletedAt: T0 });
        await expect(repo.deleteBoard(PROJECT, { boardId: "bd_d", expectedVersion: 1, actorUserId: OWNER })).rejects.toBeInstanceOf(BoardInvalidStateError);
    });
    it("[INV-LIFE-002] negatif: restore Board saat Milestone masih ARCHIVED → ditolak (urutan: restore Milestone dulu)", async () => {
        await seedEntity("project_state", PROJECT);
        await seedEntity("milestones", "ms_r", { archivedAt: T0 });
        await seedEntity("boards", "bd_r", { parentId: "ms_r", archivedAt: T0 });
        await expect(repo.restoreBoard(PROJECT, { boardId: "bd_r", expectedVersion: 1, actorUserId: OWNER })).rejects.toBeInstanceOf(AncestorNotActiveError);
        const row = await db.client.execute("SELECT archived_at, version FROM boards WHERE id = 'bd_r'");
        expect(row.rows[0]).toMatchObject({ archived_at: T0, version: 1 });
    });
    it("[INV-LIFE-002] negatif: restore Board saat Project ARCHIVED (Milestone ACTIVE) → ditolak", async () => {
        await db.truncateAll();
        await seedEntity("project_state", PROJECT, { archivedAt: T0 });
        await seedEntity("milestones", "ms_p");
        await seedEntity("boards", "bd_p", { parentId: "ms_p", archivedAt: T0 });
        await expect(repo.restoreBoard(PROJECT, { boardId: "bd_p", expectedVersion: 1, actorUserId: OWNER })).rejects.toBeInstanceOf(AncestorNotActiveError);
    });
    it("[INV-LIFE-002] positif: restore Board saat Milestone+Project ACTIVE → archivedAt null", async () => {
        await seedEntity("project_state", PROJECT);
        await seedEntity("milestones", "ms_ok2");
        await seedEntity("boards", "bd_ok", { parentId: "ms_ok2", archivedAt: T0 });
        const restored = await repo.restoreBoard(PROJECT, {
            boardId: "bd_ok",
            expectedVersion: 1,
            actorUserId: OWNER,
        });
        expect(restored.archivedAt).toBeNull();
        expect(restored.version).toBe(2);
        const activity = await db.client.execute("SELECT data FROM activities WHERE entity_id = 'bd_ok' AND action = 'board.restored'");
        expect(JSON.parse(String(activity.rows[0]!.data))).toEqual({ previousState: "ARCHIVED" });
    });
    it("[BR-013] positif: archive Board tidak mengubah List/Card descendant", async () => {
        await seedEntity("project_state", PROJECT);
        await seedEntity("milestones", "ms_c");
        await seedEntity("boards", "bd_c", { parentId: "ms_c" });
        await db.client.execute({
            sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('ls_c', 'bd_c', 'Kolom', ?, ?, 1)",
            args: [T0, T0],
        });
        await db.client.execute({
            sql: "INSERT INTO cards (id, list_id, creator_user_id, title, created_at, updated_at, version) VALUES ('cd_c', 'ls_c', 'u1', 'Kartu', ?, ?, 1)",
            args: [T0, T0],
        });
        const archived = await repo.archiveBoard(PROJECT, {
            boardId: "bd_c",
            expectedVersion: 1,
            actorUserId: OWNER,
        });
        expect(archived.archivedAt).not.toBeNull();
        const listRow = await db.client.execute("SELECT archived_at, deleted_at, updated_at, version FROM lists WHERE id = 'ls_c'");
        expect(listRow.rows[0]).toMatchObject({ archived_at: null, deleted_at: null, updated_at: T0, version: 1 });
        const cardRow = await db.client.execute("SELECT archived_at, deleted_at, updated_at, version FROM cards WHERE id = 'cd_c'");
        expect(cardRow.rows[0]).toMatchObject({ archived_at: null, deleted_at: null, updated_at: T0, version: 1 });
        const boardActivityOnly = await db.client.execute("SELECT DISTINCT entity_type FROM activities");
        expect(boardActivityOnly.rows).toHaveLength(1);
        expect(boardActivityOnly.rows[0]).toMatchObject({ entity_type: "board" });
    });
    it("negatif: board tidak ada → RESOURCE_NOT_FOUND", async () => {
        await seedEntity("project_state", PROJECT);
        await expect(repo.archiveBoard(PROJECT, { boardId: "bd_none", expectedVersion: 1, actorUserId: OWNER })).rejects.toBeInstanceOf(BoardNotFoundError);
    });
});
