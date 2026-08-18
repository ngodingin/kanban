import type { ErrorCode } from "./error-codes.ts";

export type SuccessEnvelope<T> = { data: T };

export type ApiErrorBody = { code: ErrorCode; message: string };

export type ErrorEnvelope = { error: ApiErrorBody };

export function ok<T>(data: T): SuccessEnvelope<T> {
  return { data };
}

export function apiError(code: ErrorCode, message: string): ErrorEnvelope {
  return { error: { code, message } };
}