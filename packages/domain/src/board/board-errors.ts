import type { LifecycleState } from "../lifecycle/effective-state.ts";

export class BoardNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";
  readonly boardId: string;
  constructor(boardId: string) {
    super(`Board ${boardId} tidak ditemukan`);
    this.boardId = boardId;
    this.name = "BoardNotFoundError";
  }
}

export class BoardVersionConflictError extends Error {
  readonly code = "VERSION_CONFLICT";
  readonly expectedVersion: number;
  readonly currentVersion: number;
  constructor(expectedVersion: number, currentVersion: number) {
    super(`Board version conflict: expected ${expectedVersion}, current ${currentVersion}`);
    this.expectedVersion = expectedVersion;
    this.currentVersion = currentVersion;
    this.name = "BoardVersionConflictError";
  }
}

export class BoardInvalidStateError extends Error {
  readonly code = "INVALID_STATE";
  readonly operation: string;
  readonly currentState: LifecycleState;
  constructor(operation: string, currentState: LifecycleState) {
    super(`Operasi ${operation} tidak diizinkan dari state ${currentState}`);
    this.operation = operation;
    this.currentState = currentState;
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
