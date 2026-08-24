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
describe("DbIdempotencyStore — TASK-0.21 state machine atomic claim", () => {
    it("[C.3 poin 3] key/scope baru -> claimed, claimToken unik", async () => {
        const store = new DbIdempotencyStore(globalClient);
        const result = await store.claim("k1", "s1", "fp-a");
        expect(result.status).toBe("claimed");
        expect(result.status === "claimed" && result.claimToken.length).toBeGreaterThan(10);
    });
    it("[C.3 poin 5] fingerprint SAMA, masih in-flight -> in_progress, handler TIDAK dijalankan ulang", async () => {
        const store = new DbIdempotencyStore(globalClient);
        await store.claim("k2", "s1", "fp-a");
        const second = await store.claim("k2", "s1", "fp-a");
        expect(second.status).toBe("in_progress");
    });
    it("[C.3 poin 4] fingerprint BEDA, masih in-flight -> conflict", async () => {
        const store = new DbIdempotencyStore(globalClient);
        await store.claim("k3", "s1", "fp-a");
        const second = await store.claim("k3", "s1", "fp-b");
        expect(second.status).toBe("conflict");
    });
    it("[C.3 poin 6] complete() lalu claim key+fingerprint SAMA -> replay respons identik", async () => {
        const store = new DbIdempotencyStore(globalClient);
        const claimed = await store.claim("k4", "s1", "fp-a");
        expect(claimed.status).toBe("claimed");
        const claimToken = claimed.status === "claimed" ? claimed.claimToken : "";
        const completed = await store.complete("k4", "s1", claimToken, { status: 201, body: { id: "x1" } });
        expect(completed).toBe(true);
        const replay = await store.claim("k4", "s1", "fp-a");
        expect(replay).toEqual({ status: "replay", response: { status: 201, body: { id: "x1" } } });
    });
    it("[C.3 poin 4] completed lalu claim fingerprint BEDA -> conflict (bukan replay)", async () => {
        const store = new DbIdempotencyStore(globalClient);
        const claimed = await store.claim("k5", "s1", "fp-a");
        const claimToken = claimed.status === "claimed" ? claimed.claimToken : "";
        await store.complete("k5", "s1", claimToken, { status: 200, body: { v: 1 } });
        const result = await store.claim("k5", "s1", "fp-DIFFERENT");
        expect(result.status).toBe("conflict");
    });
    it("[C.3 poin 7] release() setelah kegagalan -> retry berikutnya diproses sebagai request BARU", async () => {
        const store = new DbIdempotencyStore(globalClient);
        const claimed = await store.claim("k6", "s1", "fp-a");
        const claimToken = claimed.status === "claimed" ? claimed.claimToken : "";
        await store.release("k6", "s1", claimToken);
        const retry = await store.claim("k6", "s1", "fp-a");
        expect(retry.status).toBe("claimed");
    });
    it("[stale owner] complete() dengan claimToken SALAH -> false, TIDAK menimpa state", async () => {
        const store = new DbIdempotencyStore(globalClient);
        const claimed = await store.claim("k7", "s1", "fp-a");
        expect(claimed.status).toBe("claimed");
        const ok = await store.complete("k7", "s1", "token-salah-total", { status: 200, body: {} });
        expect(ok).toBe(false);
        const stillInProgress = await store.claim("k7", "s1", "fp-a");
        expect(stillInProgress.status).toBe("in_progress");
    });
    it("[stale owner] release() dengan claimToken SALAH -> no-op, TIDAK menghapus claim orang lain", async () => {
        const store = new DbIdempotencyStore(globalClient);
        await store.claim("k8", "s1", "fp-a");
        await store.release("k8", "s1", "token-salah-total");
        const stillThere = await store.claim("k8", "s1", "fp-a");
        expect(stillThere.status).toBe("in_progress");
    });
    it("[isolasi] key sama, scope beda -> tidak saling collide", async () => {
        const store = new DbIdempotencyStore(globalClient);
        const a = await store.claim("k-shared", "scope-a", "fp-a");
        const b = await store.claim("k-shared", "scope-b", "fp-b");
        expect(a.status).toBe("claimed");
        expect(b.status).toBe("claimed");
    });
    it("[C.3 poin 8, reclaim IN_PROGRESS] lease expired -> direclaim otomatis, token dirotasi", async () => {
        let clock = new Date("2026-08-24T00:00:00.000Z");
        const store = new DbIdempotencyStore(globalClient, { leaseMs: 1000, now: () => clock });
        const first = await store.claim("k9", "s1", "fp-a");
        const firstToken = first.status === "claimed" ? first.claimToken : "";
        clock = new Date(clock.getTime() + 1000);
        const reclaimed = await store.claim("k9", "s1", "fp-b");
        expect(reclaimed.status).toBe("claimed");
        const reclaimedToken = reclaimed.status === "claimed" ? reclaimed.claimToken : "";
        expect(reclaimedToken).not.toBe(firstToken);
        const staleComplete = await store.complete("k9", "s1", firstToken, { status: 200, body: {} });
        expect(staleComplete).toBe(false);
        await store.release("k9", "s1", firstToken);
        const stillOwnedByReclaimer = await store.claim("k9", "s1", "fp-b");
        expect(stillOwnedByReclaimer.status).toBe("in_progress");
    });
    it("[C.3 poin 8, completed TTL] result kadaluarsa (>TTL) -> diproses sebagai request BARU", async () => {
        let clock = new Date("2026-08-24T00:00:00.000Z");
        const store = new DbIdempotencyStore(globalClient, { completedTtlMs: 1000, now: () => clock });
        const claimed = await store.claim("k10", "s1", "fp-a");
        const claimToken = claimed.status === "claimed" ? claimed.claimToken : "";
        await store.complete("k10", "s1", claimToken, { status: 200, body: { v: "old" } });
        clock = new Date(clock.getTime() + 1000);
        const afterExpiry = await store.claim("k10", "s1", "fp-a");
        expect(afterExpiry.status).toBe("claimed");
    });
    it("[AC-034, concurrency SUNGGUHAN] dua claim() PARALEL key+scope+fingerprint sama -> TEPAT SATU claimed, lainnya in_progress", async () => {
        const store = new DbIdempotencyStore(globalClient);
        const [r1, r2] = await Promise.all([
            store.claim("k-concurrent", "s1", "fp-same"),
            store.claim("k-concurrent", "s1", "fp-same"),
        ]);
        const statuses = [r1.status, r2.status].sort();
        expect(statuses).toEqual(["claimed", "in_progress"]);
    });
    it("[AC-034, concurrency SUNGGUHAN] dua claim() PARALEL key+scope sama, fingerprint BEDA -> tepat satu claimed, lainnya conflict", async () => {
        const store = new DbIdempotencyStore(globalClient);
        const [r1, r2] = await Promise.all([
            store.claim("k-concurrent-diff", "s1", "fp-x"),
            store.claim("k-concurrent-diff", "s1", "fp-y"),
        ]);
        const statuses = [r1.status, r2.status].sort();
        expect(statuses).toEqual(["claimed", "conflict"]);
    });
});
