import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CANONICAL_ORIGIN, assertStagingOrigin, testNamespace } from "./staging-core.ts";

// TASK-7.16.1a — Hard gate konfigurasi staging harness.
// Reference: [03-ENG D.7] — canonical origin dikunci, bypass dari environment.
// Test positif + negatif sesuai kaidah [AGENTS.md §8].

describe("TASK-7.16.1a — CANONICAL_ORIGIN", () => {
  it("CANONICAL_ORIGIN adalah canonical origin staging", () => {
    expect(CANONICAL_ORIGIN).toBe("https://kanban-ngodingin.vercel.app");
  });

  it("CANONICAL_ORIGIN menggunakan HTTPS", () => {
    expect(CANONICAL_ORIGIN).toMatch(/^https:\/\//);
  });
});

describe("TASK-7.16.1a — assertStagingOrigin", () => {
  it("menerima canonical origin staging", () => {
    expect(() => assertStagingOrigin(CANONICAL_ORIGIN)).not.toThrow();
  });

  it("menerima canonical origin dengan path tambahan", () => {
    expect(() => assertStagingOrigin(`${CANONICAL_ORIGIN}/projects/test`)).not.toThrow();
  });

  it("[negatif] menolak origin kosong", () => {
    expect(() => assertStagingOrigin("")).toThrow("Invalid URL");
  });

  it("[negatif] menolak localhost", () => {
    expect(() => assertStagingOrigin("http://localhost:3000")).toThrow("Origin tidak diizinkan");
  });

  it("[negatif] menolak HTTP (bukan HTTPS)", () => {
    expect(() => assertStagingOrigin("http://kanban-ngodingin.vercel.app")).toThrow("Origin tidak diizinkan");
  });

  it("[negatif] menolak domain production", () => {
    expect(() => assertStagingOrigin("https://kanban.ngodingin.xyz")).toThrow("Origin tidak diizinkan");
  });

  it("[negatif] menolak domain acak", () => {
    expect(() => assertStagingOrigin("https://evil.example.com")).toThrow("Origin tidak diizinkan");
  });

  it("[negatif] menolak subdomain mirip", () => {
    expect(() => assertStagingOrigin("https://fake-kanban-ngodingin.vercel.app")).toThrow("Origin tidak diizinkan");
  });
});

describe("TASK-7.16.1a — testNamespace", () => {
  it("menghasilkan namespace unik dengan prefix e2e-", () => {
    const ns = testNamespace();
    expect(ns).toMatch(/^e2e-ts-/);
  });

  it("idempotent dalam satu run (cached)", () => {
    const ns1 = testNamespace();
    const ns2 = testNamespace();
    expect(ns1).toBe(ns2);
  });
});

describe("TASK-7.16.1a — single source of truth", () => {
  it("playwright.staging.config.ts import CANONICAL_ORIGIN dari staging-core", () => {
    const configPath = resolve(import.meta.dirname, "../../../playwright.staging.config.ts");
    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain('import { CANONICAL_ORIGIN } from "./e2e/staging/helpers/staging-core.ts"');
    expect(content).not.toContain("kanban-ngodingin.vercel.app");
  });
});

describe("TASK-7.16.1a — no secrets in exports", () => {
  it("tidak ada secret dalam output module", () => {
    const exports = [CANONICAL_ORIGIN, "assertStagingOrigin", "testNamespace"];
    const forbidden = ["SECRET", "KEY", "TOKEN", "PASSWORD"];
    for (const val of exports) {
      for (const f of forbidden) {
        expect(val.toUpperCase()).not.toContain(f);
      }
    }
  });
});

describe("TASK-7.16.1e — five-flow test harness contract", () => {
  it("spec memuat tepat lima test dalam describe Staging: Magic Link login", () => {
    const specContent = readFileSync(
      resolve(__dirname, "../magic-link-login.spec.ts"),
      "utf-8",
    );
    const testMatches = specContent.match(/\btest\(/g) ?? [];
    expect(testMatches.length, "spec harus memiliki tepat 5 test").toBe(5);
  });

  it("lima flow: origin allowlist, sign-in+verify+sign-out, token salah, no cookie, regression", () => {
    const specContent = readFileSync(
      resolve(__dirname, "../magic-link-login.spec.ts"),
      "utf-8",
    );
    const flowNames = [
      "origin allowlist",
      "magic link sign-in",
      "token salah",
      "get-session tanpa cookie",
      "regression",
    ];
    for (const name of flowNames) {
      expect(specContent, `flow "${name}" harus ada`).toContain(name);
    }
  });

  it("setiap flow yang melakukan login harus punya cleanup di finally block", () => {
    const specContent = readFileSync(
      resolve(__dirname, "../magic-link-login.spec.ts"),
      "utf-8",
    );
    const finallyBlocks = (specContent.match(/\bfinally\s*\{/g) ?? []).length;
    const loginFlows = (specContent.match(/page\.goto\(.*STAGING_ORIGIN.*\/login/g) ?? []).length;
    expect(finallyBlocks, "setiap flow login harus punya finally cleanup").toBeGreaterThanOrEqual(loginFlows);
  });

  it("cleanup harus gunakan assertCleanupSuccess (fail-hard)", () => {
    const specContent = readFileSync(
      resolve(__dirname, "../magic-link-login.spec.ts"),
      "utf-8",
    );
    const cleanupUses = (specContent.match(/assertCleanupSuccess/g) ?? []).length;
    expect(cleanupUses, "assertCleanupSuccess harus dipanggil di setiap cleanup").toBeGreaterThanOrEqual(2);
  });

  it("reporter = list untuk output ringkas", () => {
    const configContent = readFileSync(
      resolve(__dirname, "../../../playwright.staging.config.ts"),
      "utf-8",
    );
    expect(configContent).toContain('"list"');
  });
});
