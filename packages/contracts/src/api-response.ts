import type { ErrorCode } from "./error-codes.ts";

export type SuccessEnvelope<T> = { data: T };

export type ApiErrorBody = {
  code: ErrorCode;
  message: string;
  // C.2 (amandemen 3.0.0) — VALIDATION_ERROR collect-all detail per field.
  details?: Array<{ field: string; reason: string }>;
};

export type ErrorEnvelope = { error: ApiErrorBody };

export function ok<T>(data: T): SuccessEnvelope<T> {
  return { data };
}

export function apiError(code: ErrorCode, message: string, details?: Array<{ field: string; reason: string }>): ErrorEnvelope {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}