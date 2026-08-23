import type { LifecycleState } from "../lifecycle/effective-state.ts";

export class LabelNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";
  readonly labelId: string;
  readonly scope: "milestone" | "board";
  constructor(labelId: string, scope: "milestone" | "board") {
    super(`${scope === "milestone" ? "Milestone" : "Board"} Label ${labelId} tidak ditemukan`);
    this.labelId = labelId;
    this.scope = scope;
    this.name = "LabelNotFoundError";
  }
}

export class LabelVersionConflictError extends Error {
  readonly code = "VERSION_CONFLICT";
  readonly expectedVersion: number;
  readonly currentVersion: number;
  constructor(expectedVersion: number, currentVersion: number) {
    super(`Label version conflict: expected ${expectedVersion}, current ${currentVersion}`);
    this.expectedVersion = expectedVersion;
    this.currentVersion = currentVersion;
    this.name = "LabelVersionConflictError";
  }
}

export class LabelInvalidStateError extends Error {
  readonly code = "INVALID_STATE";
  readonly operation: string;
  readonly currentState: LifecycleState;
  constructor(operation: string, currentState: LifecycleState) {
    super(`Operasi ${operation} tidak diizinkan dari state ${currentState}`);
    this.operation = operation;
    this.currentState = currentState;
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
