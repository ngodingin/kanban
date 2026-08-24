import type { LifecycleState } from "../lifecycle/effective-state.ts";
export class ListNotFoundError extends Error {
    readonly code = "RESOURCE_NOT_FOUND";
    readonly listId: string;
    constructor(listId: string) {
        super(`List ${listId} tidak ditemukan`);
        this.listId = listId;
        this.name = "ListNotFoundError";
    }
}
export class ListVersionConflictError extends Error {
    readonly code = "VERSION_CONFLICT";
    readonly expectedVersion: number;
    readonly currentVersion: number;
    constructor(expectedVersion: number, currentVersion: number) {
        super(`List version conflict: expected ${expectedVersion}, current ${currentVersion}`);
        this.expectedVersion = expectedVersion;
        this.currentVersion = currentVersion;
        this.name = "ListVersionConflictError";
    }
}
export class ListInvalidStateError extends Error {
    readonly code = "INVALID_STATE";
    readonly operation: string;
    readonly currentState: LifecycleState;
    constructor(operation: string, currentState: LifecycleState) {
        super(`Operasi ${operation} tidak diizinkan dari state ${currentState}`);
        this.operation = operation;
        this.currentState = currentState;
        this.name = "ListInvalidStateError";
    }
}
export class ListValidationError extends Error {
    readonly code = "VALIDATION_ERROR";
    constructor(message: string) {
        super(message);
        this.name = "ListValidationError";
    }
}
