import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { describe, expect, it } from "vitest";
import { runInDrizzleWriteTransaction, TransactionBusyError } from "../src/database/transaction.ts";

// Goal 1.12.1 (Review-CL-12 Temuan Baru 1): db.transaction() Drizzle di
// project-admin.ts/provision.ts sekarang lewat runInDrizzleWriteTransaction,
// bukan dipanggil mentah — SQLITE_BUSY dari write-lock contention TIDAK boleh
// bocor sebagai pesan driver mentah ke caller.
//
// Simulasi busy dibuat via fake db (bukan 2 Client nyata ke 1 file lokal):
// dicoba dengan 2 koneksi lokal sungguhan (CL-65) dan libsql embedded lokal
// menahan write-lock antar-koneksi dalam proses yang sama secara tidak
// realistis (satu sisi retry tanpa batas waktu wajar) — perilaku itu quirk
// driver lokal, bukan representasi kontensi Turso remote (HTTP, per-request)
// yang jadi target goal ini, jadi test itu dibuang karena bisa flaky/menyesatkan.

function makeFlakyDb(failCount: number): { db: LibSQLDatabase<Record<string, never>>; callCount: () => number } {
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
    await expect(
      runInDrizzleWriteTransaction(db, async () => "ok", { maxRetries: 2, retryDelayMs: 1 }),
    ).rejects.toThrow(TransactionBusyError);
    try {
      await runInDrizzleWriteTransaction(db, async () => "ok", { maxRetries: 2, retryDelayMs: 1 });
      throw new Error("harus reject");
    } catch (error) {
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
    await expect(runInDrizzleWriteTransaction(db, async () => "ok", { maxRetries: 3, retryDelayMs: 1 })).rejects.toThrow(
      "UNIQUE constraint failed",
    );
    expect(calls).toBe(1);
  });
});
