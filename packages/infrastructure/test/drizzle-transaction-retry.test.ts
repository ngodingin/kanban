import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { describe, expect, it } from "vitest";
import { runInDrizzleWriteTransaction, TransactionBusyError } from "../src/database/transaction.ts";
function makeFlakyDb(failCount: number): {
    db: LibSQLDatabase<Record<string, never>>;
    callCount: () => number;
} {
    let calls = 0;
    const transaction = async <T,>(fn: (tx: never) => Promise<T>): Promise<T> => {
        calls++;
        if (calls <= failCount) {
            throw new Error("SQLITE_BUSY: database is locked");
        }
        return fn(undefined as never);
    };
    return { db: { transaction } as unknown as LibSQLDatabase<Record<string, never>>, callCount: () => calls };
}
describe("runInDrizzleWriteTransaction (unit, retry logic)", () => {
    it("SQLITE_BUSY sementara: retry transparan, caller hanya menerima hasil sukses", async () => {
        const { db, callCount } = makeFlakyDb(2);
        const result = await runInDrizzleWriteTransaction(db, async () => "ok", { maxRetries: 3, retryDelayMs: 1 });
        expect(result).toBe("ok");
        expect(callCount()).toBe(3);
    });
    it("SQLITE_BUSY melebihi maxRetries: caller menerima TransactionBusyError bersih, BUKAN pesan driver mentah", async () => {
        const { db } = makeFlakyDb(100);
        await expect(runInDrizzleWriteTransaction(db, async () => "ok", { maxRetries: 2, retryDelayMs: 1 })).rejects.toThrow(TransactionBusyError);
        try {
            await runInDrizzleWriteTransaction(db, async () => "ok", { maxRetries: 2, retryDelayMs: 1 });
            throw new Error("harus reject");
        }
        catch (error) {
            expect(error).toBeInstanceOf(TransactionBusyError);
            expect(String((error as Error).message)).not.toContain("SQLITE_BUSY");
        }
    });
    it("error non-busy (mis. constraint/business error): langsung propagate tanpa retry", async () => {
        let calls = 0;
        const db = {
            transaction: async () => {
                calls++;
                throw new Error("UNIQUE constraint failed: permissions.key");
            },
        } as unknown as LibSQLDatabase<Record<string, never>>;
        await expect(runInDrizzleWriteTransaction(db, async () => "ok", { maxRetries: 3, retryDelayMs: 1 })).rejects.toThrow("UNIQUE constraint failed");
        expect(calls).toBe(1);
    });
});
