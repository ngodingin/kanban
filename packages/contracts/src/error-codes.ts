export const ERROR_CODES = [
  "PROJECT_ACCESS_DENIED",
  "PERMISSION_DENIED",
  "RESOURCE_NOT_FOUND",
  "RESOURCE_ARCHIVED",
  "RESOURCE_DELETED",
  "INVALID_STATE",
  "VALIDATION_ERROR",
  "INVALID_DESTINATION",
  "VERSION_CONFLICT",
  "TOKEN_EXPIRED",
  "TOKEN_REVOKED",
  "INVITATION_EXPIRED",
  "INVITATION_ALREADY_USED",
  "INTERNAL_ERROR",
  "IDEMPOTENCY_CONFLICT",
  "IDEMPOTENCY_IN_PROGRESS",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}