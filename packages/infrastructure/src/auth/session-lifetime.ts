import type { Client } from "@libsql/client";

/** Satu jam tanpa aksi pengguna mengakhiri sesi. */
export const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
/** Header internal dari web client; tanpa marker ini sesi tidak boleh disentuh. */
export const USER_ACTIVITY_HEADER = "x-kanban-user-activity";
export const USER_ACTIVITY_VALUE = "1";

/** Penyaring policy sebelum write touch dijalankan oleh API middleware. */
export function shouldTouchSessionAfterResponse(request: Request, status: number): boolean {
  if (status < 200 || status >= 300) return false;
  if (new URL(request.url).pathname === "/api/v1/health") return false;
  if (request.headers.get(USER_ACTIVITY_HEADER) !== USER_ACTIVITY_VALUE) return false;
  // API Key/PAT adalah credential non-session: tak boleh ikut memperpanjang
  // cookie session walaupun user kebetulan juga mengirim cookie browser.
  return !request.headers.has("authorization");
}

export interface SessionLifetime {
  lastActivityAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

/** Batas Sunday 00:00 UTC pertama yang *setelah* waktu penerbitan. */
export function nextSundayUtc(issuedAt: Date): Date {
  const boundary = new Date(issuedAt);
  boundary.setUTCHours(0, 0, 0, 0);
  const daysUntilSunday = (7 - boundary.getUTCDay()) % 7;
  boundary.setUTCDate(boundary.getUTCDate() + (daysUntilSunday === 0 ? 7 : daysUntilSunday));
  return boundary;
}

export function initialSessionLifetime(issuedAt: Date): SessionLifetime {
  const absoluteExpiresAt = nextSundayUtc(issuedAt);
  const idleExpiresAt = new Date(Math.min(issuedAt.getTime() + SESSION_IDLE_TIMEOUT_MS, absoluteExpiresAt.getTime()));
  return { lastActivityAt: issuedAt, idleExpiresAt, absoluteExpiresAt };
}

function asEpoch(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") {
    // Better Auth stores epoch seconds for SQLite integer columns;
    // detect and normalize to milliseconds when value < 10^12.
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const num = Number(value);
    if (Number.isFinite(num)) return num < 1e12 ? num * 1000 : num;
    // ISO date string — parse to epoch ms
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.getTime();
  }
  return Number.NaN;
}

/**
 * Global-DB enforcement yang terpisah dari Better Auth refresh. Conditional
 * writes membuat request paralel tidak dapat menghidupkan lagi sesi yang sudah
 * revoked atau kedaluwarsa, dan request lebih tua tidak dapat memundurkan idle
 * deadline yang sudah diperpanjang request lebih baru.
 */
export class SessionLifetimeService {
  private readonly globalClient: Client;

  constructor(globalClient: Client) {
    this.globalClient = globalClient;
  }

  async isSessionActive(sessionId: string, now = new Date()): Promise<boolean> {
    const result = await this.globalClient.execute({
      sql: "SELECT expires_at, absolute_expires_at FROM auth_sessions WHERE id = ?",
      args: [sessionId],
    });
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return false;

    const nowMs = now.getTime();
    const idleExpiresAt = asEpoch(row.expires_at);
    const absoluteExpiresAt = asEpoch(row.absolute_expires_at);
    if (Number.isFinite(idleExpiresAt) && Number.isFinite(absoluteExpiresAt)
      && nowMs < idleExpiresAt && nowMs < absoluteExpiresAt) return true;

    // Delete bukan sekadar menandai expired agar row lama tidak bisa dipakai
    // kembali oleh request paralel maupun integrasi Better Auth lain.
    // Use epoch seconds for comparison since Better Auth stores seconds in SQLite.
    const nowSec = Math.floor(nowMs / 1000);
    await this.globalClient.execute({
      sql: "DELETE FROM auth_sessions WHERE id = ? AND (expires_at <= ? OR absolute_expires_at <= ?)",
      args: [sessionId, nowSec, nowSec],
    });
    return false;
  }

  async touchAfterSuccessfulUserAction(sessionId: string, now = new Date()): Promise<boolean> {
    // Better Auth stores epoch seconds in SQLite; normalize now to seconds.
    const nowSec = Math.floor(now.getTime() / 1000);
    const candidateExpirySec = nowSec + Math.floor(SESSION_IDLE_TIMEOUT_MS / 1000);
    const result = await this.globalClient.execute({
      sql: `UPDATE auth_sessions
        SET last_activity_at = CASE WHEN last_activity_at < ? THEN ? ELSE last_activity_at END,
            expires_at = CASE
              WHEN expires_at < MIN(?, absolute_expires_at) THEN MIN(?, absolute_expires_at)
              ELSE expires_at
            END,
            updated_at = ?
        WHERE id = ? AND expires_at > ? AND absolute_expires_at > ?`,
      args: [nowSec, nowSec, candidateExpirySec, candidateExpirySec, now.toISOString(), sessionId, nowSec, nowSec],
    });
    return result.rowsAffected > 0;
  }
}
