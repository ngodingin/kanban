import { describe, expect, it } from "vitest";
import { apiError, ok } from "../src/api-response.ts";

describe("C.2 canonical response shapes", () => {
  it("C.2: success envelope = { data }", () => {
    expect(ok({ id: "x" })).toEqual({ data: { id: "x" } });
  });

  it("C.2: success envelope passes through any payload (null, array, scalar)", () => {
    expect(ok(null)).toEqual({ data: null });
    expect(ok([1, 2])).toEqual({ data: [1, 2] });
    expect(ok("ok")).toEqual({ data: "ok" });
  });

  it("C.2: error envelope = { error: { code, message } }", () => {
    expect(apiError("RESOURCE_NOT_FOUND", "nope")).toEqual({
      error: { code: "RESOURCE_NOT_FOUND", message: "nope" },
    });
  });

  it("C.2: error envelope never leaks data field", () => {
    const body = apiError("INVALID_STATE", "x");
    expect("data" in body).toBe(false);
  });
});
