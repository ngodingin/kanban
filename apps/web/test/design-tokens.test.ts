import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const webRoot = join(import.meta.dirname, "..");
const css = readFileSync(join(webRoot, "src/index.css"), "utf8");

describe("TASK-7.2.1 — color tokens 05-FRONTEND §2.1 (indigo + slate + semantic)", () => {
  test("positif: seluruh token semantik terdefinisi di :root dengan nilai sesuai tabel SOT", () => {
    const rootBlock = css.slice(css.indexOf(":root"), css.indexOf(".dark"));
    const expected: Array<[string, string]> = [
      ["--primary:", "0.585 0.233 277.117"], // indigo-500 #6366F1
      ["--primary-active:", "0.511 0.262 276.966"], // indigo-600 #4F46E5
      ["--foreground:", "0.279 0.041 260.031"], // slate-800 #1E293B
      ["--muted-foreground:", "0.554 0.046 257.417"], // slate-500 #64748B
      ["--border:", "0.929 0.013 255.508"], // slate-200 #E2E8F0
      ["--muted:", "0.929 0.013 255.508"], // slate-200
      ["--success:", "0.696 0.17 162.48"], // emerald-500 #10B981
      ["--warning:", "0.769 0.188 70.08"], // amber-500 #F59E0B
      ["--destructive:", "0.637 0.237 25.331"], // red-500 #EF4444
    ];
    for (const [token, value] of expected) {
      const line = rootBlock.split("\n").find((l) => l.trim().startsWith(token));
      expect(line, `token ${token} harus ada di :root`).toBeTruthy();
      expect(line, `nilai ${token}`).toContain(value);
    }
  });

  test("positif: token terekspose ke utility Tailwind (light & dark tersedia)", () => {
    for (const token of [
      "--color-primary:",
      "--color-primary-active:",
      "--color-success:",
      "--color-warning:",
      "--color-destructive:",
    ]) {
      expect(css).toContain(token);
    }
    expect(css).toContain(".dark {");
    expect(css).toContain("--success:");
    expect(css).toContain("--warning:");
  });

  test("negatif: tidak ada warna hard-coded di luar index.css (src/**)", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(tsx|ts)$/.test(entry)) continue;
        const content = readFileSync(full, "utf8");
        if (/#[0-9a-fA-F]{3,8}\b|rgb\(|rgba\(|hsl\(/.test(content)) {
          offenders.push(full.replace(`${webRoot}/`, ""));
        }
      }
    };
    walk(join(webRoot, "src"));
    expect(offenders).toEqual([]);
  });
});
