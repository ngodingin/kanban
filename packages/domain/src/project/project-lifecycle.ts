import type { ProjectStateRecord } from "./project-repository.ts";

export type ProjectLifecycleState = "ACTIVE" | "ARCHIVED" | "DELETED";

export function resolveProjectLifecycle(
  record: Pick<ProjectStateRecord, "archivedAt" | "deletedAt">,
): ProjectLifecycleState {
  if (record.deletedAt !== null) return "DELETED";
  if (record.archivedAt !== null) return "ARCHIVED";
  return "ACTIVE";
}

export class ProjectNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";

  constructor(message = "project tidak ditemukan") {
    super(message);
    this.name = "ProjectNotFoundError";
  }
}

/** BR-021 — version tidak cocok; tanpa perubahan state, tanpa Activity. */
export class ProjectVersionConflictError extends Error {
  readonly code = "VERSION_CONFLICT";

  constructor(expectedVersion: number, currentVersion: number) {
    super(`version conflict: expected ${expectedVersion}, current ${currentVersion}`);
    this.name = "ProjectVersionConflictError";
  }
}

export class ProjectInvalidStateError extends Error {
  readonly code = "INVALID_STATE";
  readonly currentState: ProjectLifecycleState;

  constructor(operation: string, currentState: ProjectLifecycleState) {
    super(`operasi ${operation} tidak valid dari state ${currentState}`);
    this.name = "ProjectInvalidStateError";
    this.currentState = currentState;
  }
}
