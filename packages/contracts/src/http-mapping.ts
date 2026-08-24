import { apiError, type ErrorEnvelope } from "./api-response.ts";
import { isErrorCode, type ErrorCode } from "./error-codes.ts";
export const CODE_TO_HTTP: Record<ErrorCode, number> = {
    PROJECT_ACCESS_DENIED: 403,
    PERMISSION_DENIED: 403,
    RESOURCE_NOT_FOUND: 404,
    RESOURCE_ARCHIVED: 409,
    RESOURCE_DELETED: 410,
    INVALID_STATE: 409,
    VALIDATION_ERROR: 400,
    INVALID_DESTINATION: 422,
    VERSION_CONFLICT: 409,
    TOKEN_EXPIRED: 401,
    TOKEN_REVOKED: 401,
    INVITATION_EXPIRED: 410,
    INVITATION_ALREADY_USED: 409,
    INTERNAL_ERROR: 500,
    IDEMPOTENCY_CONFLICT: 409,
    IDEMPOTENCY_IN_PROGRESS: 409,
};
export interface DomainErrorLike {
    code: string;
    message: string;
    httpStatus?: number;
    details?: Array<{
        field: string;
        reason: string;
    }>;
}
export function toErrorResponse(error: DomainErrorLike): {
    status: number;
    body: ErrorEnvelope;
} {
    if (isErrorCode(error.code)) {
        const status = error.httpStatus ?? CODE_TO_HTTP[error.code];
        return { status, body: apiError(error.code, error.message, error.details) };
    }
    return { status: 500, body: apiError("INTERNAL_ERROR", error.message) };
}
export const IDEMPOTENCY_HEADER = "Idempotency-Key";
export function extractIdempotencyKey(headers: {
    get(name: string): string | null;
}): string | null {
    const value = headers.get(IDEMPOTENCY_HEADER);
    if (!value)
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
