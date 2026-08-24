import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { applyGlobalMigrations, DbIdempotencyStore } from "../src/index.ts";

let dir: string;
let globalClient: Client;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kanban-idempotency-"));
  globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
});

afterAll(async () => {
  await globalClient.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("DbIdempotencyStore — goal 0.16.2", () => {
  it("[C.3] key/scope belum pernah di-put -> get() null", async () => {
    const store = new DbIdempotencyStore(globalClient);
    expect(await store.get("k-fresh", "s-fresh")).toBeNull();
  });

  it("[C.3] put() lalu get() -> hasil identik (replay respons)", async () => {
    const store = new DbIdempotencyStore(globalClient);
    const result = { status: 201, body: { data: { id: "card-1" } } };
    await store.put("k1", "s1", result);
    expect(await store.get("k1", "s1")).toEqual(result);
  });

  it("[isolasi] key sama, scope beda -> tidak saling collide", async () => {
    const store = new DbIdempotencyStore(globalClient);
    await store.put("k-shared", "scope-a", { v: "a" });
    await store.put("k-shared", "scope-b", { v: "b" });
    expect(await store.get("k-shared", "scope-a")).toEqual({ v: "a" });
    expect(await store.get("k-shared", "scope-b")).toEqual({ v: "b" });
  });

  it("[TTL] key kadaluarsa -> get() null lagi (diproses ulang seperti baru), row fisik ikut bersih", async () => {
    let clock = new Date("2026-08-24T00:00:00.000Z");
    const store = new DbIdempotencyStore(globalClient, { ttlMs: 1000, now: () => clock });
    await store.put("k-ttl", "s-ttl", { v: 1 });
    expect(await store.get("k-ttl", "s-ttl")).toEqual({ v: 1 });

    clock = new Date(clock.getTime() + 1000); // tepat di boundary TTL
    expect(await store.get("k-ttl", "s-ttl")).toBeNull();

    const row = await globalClient.execute({
      sql: "SELECT COUNT(*) AS n FROM idempotency_keys WHERE key = ? AND scope = ?",
      args: ["k-ttl", "s-ttl"],
    });
    expect(Number(row.rows[0]!.n)).toBe(0);
  });

  it("[TTL negatif] belum lewat TTL -> get() tetap mengembalikan hasil", async () => {
    let clock = new Date("2026-08-24T00:00:00.000Z");
    const store = new DbIdempotencyStore(globalClient, { ttlMs: 60_000, now: () => clock });
    await store.put("k-fresh2", "s-fresh2", { v: "still-valid" });
    clock = new Date(clock.getTime() + 59_000); // 1 detik sebelum TTL
    expect(await store.get("k-fresh2", "s-fresh2")).toEqual({ v: "still-valid" });
  });

  it("[upsert] put() dua kali dengan key+scope sama -> tidak crash, hasil TERBARU yang tersimpan", async () => {
    const store = new DbIdempotencyStore(globalClient);
    await store.put("k-dup", "s-dup", { v: 1 });
    await store.put("k-dup", "s-dup", { v: 2 });
    expect(await store.get("k-dup", "s-dup")).toEqual({ v: 2 });
  });
});
