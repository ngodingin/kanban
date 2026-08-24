import { describe, expect, it } from "vitest";
import { extractIdempotencyKey, toErrorResponse } from "../src/http-mapping.ts";
describe("C.2 error -> HTTP mapping", () => {
    it("C.2: every canonical code maps to a 4xx/5xx status", () => {
        const codes = [
            "PROJECT_ACCESS_DENIED",
            "PERMISSION_DENIED",
            "RESOURCE_NOT_FOUND",
            "RESOURCE_ARCHIVED",
            "RESOURCE_DELETED",
            "INVALID_STATE",
            "INVALID_DESTINATION",
            "VERSION_CONFLICT",
            "TOKEN_EXPIRED",
            "TOKEN_REVOKED",
            "INVITATION_EXPIRED",
            "INVITATION_ALREADY_USED",
        ] as const;
        for (const code of codes) {
            const { status } = toErrorResponse({ code, message: "m" });
            expect(status).toBeGreaterThanOrEqual(400);
            expect(status).toBeLessThanOrEqual(599);
        }
    });
    it("C.2: specific mappings hold (401/403/404/409)", () => {
        expect(toErrorResponse({ code: "TOKEN_EXPIRED", message: "m" }).status).toBe(401);
        expect(toErrorResponse({ code: "TOKEN_REVOKED", message: "m" }).status).toBe(401);
        expect(toErrorResponse({ code: "PROJECT_ACCESS_DENIED", message: "m" }).status).toBe(403);
        expect(toErrorResponse({ code: "PERMISSION_DENIED", message: "m" }).status).toBe(403);
        expect(toErrorResponse({ code: "RESOURCE_NOT_FOUND", message: "m" }).status).toBe(404);
        expect(toErrorResponse({ code: "VERSION_CONFLICT", message: "m" }).status).toBe(409);
    });
    it("C.2: explicit httpStatus overrides the canonical mapping (e.g. pipeline step)", () => {
        const { status } = toErrorResponse({ code: "RESOURCE_NOT_FOUND", message: "m", httpStatus: 410 });
        expect(status).toBe(410);
    });
    it("C.2 (amandemen 2.12.0): unknown error code falls back to 500 INTERNAL_ERROR (not INVALID_STATE — that code is locked to 409) without leaking", () => {
        const { status, body } = toErrorResponse({ code: "WEIRD_INTERNAL_BUG", message: "boom" });
        expect(status).toBe(500);
        expect(body).toEqual({ error: { code: "INTERNAL_ERROR", message: "boom" } });
    });
});
describe("idempotency seam", () => {
    it("extracts Idempotency-Key when present", () => {
        const headers = new Headers({ "Idempotency-Key": "req-123" });
        expect(extractIdempotencyKey(headers)).toBe("req-123");
    });
    it("returns null when header missing or blank", () => {
        expect(extractIdempotencyKey(new Headers())).toBeNull();
        expect(extractIdempotencyKey(new Headers({ "Idempotency-Key": "   " }))).toBeNull();
    });
});
