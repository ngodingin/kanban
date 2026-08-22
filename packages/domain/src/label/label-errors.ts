import type { LifecycleState } from "../lifecycle/effective-state.ts";

export class LabelNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";
  constructor(
    public readonly labelId: string,
    public readonly scope: "milestone" | "board",
  ) {
    super(`${scope === "milestone" ? "Milestone" : "Board"} Label ${labelId} tidak ditemukan`);
    this.name = "LabelNotFoundError";
  }
}

export class LabelVersionConflictError extends Error {
  readonly code = "VERSION_CONFLICT";
  constructor(
    public readonly expectedVersion: number,
    public readonly currentVersion: number,
  ) {
    super(`Label version conflict: expected ${expectedVersion}, current ${currentVersion}`);
    this.name = "LabelVersionConflictError";
  }
}

export class LabelInvalidStateError extends Error {
  readonly code = "INVALID_STATE";
  constructor(
    public readonly operation: string,
    public readonly currentState: LifecycleState,
  ) {
    super(`Operasi ${operation} tidak diizinkan dari state ${currentState}`);
    this.name = "LabelInvalidStateError";
  }
}

/** FR-031/FR-034 — payload domain-level Label tidak valid. */
export class LabelValidationError extends Error {
  readonly code = "VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "LabelValidationError";
  }
}
