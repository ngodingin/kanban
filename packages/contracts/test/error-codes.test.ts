import { describe, expect, it } from "vitest";
import { ERROR_CODES, isErrorCode, type ErrorCode } from "../src/error-codes.ts";

describe("C.2 canonical error codes", () => {
  it("C.2: exposes exactly the 12 canonical codes", () => {
    expect(ERROR_CODES).toEqual([
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
    ]);
  });

  it("C.2: isErrorCode accepts every canonical code", () => {
    for (const code of ERROR_CODES) {
      expect(isErrorCode(code)).toBe(true);
    }
  });

  it("C.2: isErrorCode rejects unknown values (undefined, empty, unknown code)", () => {
    expect(isErrorCode(undefined)).toBe(false);
    expect(isErrorCode("")).toBe(false);
    expect(isErrorCode("UNKNOWN_CODE")).toBe(false);
    expect(isErrorCode("not-found")).toBe(false);
    expect(isErrorCode(123)).toBe(false);
  });

  it("C.2: ErrorCode type is a closed union of canonical codes", () => {
    const code: ErrorCode = "VERSION_CONFLICT";
    expect(code).toBe("VERSION_CONFLICT");
  });
});
