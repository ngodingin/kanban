import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { activities } from "../src/database/project-schema.ts";
const dir = mkdtempSync(join(tmpdir(), "kanban-project-behavior-"));
const client = createClient({ url: `file:${join(dir, "project.db")}` });
const db = drizzle(client);
const now = "2026-08-18T00:00:00.000Z";
async function expectViolation(fn: () => Promise<unknown>, label: string): Promise<void> {
    try {
        await fn();
        console.error(`FAIL ${label}: seharusnya gagal`);
        process.exitCode = 1;
    }
    catch {
        console.log(`PASS ${label}`);
    }
}
try {
    await migrate(db, { migrationsFolder: resolve("drizzle/migrations-project") });
    await client.execute({
        sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES ('proj_1', 'P', ?, ?, 1)",
        args: [now, now],
    });
    await client.execute({
        sql: "INSERT INTO milestones (id, title, created_at, updated_at, version) VALUES ('ms_1', 'M1', ?, ?, 1)",
        args: [now, now],
    });
    await client.execute({
        sql: "INSERT INTO boards (id, milestone_id, title, created_at, updated_at, version) VALUES ('bd_1', 'ms_1', 'B1', ?, ?, 1)",
        args: [now, now],
    });
    await client.execute({
        sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('ls_1', 'bd_1', 'Todo', ?, ?, 1)",
        args: [now, now],
    });
    await client.execute({
        sql: "INSERT INTO cards (id, list_id, creator_user_id, title, created_at, updated_at, version) VALUES ('cd_1', 'ls_1', 'u1', 'Card 1', ?, ?, 1)",
        args: [now, now],
    });
    await client.execute({
        sql: "INSERT INTO board_labels (id, board_id, name, created_at, updated_at, version) VALUES ('bl_1', 'bd_1', 'Bug', ?, ?, 1)",
        args: [now, now],
    });
    await client.execute({
        sql: "INSERT INTO card_board_labels (card_id, label_id, created_at) VALUES ('cd_1', 'bl_1', ?)",
        args: [now],
    });
    await expectViolation(() => client.execute({
        sql: "INSERT INTO card_board_labels (card_id, label_id, created_at) VALUES ('cd_1', 'bl_1', ?)",
        args: [now],
    }), "negatif: label sama aktif duplikat -> partial UNIQUE");
    await client.execute({
        sql: "UPDATE card_board_labels SET removed_at = ? WHERE card_id = 'cd_1' AND label_id = 'bl_1'",
        args: [now],
    });
    await client.execute({
        sql: "INSERT INTO card_board_labels (card_id, label_id, created_at) VALUES ('cd_1', 'bl_1', ?)",
        args: [now],
    });
    console.log("PASS positif: label boleh ditambahkan lagi setelah removed_at (riwayat junction tetap ada)");
    const history = await client.execute("SELECT COUNT(*) AS n FROM card_board_labels WHERE card_id = 'cd_1' AND label_id = 'bl_1'");
    if (Number(history.rows[0]?.n) !== 2)
        throw new Error("riwayat junction harus tetap 2 baris (append-only, bukan hapus)");
    console.log("PASS: junction bersifat append-only (removed_at, tidak ada delete fisik)");
    await db.insert(activities).values({
        id: "act_1",
        entityType: "card",
        entityId: "cd_1",
        entityVersion: 2,
        actorUserId: "u1",
        action: "card.moved",
        data: {
            from: { list_id: "ls_1", list_title: "Todo", board_id: "bd_1", board_title: "B1" },
            to: { list_id: "ls_2", list_title: "Review", board_id: "bd_1", board_title: "B1" },
        },
        createdAt: now,
    });
    const read = await db.select().from(activities).where(eq(activities.id, "act_1")).get();
    if (!read)
        throw new Error("activity tidak terbaca");
    if (read.action !== "card.moved" || read.entityVersion !== 2)
        throw new Error("kolom activity salah");
    const data = read.data as {
        from: {
            list_title: string;
        };
    };
    if (data.from.list_title !== "Todo")
        throw new Error("data JSON tidak round-trip");
    console.log("PASS positif: activities polymorphic (entity_type+entity_id) + data JSON round-trip (B.5 card.moved)");
    await expectViolation(() => client.execute({
        sql: "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES ('act_2', 'gadget', 'x', 1, 'u1', 'a', '{}', ?)",
        args: [now],
    }), "negatif: entity_type di luar enum -> ditolak");
    const count = await client.execute("SELECT COUNT(*) AS n FROM activities WHERE entity_type = 'card' AND entity_id = 'cd_1'");
    if (Number(count.rows[0]?.n) !== 1)
        throw new Error("query polymorphic gagal");
    console.log("PASS: query polymorphic entity_type+entity_id berfungsi");
    console.log("smoke project behavior selesai");
}
finally {
    await client.close();
    rmSync(dir, { recursive: true, force: true });
}
