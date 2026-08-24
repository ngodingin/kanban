import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AncestorNotActiveError, CardInvalidStateError, CardNotFoundError, CardVersionConflictError, InvalidDestinationError, } from "@kanban/domain";
import { DrizzleCardRepository } from "../src/database/card-repository.ts";
import { createTestProjectDb, type TestDb } from "./helpers/db.ts";
const T0 = "2026-08-01T00:00:00.000Z";
const PROJECT = "proj_1";
const OWNER = "user_owner_1";
let db: TestDb;
let repo: DrizzleCardRepository;
async function seedFullBoard(opts: {
    boardArchivedAt?: string | null;
    projectArchivedAt?: string | null;
} = {}): Promise<void> {
    await db.client.execute({
        sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, archived_at, version) VALUES (?, ?, ?, ?, ?, 1)",
        args: [PROJECT, "Alpha", T0, T0, opts.projectArchivedAt ?? null],
    });
    for (const id of ["ms_1", "ms_2"]) {
        await db.client.execute({
            sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, archived_at, version) VALUES (?, ?, NULL, 0, ?, ?, NULL, 1)",
            args: [id, `MS ${id}`, T0, T0],
        });
    }
    const boards: Array<[
        string,
        string
    ]> = [
        ["bd_1", "ms_1"],
        ["bd_1b", "ms_1"],
        ["bd_2", "ms_2"],
    ];
    for (const [id, ms] of boards) {
        await db.client.execute({
            sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES (?, ?, ?, NULL, ?, ?, 1)",
            args: [id, ms, `B ${id}`, T0, T0],
        });
    }
    if (opts.boardArchivedAt) {
        await db.client.execute({ sql: "UPDATE boards SET archived_at = ? WHERE id = 'bd_arch'", args: [opts.boardArchivedAt] });
    }
    const lists: Array<[
        string,
        string
    ]> = [
        ["ls_s", "bd_1"],
        ["ls_d1", "bd_1"],
        ["ls_d2", "bd_1b"],
        ["ls_m2", "bd_2"],
        ["ls_arch", "bd_arch"],
    ];
    for (const [id, bd] of lists) {
        await db.client
            .execute({
            sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, 1)",
            args: [id, bd, `L ${id}`, T0, T0],
        })
            .catch(() => undefined);
    }
}
async function seedCard(id: string, listId: string, opts: {
    archivedAt?: string | null;
    deletedAt?: string | null;
} = {}): Promise<void> {
    await db.client.execute({
        sql: "INSERT INTO cards (id, list_id, creator_user_id, assignee_user_id, title, subtitle, description, due_date, created_at, updated_at, archived_at, deleted_at, version) VALUES (?, ?, 'u1', NULL, 'Kartu', NULL, NULL, NULL, ?, ?, ?, ?, 1)",
        args: [id, listId, T0, T0, opts.archivedAt ?? null, opts.deletedAt ?? null],
    });
}
async function movedActivities(cardId: string): Promise<Array<{
    action: string;
    data: string;
}>> {
    const r = await db.client.execute({
        sql: "SELECT action, data FROM activities WHERE entity_id = ? AND entity_type = 'card' AND action = 'card.moved'",
        args: [cardId],
    });
    return r.rows.map((row) => ({ action: String(row.action), data: String(row.data) }));
}
beforeAll(async () => {
    db = await createTestProjectDb();
    repo = new DrizzleCardRepository(db.client, { assertAssigneeActiveMember: async () => { } });
});
afterEach(async () => {
    await db.truncateAll();
});
afterAll(async () => {
    await db.cleanup();
});
describe("moveCard — C.8 / INV-MOVE-001–004 / BR-017/018 (goal 2.10.1)", () => {
    it("[positif] move dalam Board sama (List→List) sukses + payload card.moved from/to lengkap B.5", async () => {
        await seedFullBoard();
        await seedCard("cd_m1", "ls_s");
        const moved = await repo.moveCard(PROJECT, {
            cardId: "cd_m1",
            destinationListId: "ls_d1",
            expectedVersion: 1,
            actorUserId: OWNER,
        });
        expect(moved).toMatchObject({ listId: "ls_d1", version: 2 });
        expect(moved.archivedAt).toBeNull();
        expect(moved.deletedAt).toBeNull();
        const [activity] = await movedActivities("cd_m1");
        expect(JSON.parse(activity!.data)).toEqual({
            from: { listId: "ls_s", listTitle: "L ls_s", boardId: "bd_1", boardTitle: "B bd_1" },
            to: { listId: "ls_d1", listTitle: "L ls_d1", boardId: "bd_1", boardTitle: "B bd_1" },
        });
        const row = await db.client.execute("SELECT list_id, version FROM cards WHERE id = 'cd_m1'");
        expect(row.rows[0]).toMatchObject({ list_id: "ls_d1", version: 2 });
    });
    it("[positif] move ke Board lain dalam Milestone SAMA (BR-018 diizinkan) sukses", async () => {
        await seedFullBoard();
        await seedCard("cd_m2", "ls_s");
        const moved = await repo.moveCard(PROJECT, {
            cardId: "cd_m2",
            destinationListId: "ls_d2",
            expectedVersion: 1,
            actorUserId: OWNER,
        });
        expect(moved.listId).toBe("ls_d2");
        const to = JSON.parse((await movedActivities("cd_m2"))[0]!.data).to;
        expect(to.boardId).toBe("bd_1b");
    });
    it("[BR-018] negatif: move ke Board di Milestone BEDA → INVALID_DESTINATION walau permission penuh", async () => {
        await seedFullBoard();
        await seedCard("cd_x", "ls_s");
        await expect(repo.moveCard(PROJECT, { cardId: "cd_x", destinationListId: "ls_m2", expectedVersion: 1, actorUserId: OWNER })).rejects.toBeInstanceOf(InvalidDestinationError);
        const row = await db.client.execute("SELECT list_id, version FROM cards WHERE id = 'cd_x'");
        expect(row.rows[0]).toMatchObject({ list_id: "ls_s", version: 1 });
    });
    it("[INV-MOVE-001][Project-boundary] move ke List Project lain → ditolak INVALID_DESTINATION tanpa menyentuh DB lain", async () => {
        await seedFullBoard();
        await seedCard("cd_p", "ls_s");
        await expect(repo.moveCard(PROJECT, { cardId: "cd_p", destinationListId: "ls_project_lain", expectedVersion: 1, actorUserId: OWNER })).rejects.toMatchObject({ code: "INVALID_DESTINATION" });
        expect(await movedActivities("cd_p")).toHaveLength(0);
    });
    it("[INV-MOVE-002] negatif: ancestor destination tidak ACTIVE → INVALID_DESTINATION", async () => {
        await seedFullBoard();
        await seedCard("cd_i", "ls_s");
        await db.client.execute({
            sql: "UPDATE milestones SET archived_at = ? WHERE id = 'ms_2'",
            args: [T0],
        });
        await expect(repo.moveCard(PROJECT, { cardId: "cd_i", destinationListId: "ls_m2", expectedVersion: 1, actorUserId: OWNER })).rejects.toBeInstanceOf(InvalidDestinationError);
    });
    it("[AC-020][BR-021] expected_version salah → VERSION_CONFLICT duluan; INV-MOVE tidak dievaluasi; tanpa perubahan/activity", async () => {
        await seedFullBoard();
        await seedCard("cd_v", "ls_s");
        await expect(repo.moveCard(PROJECT, { cardId: "cd_v", destinationListId: "ls_m2", expectedVersion: 99, actorUserId: OWNER })).rejects.toBeInstanceOf(CardVersionConflictError);
        const row = await db.client.execute("SELECT list_id, version FROM cards WHERE id = 'cd_v'");
        expect(row.rows[0]).toMatchObject({ list_id: "ls_s", version: 1 });
        expect(await movedActivities("cd_v")).toHaveLength(0);
    });
    it("[konkurensi][AC-020] mover kedua beroperasi pada snapshot stale → satu sukses, satu VERSION_CONFLICT", async () => {
        await seedFullBoard();
        await seedCard("cd_c", "ls_s");
        const winner = await repo.moveCard(PROJECT, {
            cardId: "cd_c",
            destinationListId: "ls_d1",
            expectedVersion: 1,
            actorUserId: OWNER,
        });
        expect(winner).toMatchObject({ listId: "ls_d1", version: 2 });
        await expect(repo.moveCard(PROJECT, { cardId: "cd_c", destinationListId: "ls_d2", expectedVersion: 1, actorUserId: OWNER })).rejects.toBeInstanceOf(CardVersionConflictError);
        const row = await db.client.execute("SELECT list_id, version FROM cards WHERE id = 'cd_c'");
        expect(row.rows[0]).toMatchObject({ list_id: "ls_d1", version: 2 });
        expect(await movedActivities("cd_c")).toHaveLength(1);
    });
    it("[INV-LIFE-003/004] negatif: move dari Card ARCHIVED dan DELETED → ditolak", async () => {
        await seedFullBoard();
        await seedCard("cd_ar", "ls_s", { archivedAt: T0 });
        await expect(repo.moveCard(PROJECT, { cardId: "cd_ar", destinationListId: "ls_d1", expectedVersion: 1, actorUserId: OWNER })).rejects.toBeInstanceOf(CardInvalidStateError);
        await seedCard("cd_de", "ls_s", { deletedAt: T0 });
        await expect(repo.moveCard(PROJECT, { cardId: "cd_de", destinationListId: "ls_d1", expectedVersion: 99, actorUserId: OWNER })).rejects.toBeInstanceOf(CardInvalidStateError);
    });
    it("[Review-CL-02][INV-LIFE-001] negatif: source chain non-operational (Board source ARCHIVED) → AncestorNotActiveError", async () => {
        await seedFullBoard();
        await seedCard("cd_so", "ls_s");
        await db.client.execute({ sql: "UPDATE boards SET archived_at = ? WHERE id = 'bd_1'", args: [T0] });
        await expect(repo.moveCard(PROJECT, { cardId: "cd_so", destinationListId: "ls_m2", expectedVersion: 1, actorUserId: OWNER })).rejects.toBeInstanceOf(AncestorNotActiveError);
    });
    it("negatif: card tidak ada → RESOURCE_NOT_FOUND; destination tidak ada → INVALID_DESTINATION", async () => {
        await seedFullBoard();
        await seedCard("cd_ok", "ls_s");
        await expect(repo.moveCard(PROJECT, { cardId: "cd_none", destinationListId: "ls_d1", expectedVersion: 1, actorUserId: OWNER })).rejects.toBeInstanceOf(CardNotFoundError);
        await expect(repo.moveCard(PROJECT, { cardId: "cd_ok", destinationListId: "ls_none", expectedVersion: 1, actorUserId: OWNER })).rejects.toBeInstanceOf(InvalidDestinationError);
    });
});
