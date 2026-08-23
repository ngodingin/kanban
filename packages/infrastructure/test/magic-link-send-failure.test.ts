import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { applyGlobalMigrations } from "../src/database/migrate.ts";
import { createAuth } from "../src/auth/auth.ts";

// TASK-0.14 (CL-64/CL-65) — kegagalan sendMagicLink (mis. AUTH_RESEND_KEY
// invalid di provider — dikonfirmasi via log runtime Vercel production
// sungguhan, bukan tebakan) sebelumnya lolos sebagai unhandled rejection
// dari plugin magic-link Better Auth, membuat request berakhir crash 500
// body kosong (bukan JSON error envelope kita, bukan pula respons sukses
// standar Better Auth). Regresi ini murni in-process — TIDAK butuh Vercel/
// Turso nyata untuk direproduksi, cukup sendMagicLink yang reject.

const BASE_URL = "http://localhost:8787";

let dir: string;
let globalClient: Client;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kanban-magic-link-failure-"));
  globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
});

afterAll(async () => {
  await globalClient.close();
  rmSync(dir, { recursive: true, force: true });
});

const requestMagicLink = (auth: ReturnType<typeof createAuth>, email: string): Promise<Response> =>
  auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }),
  );

describe("sendMagicLink gagal (goal 0.14.2) — request TIDAK boleh crash 500 kosong", () => {
  it("[reproduksi akar penyebab, log Vercel production 2026-08-23T14:01:14Z] sendMagicLink reject -> endpoint TETAP 200, bukan 500/exception", async () => {
    const auth = createAuth({
      globalClient,
      baseUrl: BASE_URL,
      secret: "x".repeat(32),
      // Simulasi PERSIS error asli dari log runtime production: Resend
      // menolak AUTH_RESEND_KEY yang invalid.
      sendMagicLink: async () => {
        throw new Error("Resend gagal: API key is invalid");
      },
    });

    const res = await requestMagicLink(auth, "guarded-fail@example.com");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status?: boolean };
    // Anti-enumeration (03-ENG A.14): body sukses standar, TIDAK membocorkan
    // bahwa pengiriman email sebenarnya gagal di baliknya.
    expect(json.status).toBe(true);
  });

  it("[observability] kegagalan tetap ter-log ke console.error (bukan disembunyikan total)", async () => {
    const errors: unknown[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    try {
      const auth = createAuth({
        globalClient,
        baseUrl: BASE_URL,
        secret: "x".repeat(32),
        sendMagicLink: async () => {
          throw new Error("Resend gagal: API key is invalid");
        },
      });
      await requestMagicLink(auth, "guarded-fail-2@example.com");
    } finally {
      console.error = originalError;
    }
    expect(errors.some((call) => String(call[0]).includes("Resend gagal: API key is invalid"))).toBe(true);
  });

  it("[regresi] sendMagicLink SUKSES tetap berjalan seperti biasa (guard tidak mengubah jalur happy-path)", async () => {
    const sent: string[] = [];
    const auth = createAuth({
      globalClient,
      baseUrl: BASE_URL,
      secret: "x".repeat(32),
      sendMagicLink: async (data) => {
        sent.push(data.email);
      },
    });
    const res = await requestMagicLink(auth, "guarded-ok@example.com");
    expect(res.status).toBe(200);
    expect(sent).toEqual(["guarded-ok@example.com"]);
  });
});
