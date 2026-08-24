export type LifecycleState = "ACTIVE" | "ARCHIVED" | "DELETED";
export interface LifecycleTimestamps {
    archivedAt: string | null;
    deletedAt: string | null;
}
export function resolveLifecycleState(record: LifecycleTimestamps): LifecycleState {
    if (record.deletedAt !== null)
        return "DELETED";
    if (record.archivedAt !== null)
        return "ARCHIVED";
    return "ACTIVE";
}
export function isActive(state: LifecycleState): boolean {
    return state === "ACTIVE";
}
export function isArchived(state: LifecycleState): boolean {
    return state === "ARCHIVED";
}
export function isDeleted(state: LifecycleState): boolean {
    return state === "DELETED";
}
export function isEffectivelyOperational(chain: readonly LifecycleState[]): boolean {
    return chain.every((state) => state === "ACTIVE");
}
export type RestoreDecision = {
    allowed: true;
} | {
    allowed: false;
    reason: "ENTITY_NOT_ARCHIVED";
    currentState: Exclude<LifecycleState, "ARCHIVED">;
} | {
    allowed: false;
    reason: "ENTITY_DELETED";
} | {
    allowed: false;
    reason: "ANCESTOR_NOT_ACTIVE";
    blockingAncestorIndex: number;
    ancestorState: Exclude<LifecycleState, "ACTIVE">;
};
export function evaluateRestore(currentState: LifecycleState, ancestorStates: readonly LifecycleState[]): RestoreDecision {
    if (currentState === "DELETED") {
        return { allowed: false, reason: "ENTITY_DELETED" };
    }
    if (currentState !== "ARCHIVED") {
        return { allowed: false, reason: "ENTITY_NOT_ARCHIVED", currentState };
    }
    for (let i = 0; i < ancestorStates.length; i++) {
        const ancestor = ancestorStates[i]!;
        if (ancestor !== "ACTIVE") {
            return { allowed: false, reason: "ANCESTOR_NOT_ACTIVE", blockingAncestorIndex: i, ancestorState: ancestor };
        }
    }
    return { allowed: true };
}
