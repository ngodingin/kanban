import type { Client, InArgs, ResultSet, Transaction } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
export const MAX_BUSY_RETRIES = 3;
export const BUSY_RETRY_DELAY_MS = 50;
export interface Tx {
    execute(sql: string, args?: InArgs): Promise<ResultSet>;
}
export class TransactionBusyError extends Error {
}
async function delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}
function isBusy(error: unknown): boolean {
    const err = error as {
        code?: unknown;
        cause?: {
            code?: unknown;
        };
    };
    if (err?.code === "SQLITE_BUSY" || err?.cause?.code === "SQLITE_BUSY") {
        return true;
    }
    return String(err?.cause ?? error).includes("SQLITE_BUSY");
}
export async function runInWriteTransaction<T>(client: Client, fn: (tx: Tx) => Promise<T>, options: {
    maxRetries?: number;
    retryDelayMs?: number;
} = {}): Promise<T> {
    const maxRetries = options.maxRetries ?? MAX_BUSY_RETRIES;
    const retryDelayMs = options.retryDelayMs ?? BUSY_RETRY_DELAY_MS;
    for (let attempt = 0;; attempt++) {
        let tx: Transaction | undefined;
        try {
            tx = await client.transaction("write");
            const result = await fn({ execute: (sql, args) => tx!.execute({ sql, args }) });
            await tx.commit();
            return result;
        }
        catch (error) {
            await tx?.rollback().catch(() => undefined);
            if (isBusy(error) && attempt < maxRetries) {
                await delay(retryDelayMs);
                continue;
            }
            if (isBusy(error) && attempt >= maxRetries) {
                throw new TransactionBusyError(`transaksi sibuk setelah ${maxRetries + 1} percobaan`);
            }
            throw error;
        }
    }
}
export async function runInDrizzleWriteTransaction<TSchema extends Record<string, unknown>, T>(db: LibSQLDatabase<TSchema>, fn: Parameters<LibSQLDatabase<TSchema>["transaction"]>[0], options: {
    maxRetries?: number;
    retryDelayMs?: number;
} = {}): Promise<T> {
    const maxRetries = options.maxRetries ?? MAX_BUSY_RETRIES;
    const retryDelayMs = options.retryDelayMs ?? BUSY_RETRY_DELAY_MS;
    for (let attempt = 0;; attempt++) {
        try {
            return (await db.transaction(fn)) as T;
        }
        catch (error) {
            if (isBusy(error) && attempt < maxRetries) {
                await delay(retryDelayMs);
                continue;
            }
            if (isBusy(error) && attempt >= maxRetries) {
                throw new TransactionBusyError(`transaksi sibuk setelah ${maxRetries + 1} percobaan`);
            }
            throw error;
        }
    }
}
