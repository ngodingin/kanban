import type { LifecycleState } from "../lifecycle/effective-state.ts";

export class BoardNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";
  constructor(public readonly boardId: string) {
    super(`Board ${boardId} tidak ditemukan`);
    this.name = "BoardNotFoundError";
  }
}

export class BoardVersionConflictError extends Error {
  readonly code = "VERSION_CONFLICT";
  constructor(
    public readonly expectedVersion: number,
    public readonly currentVersion: number,
  ) {
    super(`Board version conflict: expected ${expectedVersion}, current ${currentVersion}`);
    this.name = "BoardVersionConflictError";
  }
}

export class BoardInvalidStateError extends Error {
  readonly code = "INVALID_STATE";
  constructor(
    public readonly operation: string,
    public readonly currentState: LifecycleState,
  ) {
    super(`Operasi ${operation} tidak diizinkan dari state ${currentState}`);
    this.name = "BoardInvalidStateError";
  }
}

/** FR-018/FR-019 — payload domain-level Board tidak valid. */
export class BoardValidationError extends Error {
  readonly code = "VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "BoardValidationError";
  }
}
