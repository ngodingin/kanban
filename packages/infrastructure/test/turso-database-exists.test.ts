import { afterEach, describe, expect, it, vi } from "vitest";
import { databaseExists, type TursoEnv } from "../src/provisioning/turso.ts";

// Review-CL-11 (PHASE-0) — databaseExists() dulu mendeteksi 404 via
// String(error).includes("404"), rapuh terhadap ULID Project yang kebetulan
// mengandung substring "404" di path (bisa membungkam error non-404 asli
// sebagai "tidak ada"). Fix: TursoApiError.status terstruktur.

const ENV: TursoEnv = { org: "org-1", group: "grp-1", apiToken: "tok" };

function mockFetchOnce(status: number, body: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(body),
      json: () => Promise.resolve(JSON.parse(body || "{}")),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("databaseExists (Review-CL-11 fix, structured status)", () => {
  it("404 sungguhan → false", async () => {
    mockFetchOnce(404, "not found");
    await expect(databaseExists(ENV, "proj-abc")).resolves.toBe(false);
  });

  it("[regresi bug lama] nama DB mengandung '404' TAPI error sungguhan 500 → TIDAK dibungkam jadi false, tetap throw", async () => {
    mockFetchOnce(500, "internal error");
    // Nama DB memuat literal "404" — versi lama (String(error).includes("404"))
    // akan salah mengembalikan false di sini karena path/pesan ikut memuat "404".
    await expect(databaseExists(ENV, "proj-404-abc")).rejects.toThrow();
  });

  it("403 (bukan 404) → tetap throw, tidak ditelan jadi false", async () => {
    mockFetchOnce(403, "forbidden");
    await expect(databaseExists(ENV, "proj-xyz")).rejects.toThrow();
  });

  it("200 → true", async () => {
    mockFetchOnce(200, JSON.stringify({ database: { Hostname: "h" } }));
    await expect(databaseExists(ENV, "proj-ok")).resolves.toBe(true);
  });
});
