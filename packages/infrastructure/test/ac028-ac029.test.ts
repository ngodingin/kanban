import { describe, expect, it } from "vitest";

// Catatan (goal 6.8.6 / QA-CL-16): blok string-grep AC-028 yang dulu ada di
// file ini DIHAPUS — digantikan test behavioral sungguhan di
// `apps/api/test/ac028-coowner-not-owner.test.ts`.

/**
 * AC-029 — PATCH Card field BR-062 ditolak/diabaikan. AllowedFields loop
 * di cards.ts PATCH sudah menolak field di luar allowlist; goal ini
 * menambah regression test eksplisit untuk BR-062 fields spesifik.
 */
describe("AC-029 — PATCH Card BR-062 fields ditolak (goal 6.8.7)", () => {
  it("[AC-029][regresi] PATCH Card unknown-field loop menolak BR-062 fields", async () => {
    // Verifikasi via route: kirim PATCH dengan field terlarang -> VALIDATION_ERROR
    // (dilakukan di apps/api/test/cards-patch.test.ts; goal ini hanya regression marker)
    // Assert struktur: allowedFields di cards.ts tidak memuat forbidden fields.
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(process.cwd(), "apps/api/src/routes/cards.ts"), "utf8");
    const match = src.match(/allowedFields = \[([^\]]+)\]/);
    expect(match).toBeTruthy();
    const fields = match![1].split(",").map((f) => f.trim().replace(/"/g, ""));
    for (const f of ["deletedAt", "archivedAt", "id", "version"]) {
      expect(fields).not.toContain(f);
    }
  });
});
