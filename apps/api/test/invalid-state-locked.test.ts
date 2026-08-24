import { describe, expect, it } from "vitest";
import { createApiApp } from "../src/index.ts";
describe("index.ts /auth/* try/catch — INVALID_STATE terkunci 409 (goal 0.15.2)", () => {
    it("config gagal (env wajib tidak lengkap) -> INTERNAL_ERROR, BUKAN INVALID_STATE", async () => {
        const keys = ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "AUTH_RESEND_KEY", "MAIL_FROM", "AUTH_ALLOW_NON_CANONICAL"];
        const saved: Record<string, string | undefined> = {};
        for (const k of keys) {
            saved[k] = process.env[k];
            delete process.env[k];
        }
        try {
            const { app } = createApiApp();
            const res = await app.request("http://localhost/api/auth/get-session");
            expect(res.status).toBe(500);
            const json = (await res.json()) as {
                error?: {
                    code?: string;
                };
            };
            expect(json.error?.code).not.toBe("INVALID_STATE");
            expect(json.error?.code).toBe("INTERNAL_ERROR");
        }
        finally {
            for (const k of keys) {
                if (saved[k] === undefined)
                    delete process.env[k];
                else
                    process.env[k] = saved[k];
            }
        }
    });
});
