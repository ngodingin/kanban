import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PipelineError } from "../src/pipeline/errors.ts";
import { AncestorNotActiveError, CardInvalidStateError, CardNotFoundError } from "@kanban/domain";
import { assignLabelToCard, removeLabelFromCard } from "../src/database/card-label-association.ts";
import { createTestProjectDb, type TestDb } from "./helpers/db.ts";
const T0 = "2026-08-01T00:00:00.000Z";
const OWNER = "user_owner_1";
let db: TestDb;
async function seedFullChain(): Promise<void> {
    await db.client.execute({
        sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES ('proj_1', 'Alpha', ?, ?, 1)",
        args: [T0, T0],
    });
    for (const ms of ["ms_1", "ms_2"]) {
        await db.client.execute({
            sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES (?, ?, NULL, 0, ?, ?, 1)",
            args: [ms, `M ${ms}`, T0, T0],
        });
    }
    await db.client.execute({
        sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('bd_1', 'ms_1', 'B1', NULL, ?, ?, 1)",
        args: [T0, T0],
    });
    await db.client.execute({
        sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('bd_2', 'ms_2', 'B2', NULL, ?, ?, 1)",
        args: [T0, T0],
    });
    await db.client.execute({
        sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('l_1', 'bd_1', 'L1', ?, ?, 1)",
        args: [T0, T0],
    });
    await db.client.execute({
        sql: "INSERT INTO cards (id, list_id, creator_user_id, title, created_at, updated_at, version) VALUES ('c_1', 'l_1', ?, 'C1', ?, ?, 5)",
        args: [OWNER, T0, T0],
    });
    await db.client.execute({
        sql: "INSERT INTO milestone_labels (id, milestone_id, name, created_at, updated_at, version) VALUES ('ml_1', 'ms_1', 'Feature', ?, ?, 1)",
        args: [T0, T0],
    });
    await db.client.execute({
        sql: "INSERT INTO milestone_labels (id, milestone_id, name, created_at, updated_at, version) VALUES ('ml_2', 'ms_2', 'OtherMs', ?, ?, 1)",
        args: [T0, T0],
    });
    await db.client.execute({
        sql: "INSERT INTO board_labels (id, board_id, name, created_at, updated_at, version) VALUES ('bl_1', 'bd_1', 'Bug', ?, ?, 1)",
        args: [T0, T0],
    });
    await db.client.execute({
        sql: "INSERT INTO board_labels (id, board_id, name, created_at, updated_at, version) VALUES ('bl_2', 'bd_2', 'OtherBoard', ?, ?, 1)",
        args: [T0, T0],
    });
    await db.client.execute({
        sql: "INSERT INTO board_labels (id, board_id, name, created_at, updated_at, archived_at, version) VALUES ('bl_archived', 'bd_1', 'Old', ?, ?, ?, 1)",
        args: [T0, T0, T0],
    });
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
describe("assignLabelToCard/removeLabelFromCard (goal 3.7.1)", () => {
    it("[positif] assign Milestone Label & Board Label milik posisi Card saat ini → sukses, Activity label.added", async () => {
        await seedFullChain();
        const ms = await assignLabelToCard(db.client, "c_1", "ml_1", OWNER);
        expect(ms).toMatchObject({ cardId: "c_1", labelId: "ml_1", labelScope: "milestone", labelName: "Feature" });
        const bd = await assignLabelToCard(db.client, "c_1", "bl_1", OWNER);
        expect(bd).toMatchObject({ cardId: "c_1", labelId: "bl_1", labelScope: "board", labelName: "Bug" });
        const msRow = await db.client.execute("SELECT card_id, label_id, removed_at FROM card_milestone_labels WHERE card_id = 'c_1'");
        expect(msRow.rows[0]).toMatchObject({ card_id: "c_1", label_id: "ml_1", removed_at: null });
        const bdRow = await db.client.execute("SELECT card_id, label_id, removed_at FROM card_board_labels WHERE card_id = 'c_1'");
        expect(bdRow.rows[0]).toMatchObject({ card_id: "c_1", label_id: "bl_1", removed_at: null });
        const activities = await db.client.execute("SELECT action, entity_version, data FROM activities WHERE entity_id = 'c_1' ORDER BY created_at");
        expect(activities.rows).toHaveLength(2);
        expect(activities.rows[0]).toMatchObject({ action: "label.added", entity_version: 5 });
        expect(JSON.parse(String(activities.rows[0]!.data))).toEqual({
            labelId: "ml_1",
            labelScope: "milestone",
            labelName: "Feature",
        });
    });
    it("[FR-032 scope mismatch] Milestone Label milik Milestone LAIN ditolak; Board Label milik Board LAIN ditolak", async () => {
        await seedFullChain();
        await expect(assignLabelToCard(db.client, "c_1", "ml_2", OWNER)).rejects.toBeInstanceOf(PipelineError);
        await expect(assignLabelToCard(db.client, "c_1", "bl_2", OWNER)).rejects.toBeInstanceOf(PipelineError);
    });
    it("[FR-034] assign Label ARCHIVED ditolak", async () => {
        await seedFullChain();
        await expect(assignLabelToCard(db.client, "c_1", "bl_archived", OWNER)).rejects.toBeInstanceOf(PipelineError);
    });
    it("[Prinsip #4/INV-LIFE-001] assign pada Card non-operational (ancestor Board ARCHIVED) ditolak", async () => {
        await seedFullChain();
        await db.client.execute("UPDATE boards SET archived_at = ? WHERE id = 'bd_1'", [T0]);
        await expect(assignLabelToCard(db.client, "c_1", "ml_1", OWNER)).rejects.toBeInstanceOf(AncestorNotActiveError);
    });
    it("[Local state] assign pada Card ARCHIVED lokal ditolak (CardInvalidStateError)", async () => {
        await seedFullChain();
        await db.client.execute("UPDATE cards SET archived_at = ? WHERE id = 'c_1'", [T0]);
        await expect(assignLabelToCard(db.client, "c_1", "ml_1", OWNER)).rejects.toBeInstanceOf(CardInvalidStateError);
    });
    it("[Card tidak ada] CardNotFoundError; [Label tidak ada di kedua tabel] RESOURCE_NOT_FOUND", async () => {
        await seedFullChain();
        await expect(assignLabelToCard(db.client, "c_missing", "ml_1", OWNER)).rejects.toBeInstanceOf(CardNotFoundError);
        await expect(assignLabelToCard(db.client, "c_1", "lbl_missing", OWNER)).rejects.toMatchObject({
            code: "RESOURCE_NOT_FOUND",
        });
    });
    it("[Duplikat aktif] assign label yang SUDAH aktif ter-assign ditolak tanpa kena raw UNIQUE constraint", async () => {
        await seedFullChain();
        await assignLabelToCard(db.client, "c_1", "ml_1", OWNER);
        await expect(assignLabelToCard(db.client, "c_1", "ml_1", OWNER)).rejects.toMatchObject({ code: "INVALID_STATE" });
    });
    it("[FR-033] remove lalu assign ulang → baris BARU (histori utuh, bukan reuse baris removed_at lama)", async () => {
        await seedFullChain();
        await assignLabelToCard(db.client, "c_1", "ml_1", OWNER);
        const removed = await removeLabelFromCard(db.client, "c_1", "ml_1", OWNER);
        expect(removed.labelScope).toBe("milestone");
        const afterRemove = await db.client.execute("SELECT COUNT(*) n FROM card_milestone_labels WHERE card_id = 'c_1' AND label_id = 'ml_1'");
        expect(Number(afterRemove.rows[0]!.n)).toBe(1);
        await assignLabelToCard(db.client, "c_1", "ml_1", OWNER);
        const afterReassign = await db.client.execute("SELECT removed_at FROM card_milestone_labels WHERE card_id = 'c_1' AND label_id = 'ml_1' ORDER BY created_at");
        expect(afterReassign.rows).toHaveLength(2);
        expect(afterReassign.rows[0]!.removed_at).not.toBeNull();
        expect(afterReassign.rows[1]!.removed_at).toBeNull();
        const activities = await db.client.execute("SELECT action FROM activities WHERE entity_id = 'c_1' ORDER BY created_at");
        expect(activities.rows.map((r) => r.action)).toEqual(["label.added", "label.removed", "label.added"]);
    });
    it("[Remove tanpa asosiasi aktif] RESOURCE_NOT_FOUND", async () => {
        await seedFullChain();
        await expect(removeLabelFromCard(db.client, "c_1", "ml_1", OWNER)).rejects.toMatchObject({
            code: "RESOURCE_NOT_FOUND",
        });
    });
});
