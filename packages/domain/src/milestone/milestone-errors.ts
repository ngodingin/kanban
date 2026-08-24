import type { LifecycleState } from "../lifecycle/effective-state.ts";
export class MilestoneNotFoundError extends Error {
    readonly code = "RESOURCE_NOT_FOUND";
    readonly milestoneId: string;
    constructor(milestoneId: string) {
        super(`Milestone ${milestoneId} tidak ditemukan`);
        this.milestoneId = milestoneId;
        this.name = "MilestoneNotFoundError";
    }
}
export class MilestoneVersionConflictError extends Error {
    readonly code = "VERSION_CONFLICT";
    readonly expectedVersion: number;
    readonly currentVersion: number;
    constructor(expectedVersion: number, currentVersion: number) {
        super(`Milestone version conflict: expected ${expectedVersion}, current ${currentVersion}`);
        this.expectedVersion = expectedVersion;
        this.currentVersion = currentVersion;
        this.name = "MilestoneVersionConflictError";
    }
}
export class MilestoneInvalidStateError extends Error {
    readonly code = "INVALID_STATE";
    readonly operation: string;
    readonly currentState: LifecycleState;
    constructor(operation: string, currentState: LifecycleState) {
        super(`Operasi ${operation} tidak diizinkan dari state ${currentState}`);
        this.operation = operation;
        this.currentState = currentState;
        this.name = "MilestoneInvalidStateError";
    }
}
export class MilestoneValidationError extends Error {
    readonly code = "VALIDATION_ERROR";
    constructor(message: string) {
        super(message);
        this.name = "MilestoneValidationError";
    }
}
