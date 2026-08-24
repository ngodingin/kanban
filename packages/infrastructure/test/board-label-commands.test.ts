import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AncestorNotActiveError, LabelInvalidStateError, LabelNotFoundError, LabelValidationError, LabelVersionConflictError, } from "@kanban/domain";
import { DrizzleBoardLabelRepository } from "../src/database/board-label-repository.ts";
import { createTestProjectDb, type TestDb } from "./helpers/db.ts";
const T0 = "2026-08-01T00:00:00.000Z";
const PROJECT = "proj_1";
const OWNER = "user_owner_1";
let db: TestDb;
let repo: DrizzleBoardLabelRepository;
type ChainOpts = {
    boardArchivedAt?: string | null;
    milestoneArchivedAt?: string | null;
    projectArchivedAt?: string | null;
};
async function seedChain(opts: ChainOpts = {}): Promise<void> {
    await db.client.execute({
        sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, archived_at, version) VALUES (?, ?, ?, ?, ?, 1)",
        args: [PROJECT, "Alpha", T0, T0, opts.projectArchivedAt ?? null],
    });
    await db.client.execute({
        sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, archived_at, version) VALUES ('ms_b', 'M', NULL, 0, ?, ?, ?, 1)",
        args: [T0, T0, opts.milestoneArchivedAt ?? null],
    });
    await db.client.execute({
        sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, archived_at, version) VALUES ('bd_l', 'ms_b', 'B', NULL, ?, ?, ?, 1)",
        args: [T0, T0, opts.boardArchivedAt ?? null],
    });
}
async function seedLabel(id: string, opts: {
    archivedAt?: string | null;
    deletedAt?: string | null;
} = {}): Promise<void> {
    await db.client.execute({
        sql: "INSERT INTO board_labels (id, board_id, name, created_at, updated_at, archived_at, deleted_at, version) VALUES (?, 'bd_l', ?, ?, ?, ?, ?, 1)",
        args: [id, `L ${id}`, T0, T0, opts.archivedAt ?? null, opts.deletedAt ?? null],
    });
}
async function countActivities(entityType: string): Promise<number> {
    const r = await db.client.execute("SELECT COUNT(*) AS n FROM activities WHERE entity_type = ?", [entityType]);
    return Number(r.rows[0]?.n);
}
beforeAll(async () => {
    db = await createTestProjectDb();
    repo = new DrizzleBoardLabelRepository(db.client);
});
afterEach(async () => {
    await db.truncateAll();
});
afterAll(async () => {
    await db.cleanup();
});
describe("Board Label domain commands — chain 3 level (goal 3.5.1)", () => {
    it("[positif] create pada chain ACTIVE → version 1 + Activity entity_type board_label", async () => {
        await seedChain();
        const created = await repo.createBoardLabel(PROJECT, "bd_l", { id: "bl_new", name: "Urgent", actorUserId: OWNER });
        expect(created).toMatchObject({ id: "bl_new", boardId: "bd_l", name: "Urgent", version: 1 });
        const r = await db.client.execute("SELECT entity_type, action FROM activities WHERE entity_id = 'bl_new'");
        expect(r.rows[0]).toMatchObject({ entity_type: "board_label", action: "board_label.created" });
    });
    it("[Review-CL-02][WAJIB] archive Board dulu → update/archive/delete Board Label local-ACTIVE DITOLAK semua", async () => {
        await seedChain();
        await seedLabel("bl_r2");
        await db.client.execute({ sql: "UPDATE boards SET archived_at = ? WHERE id = 'bd_l'", args: [T0] });
        await expect(repo.updateBoardLabel(PROJECT, { labelId: "bl_r2", expectedVersion: 1, actorUserId: OWNER, name: "X" })).rejects.toBeInstanceOf(AncestorNotActiveError);
        await expect(repo.archiveBoardLabel(PROJECT, { labelId: "bl_r2", expectedVersion: 1, actorUserId: OWNER })).rejects.toBeInstanceOf(AncestorNotActiveError);
        await expect(repo.deleteBoardLabel(PROJECT, { labelId: "bl_r2", expectedVersion: 1, actorUserId: OWNER })).rejects.toBeInstanceOf(AncestorNotActiveError);
        const row = await db.client.execute("SELECT name, version FROM board_labels WHERE id = 'bl_r2'");
        expect(row.rows[0]).toMatchObject({ name: "L bl_r2", version: 1 });
        expect(await countActivities("board_label")).toBe(0);
    });
    it("[transitive] archive Milestone SAJA (Board tetap ACTIVE) → mutasi Board Label tetap DITOLAK", async () => {
        await seedChain({ milestoneArchivedAt: T0 });
        await seedLabel("bl_ms");
        for (const op of ["update", "archive", "delete"] as const) {
            const input = { labelId: "bl_ms", expectedVersion: 1, actorUserId: OWNER, ...(op === "update" ? { name: "X" } : {}) };
            const method = (repo as unknown as Record<string, (projectId: string, i: unknown) => Promise<unknown>>)[`${op}BoardLabel`]!;
            await expect(method.call(repo, PROJECT, input)).rejects.toBeInstanceOf(AncestorNotActiveError);
        }
    });
    it("[INV-LIFE-001] negatif: Project ARCHIVED walau Board+Milestone ACTIVE → create ditolak", async () => {
        await seedChain({ projectArchivedAt: T0 });
        await expect(repo.createBoardLabel(PROJECT, "bd_l", { id: "bl_x", name: "X", actorUserId: OWNER })).rejects.toBeInstanceOf(AncestorNotActiveError);
    });
    it("[A.3][AC-020] update dari ARCHIVED ditolak; expected_version salah → VERSION_CONFLICT tanpa efek", async () => {
        await seedChain();
        await seedLabel("bl_ar", { archivedAt: T0 });
        await expect(repo.updateBoardLabel(PROJECT, { labelId: "bl_ar", expectedVersion: 1, actorUserId: OWNER, name: "Gagal" })).rejects.toBeInstanceOf(LabelInvalidStateError);
        await seedLabel("bl_v");
        await expect(repo.updateBoardLabel(PROJECT, { labelId: "bl_v", expectedVersion: 99, actorUserId: OWNER, name: "Tabrak" })).rejects.toBeInstanceOf(LabelVersionConflictError);
        const row = await db.client.execute("SELECT name, version FROM board_labels WHERE id = 'bl_v'");
        expect(row.rows[0]).toMatchObject({ name: "L bl_v", version: 1 });
        expect(await countActivities("board_label")).toBe(0);
    });
    it("[INV-LIFE-002] restore ARCHIVED saat chain ACTIVE → sukses; saat Milestone ARCHIVED → ditolak", async () => {
        await seedChain();
        await seedLabel("bl_ok", { archivedAt: T0 });
        const restored = await repo.restoreBoardLabel(PROJECT, { labelId: "bl_ok", expectedVersion: 1, actorUserId: OWNER });
        expect(restored.archivedAt).toBeNull();
        await db.truncateAll();
        await seedChain({ milestoneArchivedAt: T0 });
        await seedLabel("bl_blk", { archivedAt: T0 });
        await expect(repo.restoreBoardLabel(PROJECT, { labelId: "bl_blk", expectedVersion: 1, actorUserId: OWNER })).rejects.toBeInstanceOf(AncestorNotActiveError);
    });
    it("[FR-034/B.5] title kosong ditolak; list exclude deleted; delete dari ARCHIVED sukses previous_state; tidak ada → NOT_FOUND", async () => {
        await seedChain();
        await expect(repo.createBoardLabel(PROJECT, "bd_l", { id: "bl_t", name: "  ", actorUserId: OWNER })).rejects.toBeInstanceOf(LabelValidationError);
        await seedLabel("bl_a");
        await seedLabel("bl_del", { deletedAt: T0 });
        const active = await repo.listBoardLabels(PROJECT, "bd_l");
        expect(active.map((l) => l.id)).toEqual(["bl_a"]);
        const all = await repo.listBoardLabels(PROJECT, "bd_l", { includeDeleted: true });
        expect(all).toHaveLength(2);
        await seedLabel("bl_d", { archivedAt: T0 });
        const deleted = await repo.deleteBoardLabel(PROJECT, { labelId: "bl_d", expectedVersion: 1, actorUserId: OWNER });
        expect(deleted.deletedAt).not.toBeNull();
        await expect(repo.archiveBoardLabel(PROJECT, { labelId: "bl_none", expectedVersion: 1, actorUserId: OWNER })).rejects.toBeInstanceOf(LabelNotFoundError);
    });
});
