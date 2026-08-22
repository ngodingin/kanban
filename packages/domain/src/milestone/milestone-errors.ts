import type { LifecycleState } from "../lifecycle/effective-state.ts";

/**
 * Error domain Milestone (TASK-2.2). Pola sama dengan error Project Phase 1:
 * properti `code` dipetakan contracts → HTTP oleh toApiErrorResponse.
 */

export class MilestoneNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";
  constructor(public readonly milestoneId: string) {
    super(`Milestone ${milestoneId} tidak ditemukan`);
    this.name = "MilestoneNotFoundError";
  }
}

export class MilestoneVersionConflictError extends Error {
  readonly code = "VERSION_CONFLICT";
  constructor(
    public readonly expectedVersion: number,
    public readonly currentVersion: number,
  ) {
    super(`Milestone version conflict: expected ${expectedVersion}, current ${currentVersion}`);
    this.name = "MilestoneVersionConflictError";
  }
}

export class MilestoneInvalidStateError extends Error {
  readonly code = "INVALID_STATE";
  constructor(
    public readonly operation: string,
    public readonly currentState: LifecycleState,
  ) {
    super(`Operasi ${operation} tidak diizinkan dari state ${currentState}`);
    this.name = "MilestoneInvalidStateError";
  }
}

/** FR-014 — payload domain-level tidak valid (progress range, title kosong, dsb). */
export class MilestoneValidationError extends Error {
  readonly code = "VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "MilestoneValidationError";
  }
}
