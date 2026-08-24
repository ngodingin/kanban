import { randomBytes } from "node:crypto";
import type { Client } from "@libsql/client";
import { ulid } from "ulid";
export const IDEMPOTENCY_COMPLETED_TTL_MS = 24 * 60 * 60 * 1000;
export const IDEMPOTENCY_LEASE_MS = 30 * 1000;
export interface IdempotencyResponse {
    status: number;
    body: unknown;
}
export type IdempotencyClaimResult = {
    status: "claimed";
    claimToken: string;
} | {
    status: "replay";
    response: IdempotencyResponse;
} | {
    status: "conflict";
} | {
    status: "in_progress";
};
export interface DbIdempotencyStoreOptions {
    leaseMs?: number;
    completedTtlMs?: number;
    now?: () => Date;
}
interface IdempotencyRow {
    request_fingerprint: string;
    claim_token: string;
    state: "IN_PROGRESS" | "COMPLETED";
    response_status: number | null;
    result: string | null;
    lease_expires_at: string | null;
    expires_at: string | null;
}
function isUniqueConstraintError(error: unknown): boolean {
    let current: unknown = error;
    for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
        const code = (current as Error & {
            code?: unknown;
        }).code;
        if (code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT")
            return true;
        current = (current as Error & {
            cause?: unknown;
        }).cause;
    }
    return false;
}
function generateClaimToken(): string {
    return randomBytes(24).toString("base64url");
}
export class DbIdempotencyStore {
    private readonly globalClient: Client;
    private readonly leaseMs: number;
    private readonly completedTtlMs: number;
    private readonly now: () => Date;
    constructor(globalClient: Client, opts: DbIdempotencyStoreOptions = {}) {
        this.globalClient = globalClient;
        this.leaseMs = opts.leaseMs ?? IDEMPOTENCY_LEASE_MS;
        this.completedTtlMs = opts.completedTtlMs ?? IDEMPOTENCY_COMPLETED_TTL_MS;
        this.now = opts.now ?? (() => new Date());
    }
    async claim(key: string, scope: string, fingerprint: string): Promise<IdempotencyClaimResult> {
        const claimToken = generateClaimToken();
        const now = this.now();
        const leaseExpiresAt = new Date(now.getTime() + this.leaseMs).toISOString();
        const nowIso = now.toISOString();
        try {
            await this.globalClient.execute({
                sql: `INSERT INTO idempotency_keys
              (id, key, scope, request_fingerprint, claim_token, state, lease_expires_at, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', ?, ?, ?)`,
                args: [ulid().toLowerCase(), key, scope, fingerprint, claimToken, leaseExpiresAt, nowIso, nowIso],
            });
            return { status: "claimed", claimToken };
        }
        catch (error) {
            if (!isUniqueConstraintError(error))
                throw error;
            return this.claimAgainstExisting(key, scope, fingerprint, claimToken, leaseExpiresAt, now);
        }
    }
    private async claimAgainstExisting(key: string, scope: string, fingerprint: string, newClaimToken: string, newLeaseExpiresAt: string, now: Date): Promise<IdempotencyClaimResult> {
        const row = await this.readRow(key, scope);
        if (!row) {
            return this.claim(key, scope, fingerprint);
        }
        if (row.state === "COMPLETED") {
            const expired = row.expires_at !== null && Date.parse(row.expires_at) <= now.getTime();
            if (expired) {
                return this.reclaimCompleted(key, scope, fingerprint, newClaimToken, newLeaseExpiresAt, now);
            }
            if (row.request_fingerprint !== fingerprint)
                return { status: "conflict" };
            return {
                status: "replay",
                response: { status: row.response_status ?? 200, body: row.result !== null ? JSON.parse(row.result) : null },
            };
        }
        const leaseExpired = row.lease_expires_at !== null && Date.parse(row.lease_expires_at) <= now.getTime();
        if (leaseExpired) {
            return this.reclaimInProgress(key, scope, fingerprint, newClaimToken, newLeaseExpiresAt, now);
        }
        if (row.request_fingerprint !== fingerprint)
            return { status: "conflict" };
        return { status: "in_progress" };
    }
    private async reclaimInProgress(key: string, scope: string, fingerprint: string, newClaimToken: string, newLeaseExpiresAt: string, now: Date): Promise<IdempotencyClaimResult> {
        const result = await this.globalClient.execute({
            sql: `UPDATE idempotency_keys
            SET claim_token = ?, request_fingerprint = ?, lease_expires_at = ?, updated_at = ?
            WHERE key = ? AND scope = ? AND state = 'IN_PROGRESS' AND lease_expires_at <= ?`,
            args: [newClaimToken, fingerprint, newLeaseExpiresAt, now.toISOString(), key, scope, now.toISOString()],
        });
        if (result.rowsAffected === 0) {
            return this.claimAgainstExisting(key, scope, fingerprint, newClaimToken, newLeaseExpiresAt, now);
        }
        return { status: "claimed", claimToken: newClaimToken };
    }
    private async reclaimCompleted(key: string, scope: string, fingerprint: string, newClaimToken: string, newLeaseExpiresAt: string, now: Date): Promise<IdempotencyClaimResult> {
        const result = await this.globalClient.execute({
            sql: `UPDATE idempotency_keys
            SET claim_token = ?, request_fingerprint = ?, state = 'IN_PROGRESS',
                response_status = NULL, result = NULL, lease_expires_at = ?, expires_at = NULL, updated_at = ?
            WHERE key = ? AND scope = ? AND state = 'COMPLETED' AND expires_at <= ?`,
            args: [newClaimToken, fingerprint, newLeaseExpiresAt, now.toISOString(), key, scope, now.toISOString()],
        });
        if (result.rowsAffected === 0) {
            return this.claimAgainstExisting(key, scope, fingerprint, newClaimToken, newLeaseExpiresAt, now);
        }
        return { status: "claimed", claimToken: newClaimToken };
    }
    async complete(key: string, scope: string, claimToken: string, response: IdempotencyResponse): Promise<boolean> {
        const now = this.now();
        const expiresAt = new Date(now.getTime() + this.completedTtlMs).toISOString();
        const result = await this.globalClient.execute({
            sql: `UPDATE idempotency_keys
            SET state = 'COMPLETED', response_status = ?, result = ?, lease_expires_at = NULL, expires_at = ?, updated_at = ?
            WHERE key = ? AND scope = ? AND claim_token = ? AND state = 'IN_PROGRESS'`,
            args: [response.status, JSON.stringify(response.body), expiresAt, now.toISOString(), key, scope, claimToken],
        });
        return result.rowsAffected > 0;
    }
    async release(key: string, scope: string, claimToken: string): Promise<void> {
        await this.globalClient.execute({
            sql: `DELETE FROM idempotency_keys WHERE key = ? AND scope = ? AND claim_token = ? AND state = 'IN_PROGRESS'`,
            args: [key, scope, claimToken],
        });
    }
    private async readRow(key: string, scope: string): Promise<IdempotencyRow | null> {
        const row = await this.globalClient.execute({
            sql: `SELECT request_fingerprint, claim_token, state, response_status, result, lease_expires_at, expires_at
            FROM idempotency_keys WHERE key = ? AND scope = ? LIMIT 1`,
            args: [key, scope],
        });
        const found = row.rows[0] as unknown as IdempotencyRow | undefined;
        return found ?? null;
    }
}
