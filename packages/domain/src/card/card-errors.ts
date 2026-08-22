import type { LifecycleState } from "../lifecycle/effective-state.ts";

export class CardNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";
  constructor(public readonly cardId: string) {
    super(`Card ${cardId} tidak ditemukan`);
    this.name = "CardNotFoundError";
  }
}

export class CardVersionConflictError extends Error {
  readonly code = "VERSION_CONFLICT";
  constructor(
    public readonly expectedVersion: number,
    public readonly currentVersion: number,
  ) {
    super(`Card version conflict: expected ${expectedVersion}, current ${currentVersion}`);
    this.name = "CardVersionConflictError";
  }
}

export class CardInvalidStateError extends Error {
  readonly code = "INVALID_STATE";
  constructor(
    public readonly operation: string,
    public readonly currentState: LifecycleState,
  ) {
    super(`Operasi ${operation} tidak diizinkan dari state ${currentState}`);
    this.name = "CardInvalidStateError";
  }
}

/** FR-024 — payload domain-level Card tidak valid. */
export class CardValidationError extends Error {
  readonly code = "VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "CardValidationError";
  }
}
