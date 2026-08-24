import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CODE_TO_HTTP } from "../src/http-mapping.ts";
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
        if (entry.isDirectory())
            out.push(...listTsFiles(full));
        else if (entry.name.endsWith(".ts"))
            out.push(full);
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
