import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { applyProjectMigrations, pruneDescendantSubtrees } from "../src/index.ts";
const NOW = new Date("2026-08-23T00:00:00.000Z");
const BASE = "2026-01-01T00:00:00.000Z";
const daysAgoIso = (days: number): string => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
let dir: string;
beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "kanban-prune-orphan-"));
});
afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
});
async function makeProjectDb(): Promise<Client> {
    const client = createClient({ url: `file:${join(dir, `p-${Math.random().toString(36).slice(2)}.db`)}` });
    await applyProjectMigrations(client);
    await client.execute({
        sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES ('p1', 'P', ?, ?, 1)",
        args: [BASE, BASE],
    });
    return client;
}
interface ChainIds {
    ms: string;
    bd: string;
    ls: string;
    cd: string;
    ml: string;
    bl: string;
}
async function seedFullChain(client: Client, p: string, deletedAt: string | null): Promise<ChainIds> {
    const ids: ChainIds = { ms: `${p}-ms`, bd: `${p}-bd`, ls: `${p}-ls`, cd: `${p}-cd`, ml: `${p}-ml`, bl: `${p}-bl` };
    await client.execute({
        sql: "INSERT INTO milestones (id, title, progress, created_at, updated_at, deleted_at) VALUES (?, 'M', 0, ?, ?, ?)",
        args: [ids.ms, BASE, BASE, deletedAt],
    });
    await client.execute({
        sql: "INSERT INTO boards (id, milestone_id, title, created_at, updated_at, version) VALUES (?, ?, 'B', ?, ?, 1)",
        args: [ids.bd, ids.ms, BASE, BASE],
    });
    await client.execute({
        sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES (?, ?, 'L', ?, ?, 1)",
        args: [ids.ls, ids.bd, BASE, BASE],
    });
    await client.execute({
        sql: "INSERT INTO cards (id, list_id, title, creator_user_id, created_at, updated_at, version) VALUES (?, ?, 'C', 'u1', ?, ?, 1)",
        args: [ids.cd, ids.ls, BASE, BASE],
    });
    await client.execute({
        sql: "INSERT INTO milestone_labels (id, milestone_id, name, created_at, updated_at, version) VALUES (?, ?, 'ML', ?, ?, 1)",
        args: [ids.ml, ids.ms, BASE, BASE],
    });
    await client.execute({
        sql: "INSERT INTO board_labels (id, board_id, name, created_at, updated_at, version) VALUES (?, ?, 'BL', ?, ?, 1)",
        args: [ids.bl, ids.bd, BASE, BASE],
    });
    for (const [junction, cardId, labelId] of [
        ["card_milestone_labels", ids.cd, ids.ml],
        ["card_board_labels", ids.cd, ids.bl],
    ] as const) {
        await client.execute({
            sql: `INSERT INTO ${junction} (card_id, label_id, created_at) VALUES (?, ?, ?)`,
            args: [cardId, labelId, BASE],
        });
    }
    const activityRows: Array<[
        string,
        string,
        string
    ]> = [
        ["milestone", ids.ms, "milestone.created"],
        ["board", ids.bd, "board.created"],
        ["list", ids.ls, "list.created"],
        ["card", ids.cd, "card.created"],
        ["milestone_label", ids.ml, "milestone_label.created"],
        ["board_label", ids.bl, "board_label.created"],
        ["card", ids.cd, "card.comment"],
    ];
    for (const [type, eid, action] of activityRows) {
        await client.execute({
            sql: "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, ?, ?, 1, 'u1', ?, '{}', ?)",
            args: [`act-${type}-${eid}-${action}`, type, eid, action, BASE],
        });
    }
    return ids;
}
const count = async (client: Client, sql: string, args: string[] = []): Promise<number> => Number((await client.execute({ sql, args })).rows[0]!.n);
async function verifyNoOrphans(client: Client, pruned: ChainIds, survivors?: Partial<ChainIds>): Promise<void> {
    const checks: Array<[
        string,
        string,
        string
    ]> = [
        ["boards", "id", pruned.bd],
        ["lists", "id", pruned.ls],
        ["cards", "id", pruned.cd],
        ["milestone_labels", "id", pruned.ml],
        ["board_labels", "id", pruned.bl],
        ["card_milestone_labels", "label_id", pruned.ml],
        ["card_milestone_labels", "card_id", pruned.cd],
        ["card_board_labels", "label_id", pruned.bl],
        ["card_board_labels", "card_id", pruned.cd],
    ];
    for (const [table, col, id] of checks) {
        expect(await count(client, `SELECT COUNT(*) AS n FROM ${table} WHERE ${col} = ?`, [id]), `${table}.${col}=${id}`).toBe(0);
    }
    expect(await count(client, "SELECT COUNT(*) AS n FROM activities WHERE entity_type IN ('milestone','board','list','card','milestone_label','board_label') AND entity_id IN (?,?,?,?,?,?)", [pruned.ms, pruned.bd, pruned.ls, pruned.cd, pruned.ml, pruned.bl])).toBe(0);
    if (survivors?.ms !== undefined)
        expect(await count(client, "SELECT COUNT(*) AS n FROM milestones WHERE id = ?", [survivors.ms]), "ms survivor").toBe(1);
    if (survivors?.bd !== undefined)
        expect(await count(client, "SELECT COUNT(*) AS n FROM boards WHERE id = ?", [survivors.bd]), "bd survivor").toBe(1);
    if (survivors?.ls !== undefined)
        expect(await count(client, "SELECT COUNT(*) AS n FROM lists WHERE id = ?", [survivors.ls]), "ls survivor").toBe(1);
    if (survivors?.ml !== undefined)
        expect(await count(client, "SELECT COUNT(*) AS n FROM milestone_labels WHERE id = ?", [survivors.ml]), "ml survivor").toBe(1);
    if (survivors?.bl !== undefined)
        expect(await count(client, "SELECT COUNT(*) AS n FROM board_labels WHERE id = ?", [survivors.bl]), "bl survivor").toBe(1);
}
describe("No-orphan integrity — property-style matriks subtree (goal 5.2.2)", () => {
    const shapes = [
        { name: "root Milestone", rootLevel: "milestone" },
        { name: "root Board", rootLevel: "board" },
        { name: "root List", rootLevel: "list" },
        { name: "root Card", rootLevel: "card" },
    ] as const;
    for (const shape of shapes) {
        it(`[BR-016] ${shape.name}: seluruh descendant ikut, NOL orphan row-level`, async () => {
            const client = await makeProjectDb();
            const ids = await seedFullChain(client, shape.rootLevel.slice(0, 2) + shape.rootLevel.length, null);
            const tableByLevel: Record<string, string> = {
                milestone: "milestones",
                board: "boards",
                list: "lists",
                card: "cards",
            };
            await client.execute({
                sql: `UPDATE ${tableByLevel[shape.rootLevel]} SET deleted_at = ? WHERE id = ?`,
                args: [daysAgoIso(31), ids[shape.rootLevel === "milestone" ? "ms" : shape.rootLevel === "board" ? "bd" : shape.rootLevel === "list" ? "ls" : "cd"]],
            });
            const result = await pruneDescendantSubtrees(client, NOW);
            expect(result.cards).toBeGreaterThanOrEqual(1);
            const survivors: Partial<ChainIds> = {};
            if (shape.rootLevel !== "milestone")
                survivors.ms = ids.ms;
            if (shape.rootLevel === "list" || shape.rootLevel === "card")
                survivors.bd = ids.bd;
            if (shape.rootLevel === "card")
                survivors.ls = ids.ls;
            if (shape.rootLevel !== "milestone")
                survivors.ml = ids.ml;
            if (shape.rootLevel !== "milestone" && shape.rootLevel !== "board")
                survivors.bl = ids.bl;
            const prunedPart: ChainIds = {
                ms: shape.rootLevel === "milestone" ? ids.ms : (`none-ms-${shape.name}` as string),
                bd: shape.rootLevel === "milestone" || shape.rootLevel === "board" ? ids.bd : (`none-bd-${shape.name}` as string),
                ls: shape.rootLevel !== "card" ? ids.ls : (`none-ls-${shape.name}` as string),
                cd: ids.cd,
                ml: shape.rootLevel === "milestone" ? ids.ml : (`none-ml-${shape.name}` as string),
                bl: shape.rootLevel === "milestone" || shape.rootLevel === "board" ? ids.bl : (`none-bl-${shape.name}` as string),
            };
            await verifyNoOrphans(client, prunedPart, survivors);
            await client.close();
        });
    }
    it("[campuran] chain eligible + Card independen eligible dalam SATU Project → keduanya bersih tanpa saling ganggu", async () => {
        const client = await makeProjectDb();
        const a = await seedFullChain(client, "aa", daysAgoIso(31));
        const b = await seedFullChain(client, "bb", null);
        await client.execute({
            sql: "UPDATE cards SET deleted_at = ? WHERE id = ?",
            args: [daysAgoIso(31), b.cd],
        });
        const result = await pruneDescendantSubtrees(client, NOW);
        expect(result.milestones).toBe(1);
        expect(result.cards).toBe(2);
        await verifyNoOrphans(client, a, {});
        expect(await count(client, "SELECT COUNT(*) AS n FROM milestones WHERE id = ?", [b.ms])).toBe(1);
        expect(await count(client, "SELECT COUNT(*) AS n FROM boards WHERE id = ?", [b.bd])).toBe(1);
        expect(await count(client, "SELECT COUNT(*) AS n FROM lists WHERE id = ?", [b.ls])).toBe(1);
        expect(await count(client, "SELECT COUNT(*) AS n FROM milestone_labels WHERE id = ?", [b.ml])).toBe(1);
        expect(await count(client, "SELECT COUNT(*) AS n FROM board_labels WHERE id = ?", [b.bl])).toBe(1);
        expect(await count(client, "SELECT COUNT(*) AS n FROM cards WHERE id = ?", [b.cd])).toBe(0);
        expect(await count(client, "SELECT COUNT(*) AS n FROM card_milestone_labels WHERE card_id = ?", [b.cd])).toBe(0);
        expect(await count(client, "SELECT COUNT(*) AS n FROM card_board_labels WHERE card_id = ?", [b.cd])).toBe(0);
        expect(await count(client, "SELECT COUNT(*) AS n FROM activities WHERE entity_id = ?", [b.cd])).toBe(0);
        expect(await count(client, "SELECT COUNT(*) AS n FROM activities WHERE entity_id = ?", [b.ms])).toBe(1);
        await client.close();
    });
});
