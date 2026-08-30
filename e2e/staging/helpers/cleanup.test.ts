import { describe, expect, it } from "vitest";
import { assertCleanupSuccess, type CleanupResult } from "./cleanup-core.ts";

// TASK-7.16.1d — Cleanup per-test: fail-hard pada kegagalan.
// Reference: [03-ENG A.14], Review-CL-18
// Test positif + negatif sesuai kaidah [AGENTS.md §8].

describe("TASK-7.16.1d — assertCleanupSuccess", () => {
  it("tidak throw jika sign-out 200 dan session null", () => {
    const result: CleanupResult = { signOutStatus: 200, sessionAfterSignOut: false };
    expect(() => assertCleanupSuccess(result)).not.toThrow();
  });

  it("[negatif] throw jika sign-out bukan 200", () => {
    const result: CleanupResult = { signOutStatus: 403, sessionAfterSignOut: false };
    expect(() => assertCleanupSuccess(result)).toThrow(/sign-out mengembalikan 403/);
  });

  it("[negatif] throw jika sign-out 500", () => {
    const result: CleanupResult = { signOutStatus: 500, sessionAfterSignOut: false };
    expect(() => assertCleanupSuccess(result)).toThrow(/sign-out mengembalikan 500/);
  });

  it("[negatif] throw jika sign-out 401", () => {
    const result: CleanupResult = { signOutStatus: 401, sessionAfterSignOut: false };
    expect(() => assertCleanupSuccess(result)).toThrow(/sign-out mengembalikan 401/);
  });

  it("[negatif] throw jika session masih aktif setelah sign-out", () => {
    const result: CleanupResult = { signOutStatus: 200, sessionAfterSignOut: true };
    expect(() => assertCleanupSuccess(result)).toThrow(/session masih aktif/);
  });

  it("[negatif] throw jika sign-out gagal DAN session masih aktif", () => {
    const result: CleanupResult = { signOutStatus: 403, sessionAfterSignOut: true };
    expect(() => assertCleanupSuccess(result)).toThrow();
  });

  it("[negatif] error berisi status code yang salah", () => {
    const result: CleanupResult = { signOutStatus: 415, sessionAfterSignOut: false };
    try {
      assertCleanupSuccess(result);
      throw new Error("should have thrown");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toContain("415");
      expect(msg).toContain("sign-out");
    }
  });

  it("[negatif] error session aktif tidak membocorkan cookie", () => {
    const SECRET = "secret_cookie_value_abc123";
    const result: CleanupResult = { signOutStatus: 200, sessionAfterSignOut: true };
    try {
      assertCleanupSuccess(result);
      throw new Error("should have thrown");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).not.toContain(SECRET);
      expect(msg).toContain("session masih aktif");
    }
  });
});
