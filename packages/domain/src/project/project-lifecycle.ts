import type { ProjectStateRecord } from "./project-repository.ts";
import { resolveLifecycleState, type LifecycleState } from "../lifecycle/effective-state.ts";
export type ProjectLifecycleState = LifecycleState;
export function resolveProjectLifecycle(record: Pick<ProjectStateRecord, "archivedAt" | "deletedAt">): ProjectLifecycleState {
    return resolveLifecycleState(record);
}
export class ProjectNotFoundError extends Error {
    readonly code = "RESOURCE_NOT_FOUND";
    constructor(message = "project tidak ditemukan") {
        super(message);
        this.name = "ProjectNotFoundError";
    }
}
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
