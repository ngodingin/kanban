import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CODE_TO_HTTP } from "../src/http-mapping.ts";

// TASK-0.15 goal 0.15.2 — regresi struktural: INVALID_STATE (C.2, definisi
// terkunci sejak awal — konflik state domain) MUST NOT PERNAH dipasangkan
// HTTP selain 409 di mana pun di codebase. Amandemen 2.12.0 menambah
// INTERNAL_ERROR (500) khusus kegagalan tak terduga persis SUPAYA kelas
// pelanggaran ini (INVALID_STATE dipakai sebagai fallback 500 generik,
// Review-CL-17) tidak terulang.

const ROOTS = [
  join(import.meta.dirname, "../../../apps/api/src"),
  join(import.meta.dirname, "../../../packages/contracts/src"),
  join(import.meta.dirname, "../../../packages/infrastructure/src"),
  join(import.meta.dirname, "../../../packages/domain/src"),
];

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("C.2 — INVALID_STATE terkunci 409 di seluruh codebase (goal 0.15.2)", () => {
  it("[kunci mapping] CODE_TO_HTTP.INVALID_STATE === 409", () => {
    expect(CODE_TO_HTTP.INVALID_STATE).toBe(409);
  });

  it("[static scan] TIDAK ADA `new PipelineError(\"INVALID_STATE\", ..., <status>)` dengan status selain 409", () => {
    const violations: string[] = [];
    const pattern = /PipelineError\(\s*["']INVALID_STATE["']\s*,[^,]*(?:,[^,)]*)*?,\s*(\d+)\s*\)/g;
    for (const root of ROOTS) {
      for (const file of listTsFiles(root)) {
        const content = readFileSync(file, "utf8");
        for (const match of content.matchAll(pattern)) {
          const status = match[1];
          if (status !== "409") {
            violations.push(`${file}: status ${status} (harus 409) — "${match[0]}"`);
          }
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

});
