import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import { applyGlobalMigrations, DbIdempotencyStore } from "@kanban/infrastructure";
import { withIdempotentHandling } from "../src/routes/projects.ts";
const USER = "u-barrier";
let dir: string;
let globalClient: Client;
beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "kanban-idem-barrier-"));
    globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
    await applyGlobalMigrations(globalClient);
    await globalClient.execute({
        sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
        args: [USER, `${USER}@t.local`, USER, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"],
    });
});
let projectDb: Client;
async function insertMilestoneWithActivity(id: string): Promise<void> {
    const now = "2026-01-01T00:00:00.000Z";
    await projectDb.execute({
        sql: "INSERT INTO milestones (id, title, progress, created_at, updated_at, version) VALUES (?, 'M', 0, ?, ?, 1)",
        args: [id, now, now],
    });
    await projectDb.execute({
        sql: "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, 'milestone', ?, 1, ?, 'milestone.created', '{}', ?)",
        args: [`act-${id}`, id, USER, now],
    });
}
const countIn = async (sql: string): Promise<number> => Number((await projectDb.execute({ sql })).rows[0]!.n);
beforeAll(async () => {
    projectDb = createClient({ url: `file:${join(dir, "proj.db")}` });
    const { applyProjectMigrations } = await import("@kanban/infrastructure");
    await applyProjectMigrations(projectDb);
});
afterAll(async () => {
    await projectDb.close();
    await globalClient.close();
    rmSync(dir, { recursive: true, force: true });
});
const crypto = globalThis.crypto;
function makeApp(store: DbIdempotencyStore, hooks: {
    onHandlerStarted?: () => void;
    holdHandler?: Promise<void>;
}): Hono {
    const app = new Hono();
    app.post("/v1/test/barrier", (c) => withIdempotentHandling(c, { resolveIdentity: async () => ({ userId: USER }) }, async () => {
        hooks.onHandlerStarted?.();
        await (hooks.holdHandler ?? Promise.resolve());
        await insertMilestoneWithActivity(`ms-${crypto.randomUUID().slice(0, 8)}`);
        return { ok: true };
    }, 201, store));
    return app;
}
const call = (app: Hono, key: string): Promise<Response> => app.request("/v1/test/barrier", {
    method: "POST",
    headers: { "idempotency-key": key, "content-type": "application/json" },
    body: JSON.stringify({ hello: "world" }),
});
describe("AC-034 concurrency barrier sungguhan (goal 0.21.3)", () => {
    it("[barrier] request kedua tiba SAAT handler pertama masih menahan claim → IDEMPOTENCY_IN_PROGRESS; side-effect tepat satu", async () => {
        const store = new DbIdempotencyStore(globalClient);
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        let started = false;
        const app = makeApp(store, {
            onHandlerStarted: () => (started = true),
            holdHandler: gate,
        });
        const r1Promise = call(app, "key-overlap");
        for (let i = 0; i < 200 && !started; i++) {
            await new Promise((r) => setTimeout(r, 5));
        }
        expect(started).toBe(true);
        const r2 = await call(app, "key-overlap");
        expect(r2.status).toBe(409);
        expect(((await r2.json()).error ?? {}).code).toBe("IDEMPOTENCY_IN_PROGRESS");
        release();
        const r1 = await r1Promise;
        expect(r1.status).toBe(201);
        expect(await countIn("SELECT COUNT(*) AS n FROM milestones")).toBe(1);
        expect(await countIn("SELECT COUNT(*) AS n FROM activities")).toBe(1);
    });
    it("[AC-033/0.21.3] completed expired → diproses sebagai request BARU (dua side-effect)", async () => {
        const shortTtl = new DbIdempotencyStore(globalClient, { completedTtlMs: 50 });
        const app = makeApp(shortTtl, {});
        expect((await call(app, "key-expire")).status).toBe(201);
        expect(await countIn("SELECT COUNT(*) AS n FROM milestones")).toBe(2);
        expect(await countIn("SELECT COUNT(*) AS n FROM activities")).toBe(2);
        await globalClient.execute("UPDATE idempotency_keys SET expires_at = '2020-01-01T00:00:00.000Z' WHERE scope LIKE ?", [`${USER}%`]);
        const second = await call(app, "key-expire");
        expect(second.status).toBe(201);
        expect(await countIn("SELECT COUNT(*) AS n FROM milestones")).toBe(3);
        expect(await countIn("SELECT COUNT(*) AS n FROM activities")).toBe(3);
    });
});
