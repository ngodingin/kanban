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
  await globalClient.execute("CREATE TABLE effect_rows (id INTEGER PRIMARY KEY AUTOINCREMENT, marker TEXT NOT NULL)");
});

afterAll(async () => {
  await globalClient.close();
  rmSync(dir, { recursive: true, force: true });
});

const effects = async (): Promise<number> =>
  Number((await globalClient.execute("SELECT COUNT(*) AS n FROM effect_rows")).rows[0]!.n);

function makeApp(store: DbIdempotencyStore, hooks: {
  onHandlerStarted?: () => void;
  holdHandler?: Promise<void>;
}): Hono {
  const app = new Hono();
  app.post("/v1/test/barrier", (c) =>
    withIdempotentHandling(
      c,
      { resolveIdentity: async () => ({ userId: USER }) },
      async () => {
        hooks.onHandlerStarted?.();
        await hooks.holdHandler ?? Promise.resolve();
        await globalClient.execute({
          sql: "INSERT INTO effect_rows (marker) VALUES ('side-effect')",
        });
        return { ok: true };
      },
      201,
      store,
    ),
  );
  return app;
}

const call = (app: Hono, key: string): Promise<Response> =>
  app.request("/v1/test/barrier", {
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
    // Tunggu sampai handler pertama BENAR-BENAR berjalan (claim sudah terjadi)
    for (let i = 0; i < 200 && !started; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(started).toBe(true);

    // Request kedua saat claim pasti IN_PROGRESS
    const r2 = await call(app, "key-overlap");
    expect(r2.status).toBe(409);
    expect(((await r2.json()).error ?? {}).code).toBe("IDEMPOTENCY_IN_PROGRESS");

    release();
    const r1 = await r1Promise;
    expect(r1.status).toBe(201);

    // Row-level: TEPAT SATU side-effect
    expect(await effects()).toBe(1);
  });

  it("[AC-033/0.21.3] completed expired → diproses sebagai request BARU (dua side-effect)", async () => {
    const shortTtl = new DbIdempotencyStore(globalClient, { completedTtlMs: 50 });
    const app = makeApp(shortTtl, {});
    expect((await call(app, "key-expire")).status).toBe(201);
    expect(await effects()).toBe(2); // satu dari test barrier + satu ini

    // Paksa expires_at lewat (retention selesai)
    await globalClient.execute(
      "UPDATE idempotency_keys SET expires_at = '2020-01-01T00:00:00.000Z' WHERE scope LIKE ?",
      [`${USER}%`],
    );

    const second = await call(app, "key-expire");
    expect(second.status).toBe(201);
    expect(await effects()).toBe(3); // dieksekusi ulang sebagai request baru
  });
});
