import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const css = readFileSync(join(import.meta.dirname, "../src/index.css"), "utf8");
const pkg = JSON.parse(
  readFileSync(join(import.meta.dirname, "../package.json"), "utf8"),
) as { dependencies: Record<string, string> };

describe("TASK-7.2.2 — tipografi Inter + skala heading/body/small (§2.2)", () => {
  test("positif: Inter self-host exact-pin + font-sans token terdaftar", () => {
    expect(css).toContain('@import "@fontsource-variable/inter"');
    expect(css).toContain('--font-sans: "Inter Variable"');
    expect(pkg.dependencies["@fontsource-variable/inter"]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("positif: skala §2.2 lengkap (H1 32/40 Bold · H2 24/32 SemiBold · H3 20/28 SemiBold · Body 14/20 · Small 12/16)", () => {
    const required = [
      "--text-heading-1: 2rem;",
      "--text-heading-1--line-height: 2.5rem;",
      "--text-heading-1--font-weight: 700;",
      "--text-heading-2: 1.5rem;",
      "--text-heading-2--line-height: 2rem;",
      "--text-heading-2--font-weight: 600;",
      "--text-heading-3: 1.25rem;",
      "--text-heading-3--line-height: 1.75rem;",
      "--text-body: 0.875rem;",
      "--text-body--line-height: 1.25rem;",
      "--text-small: 0.75rem;",
      "--text-small--line-height: 1rem;",
    ];
    for (const needle of required) expect(css).toContain(needle);
  });

  test("positif: body memakai font-sans", () => {
    expect(css).toContain("bg-background font-sans text-foreground");
  });
});

describe("TASK-7.2.3 — radius/density per-peran, light+dark (§2.3)", () => {
  test("positif: radius sm<md<lg dipetakan per-peran dengan base density tinggi (0.5rem)", () => {
    expect(css).toContain("--radius: 0.5rem;");
    expect(css).toContain("--radius-sm: calc(var(--radius) - 4px);"); // controls
    expect(css).toContain("--radius-md: var(--radius);"); // cards
    expect(css).toContain("--radius-lg: calc(var(--radius) + 4px);"); // dialogs/sheets
  });

  test("positif: blok .dark tetap tersedia (light+dark)", () => {
    expect(css).toContain(".dark {");
  });

  test("negatif: tidak ada radius hard-coded di luar token pada komponen (src/** rounded-[...])", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(tsx|ts)$/.test(entry)) continue;
        if (/rounded-\[/.test(readFileSync(full, "utf8"))) offenders.push(entry);
      }
    };
    walk(join(import.meta.dirname, "../src"));
    expect(offenders).toEqual([]);
  });
});
