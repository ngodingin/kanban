import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { applyProjectMigrations } from "../src/database/migrate.ts";
let dir: string;
let client: Client;
beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "kanban-activity-check-"));
    client = createClient({ url: `file:${join(dir, "project.db")}` });
    await applyProjectMigrations(client);
});
afterAll(async () => {
    await client.close();
    rmSync(dir, { recursive: true, force: true });
});
describe("activities.entity_type CHECK — Label entity (goal 3.2.1, FR-035/BR-025)", () => {
    it("[FR-035] positif: INSERT entity_type 'milestone_label' dan 'board_label' diterima", async () => {
        for (const entityType of ["milestone_label", "board_label"]) {
            await client.execute({
                sql: "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, ?, 'lbl_1', 1, 'u1', ? , '{}', '2026-08-23T00:00:00.000Z')",
                args: [`act-${entityType}`, entityType, `${entityType}.created`],
            });
        }
        const rows = await client.execute("SELECT DISTINCT entity_type FROM activities WHERE entity_type LIKE '%_label' ORDER BY entity_type");
        expect(rows.rows.map((r) => String(r.entity_type))).toEqual(["board_label", "milestone_label"]);
    });
    it("[regresi negatif] entity_type di luar 7 value tetap DITOLAK database", async () => {
        await expect(client.execute({
            sql: "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES ('act-bad', 'widget', 'w1', 1, 'u1', 'widget.created', '{}', '2026-08-23T00:00:00.000Z')",
        })).rejects.toThrow();
        await expect(client.execute({
            sql: "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES ('act-card', 'card', 'c1', 1, 'u1', 'card.updated', '{}', '2026-08-23T00:00:00.000Z')",
        })).resolves.toBeTruthy();
    });
    it("[DoD] data existing terbawa utuh saat table-recreate (idempotent forward-only)", async () => {
        const count = await client.execute("SELECT COUNT(*) AS n FROM activities");
        expect(Number(count.rows[0]?.n)).toBe(3);
        const idx = await client.execute("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='activities' AND name='activities_entity_idx'");
        expect(idx.rows).toHaveLength(1);
    });
});
