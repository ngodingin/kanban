import type { Client } from "@libsql/client";
import { ulid } from "ulid";

/** C.3 — TTL "wajar" default 24 jam; boleh di-override (deterministik untuk test). */
export const IDEMPOTENCY_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface DbIdempotencyStoreOptions {
  ttlMs?: number;
  /** Injeksi waktu untuk determinisme test — default `() => new Date()`. */
  now?: () => Date;
}

/**
 * IdempotencyStore DB-backed di Global DB (TASK-0.16, C.3) — check WAJIB
 * bisa dilakukan SEBELUM Project DB ter-resolve di pipeline, dan berlaku
 * juga untuk mutasi Global DB murni (create Project, Invitation).
 *
 * Sengaja TIDAK `implements IdempotencyStore` dari `@kanban/contracts` —
 * `infrastructure` tidak depend ke `contracts` (arah dependency: `apps/api`
 * -> `infrastructure`+`contracts`, bukan sebaliknya). Shape method (`get`/
 * `put`) cocok structural typing TypeScript, cukup untuk dipakai sebagai
 * `IdempotencyStore` di titik wiring (`apps/api`) tanpa import literal.
 */
export class DbIdempotencyStore {
  private readonly globalClient: Client;
  private readonly ttlMs: number;
  private readonly now: () => Date;

  constructor(globalClient: Client, opts: DbIdempotencyStoreOptions = {}) {
    this.globalClient = globalClient;
    this.ttlMs = opts.ttlMs ?? IDEMPOTENCY_DEFAULT_TTL_MS;
    this.now = opts.now ?? (() => new Date());
  }

  async get(key: string, scope: string): Promise<unknown | null> {
    const row = await this.globalClient.execute({
      sql: "SELECT result, created_at FROM idempotency_keys WHERE key = ? AND scope = ? LIMIT 1",
      args: [key, scope],
    });
    const found = row.rows[0];
    if (!found) return null;

    const createdAtMs = Date.parse(String(found.created_at));
    if (this.now().getTime() - createdAtMs >= this.ttlMs) {
      // Kadaluarsa — lazy cleanup, perlakukan seperti tidak pernah ada
      // (Test TASK-0.16: "Key kadaluarsa → request diproses ulang seperti baru").
      await this.globalClient.execute({
        sql: "DELETE FROM idempotency_keys WHERE key = ? AND scope = ?",
        args: [key, scope],
      });
      return null;
    }

    return JSON.parse(String(found.result));
  }

  async put(key: string, scope: string, result: unknown): Promise<void> {
    await this.globalClient.execute({
      sql: `INSERT INTO idempotency_keys (id, key, scope, result, created_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (key, scope) DO UPDATE SET result = excluded.result, created_at = excluded.created_at`,
      args: [ulid().toLowerCase(), key, scope, JSON.stringify(result), this.now().toISOString()],
    });
  }
}
