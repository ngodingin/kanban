import { describe, expect, it } from "vitest";
import { projectDatabaseName } from "../src/provisioning/turso.ts";
describe("projectDatabaseName (unit)", () => {
    it("menghasilkan nama DB Turso valid: lowercase, angka, dash saja", () => {
        const name = projectDatabaseName("proj_01HZZX_WXYZ-123");
        expect(name).toBe("proj-proj01hzzxwxyz-123");
        expect(name).toMatch(/^[a-z0-9-]+$/);
    });
    it("menghilangkan karakter terlarang underscore", () => {
        expect(projectDatabaseName("proj_a_b")).toBe("proj-projab");
    });
});
