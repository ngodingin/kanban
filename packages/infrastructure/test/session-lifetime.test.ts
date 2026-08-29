import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { applyGlobalMigrations, createAuth, initialSessionLifetime, nextSundayUtc, SESSION_IDLE_TIMEOUT_MS, SessionLifetimeService, shouldTouchSessionAfterResponse, USER_ACTIVITY_HEADER, USER_ACTIVITY_VALUE } from "../src/index.ts";

let dir: string;
let client: Client;
let lifetime: SessionLifetimeService;

async function insertSession(id: string, lastActivityAt: Date, absoluteExpiresAt: Date, expiresAt = new Date(lastActivityAt.getTime() + SESSION_IDLE_TIMEOUT_MS)): Promise<void> {
  await client.execute({
    sql: `INSERT INTO auth_sessions
      (id, user_id, token, expires_at, last_activity_at, absolute_expires_at, created_at, updated_at)
      VALUES (?, 'user-1', ?, ?, ?, ?, ?, ?)`,
    args: [id, `token-${id}`, expiresAt.getTime(), lastActivityAt.getTime(), absoluteExpiresAt.getTime(), lastActivityAt.toISOString(), lastActivityAt.toISOString()],
  });
}

async function row(id: string): Promise<Record<string, unknown> | undefined> {
  const result = await client.execute({ sql: "SELECT * FROM auth_sessions WHERE id = ?", args: [id] });
  return result.rows[0] as Record<string, unknown> | undefined;
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kanban-session-lifetime-"));
  client = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(client);
  await client.execute({
    sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES ('user-1', 'user-1@test.local', 1, 'User', ?, ?)",
    args: ["2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"],
  });
  lifetime = new SessionLifetimeService(client);
});

afterAll(async () => {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("TASK-7.15.0 session lifetime — SOT 4.3.0", () => {
  it("[SEC-SESSION] menetapkan hard cap pada Sunday 00:00 UTC pertama setelah sesi diterbitkan", () => {
    expect(nextSundayUtc(new Date("2026-08-29T23:59:59.999Z")).toISOString()).toBe("2026-08-30T00:00:00.000Z");
    // Tepat di boundary tetap memilih Sunday berikutnya: absolute lifetime
    // harus selalu boundary pertama yang *setelah* issue time.
    expect(nextSundayUtc(new Date("2026-08-30T00:00:00.000Z")).toISOString()).toBe("2026-09-06T00:00:00.000Z");
  });

  it("[SEC-SESSION] idle deadline awal adalah satu jam, dibatasi hard cap", () => {
    const ordinary = initialSessionLifetime(new Date("2026-08-28T10:00:00.000Z"));
    expect(ordinary.idleExpiresAt.toISOString()).toBe("2026-08-28T11:00:00.000Z");
    const nearBoundary = initialSessionLifetime(new Date("2026-08-29T23:30:00.000Z"));
    expect(nearBoundary.idleExpiresAt.toISOString()).toBe("2026-08-30T00:00:00.000Z");
  });

  it("[SEC-SESSION] aksi pengguna sukses memperpanjang idle dari menit ke-45 tanpa mengubah absolute deadline", async () => {
    const issued = new Date("2026-08-28T10:00:00.000Z");
    const absolute = nextSundayUtc(issued);
    await insertSession("touch-45", issued, absolute);
    expect(await lifetime.touchAfterSuccessfulUserAction("touch-45", new Date("2026-08-28T10:45:00.000Z"))).toBe(true);
    const saved = await row("touch-45");
    expect(saved?.last_activity_at).toBe(new Date("2026-08-28T10:45:00.000Z").getTime());
    expect(saved?.expires_at).toBe(new Date("2026-08-28T11:45:00.000Z").getTime());
    expect(saved?.absolute_expires_at).toBe(absolute.getTime());
  });

  it("[SEC-SESSION negatif] polling/refetch, request gagal, health, dan API Key/PAT tidak memenuhi syarat touch", () => {
    const action = new Request("https://kanban.test/api/v1/projects", { headers: { [USER_ACTIVITY_HEADER]: USER_ACTIVITY_VALUE } });
    expect(shouldTouchSessionAfterResponse(action, 200)).toBe(true);
    expect(shouldTouchSessionAfterResponse(new Request("https://kanban.test/api/v1/projects"), 200)).toBe(false);
    expect(shouldTouchSessionAfterResponse(action, 401)).toBe(false);
    expect(shouldTouchSessionAfterResponse(new Request("https://kanban.test/api/v1/health", { headers: { [USER_ACTIVITY_HEADER]: USER_ACTIVITY_VALUE } }), 200)).toBe(false);
    expect(shouldTouchSessionAfterResponse(new Request("https://kanban.test/api/v1/projects", {
      headers: { [USER_ACTIVITY_HEADER]: USER_ACTIVITY_VALUE, authorization: "Bearer api-key-or-pat" },
    }), 200)).toBe(false);
  });

  it("[SEC-SESSION] aksi menjelang boundary dibatasi Sunday 00:00 UTC", async () => {
    const issued = new Date("2026-08-29T23:00:00.000Z");
    const absolute = nextSundayUtc(issued);
    await insertSession("touch-boundary", issued, absolute);
    expect(await lifetime.touchAfterSuccessfulUserAction("touch-boundary", new Date("2026-08-29T23:45:00.000Z"))).toBe(true);
    expect((await row("touch-boundary"))?.expires_at).toBe(absolute.getTime());
  });

  it("[SEC-SESSION] menolak dan menghapus sesi idle yang sudah lewat satu jam", async () => {
    const issued = new Date("2026-08-28T10:00:00.000Z");
    await insertSession("idle-expired", issued, nextSundayUtc(issued));
    expect(await lifetime.isSessionActive("idle-expired", new Date("2026-08-28T11:00:00.000Z"))).toBe(false);
    expect(await row("idle-expired")).toBeUndefined();
  });

  it("[SEC-SESSION] menolak sesi pada absolute boundary sekalipun idle deadline belum lewat", async () => {
    const issued = new Date("2026-08-29T23:30:00.000Z");
    const absolute = nextSundayUtc(issued);
    await insertSession("absolute-expired", issued, absolute, absolute);
    expect(await lifetime.isSessionActive("absolute-expired", absolute)).toBe(false);
    expect(await row("absolute-expired")).toBeUndefined();
  });

  it("[SEC-SESSION] Better Auth menerbitkan sesi baru dengan field lifetime dan tanpa auto-refresh", async () => {
    const auth = createAuth({ globalClient: client, baseUrl: "http://localhost:3000", secret: "x".repeat(32) });
    const ctx = await auth.$context;
    const session = await ctx.internalAdapter.createSession("user-1", false);
    const saved = await row(session.id);
    expect(saved?.last_activity_at).toBeDefined();
    expect(saved?.absolute_expires_at).toBeDefined();
    expect(Number(saved?.expires_at)).toBeLessThanOrEqual(Number(saved?.absolute_expires_at));
    expect(auth.options.session?.disableSessionRefresh).toBe(true);
    expect(auth.options.session?.expiresIn).toBe(60 * 60);
  });
});
