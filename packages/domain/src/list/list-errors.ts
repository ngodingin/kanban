import type { LifecycleState } from "../lifecycle/effective-state.ts";

export class ListNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";
  constructor(public readonly listId: string) {
    super(`List ${listId} tidak ditemukan`);
    this.name = "ListNotFoundError";
  }
}

export class ListVersionConflictError extends Error {
  readonly code = "VERSION_CONFLICT";
  constructor(
    public readonly expectedVersion: number,
    public readonly currentVersion: number,
  ) {
    super(`List version conflict: expected ${expectedVersion}, current ${currentVersion}`);
    this.name = "ListVersionConflictError";
  }
}

export class ListInvalidStateError extends Error {
  readonly code = "INVALID_STATE";
  constructor(
    public readonly operation: string,
    public readonly currentState: LifecycleState,
  ) {
    super(`Operasi ${operation} tidak diizinkan dari state ${currentState}`);
    this.name = "ListInvalidStateError";
  }
}

/** FR-021/FR-023 — payload domain-level List tidak valid. */
export class ListValidationError extends Error {
  readonly code = "VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "ListValidationError";
  }
}
