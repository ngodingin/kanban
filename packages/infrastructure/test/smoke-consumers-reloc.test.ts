import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const SCRIPTS = [
    "smoke-global-mapping.ts",
    "smoke-pipeline.ts",
    "smoke-migrate-projects.ts",
    "smoke-rollback.ts",
];
const ROOT = join(__dirname, "..");
describe("smoke consumers pasca-relokasi — goal 0.20.1", () => {
    for (const rel of SCRIPTS) {
        it(`${rel} → exit 0 (PASS atau SKIP graceful)`, () => {
            const res = spawnSync(process.execPath, [join(ROOT, "scripts", rel)], {
                cwd: ROOT,
                encoding: "utf8",
                timeout: 60000,
                env: { ...process.env, CI: "true" },
            });
            const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
            expect(res.status, out.slice(-400)).toBe(0);
            expect(/PASS|SKIP/.test(out), out.slice(-400)).toBe(true);
        });
    }
    it("[helpers] modul hasil relokasi terekspos ke konsumen", async () => {
        const mod = await import("../scripts/smoke-global-store-helpers.ts");
        for (const fn of ["registerProject", "recordProjectDatabaseMapping", "deleteProjectRegistry", "deleteProjectDatabaseMapping"]) {
            expect(typeof (mod as Record<string, unknown>)[fn], fn).toBe("function");
        }
    });
});
