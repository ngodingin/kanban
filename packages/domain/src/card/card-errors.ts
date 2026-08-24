import type { LifecycleState } from "../lifecycle/effective-state.ts";
export class CardNotFoundError extends Error {
    readonly code = "RESOURCE_NOT_FOUND";
    readonly cardId: string;
    constructor(cardId: string) {
        super(`Card ${cardId} tidak ditemukan`);
        this.cardId = cardId;
        this.name = "CardNotFoundError";
    }
}
export class CardVersionConflictError extends Error {
    readonly code = "VERSION_CONFLICT";
    readonly expectedVersion: number;
    readonly currentVersion: number;
    constructor(expectedVersion: number, currentVersion: number) {
        super(`Card version conflict: expected ${expectedVersion}, current ${currentVersion}`);
        this.expectedVersion = expectedVersion;
        this.currentVersion = currentVersion;
        this.name = "CardVersionConflictError";
    }
}
export class CardInvalidStateError extends Error {
    readonly code = "INVALID_STATE";
    readonly operation: string;
    readonly currentState: LifecycleState;
    constructor(operation: string, currentState: LifecycleState) {
        super(`Operasi ${operation} tidak diizinkan dari state ${currentState}`);
        this.operation = operation;
        this.currentState = currentState;
        this.name = "CardInvalidStateError";
    }
}
export class CardValidationError extends Error {
    readonly code = "VALIDATION_ERROR";
    constructor(message: string) {
        super(message);
        this.name = "CardValidationError";
    }
}
