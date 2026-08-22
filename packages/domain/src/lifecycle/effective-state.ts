/**
 * Lifecycle & effective-state utility entity-agnostic (Phase 2 TASK-2.1).
 *
 * Sumber rule:
 * - 02-SPEC A.3 — state kanonik ACTIVE/ARCHIVED/DELETED, BR-011, BR-012.
 * - INV-LIFE-001 — entity operasional hanya jika local state + SELURUH ancestor ACTIVE.
 * - INV-LIFE-002 — restore ARCHIVED hanya jika seluruh ancestor ACTIVE.
 * - INV-LIFE-003/004 — ARCHIVED tidak menerima mutation; DELETED terminal (tak dapat restore).
 * - BR-012 — interpretasi lifecycle MUST NOT tersebar di banyak tempat; semua caller
 *   Milestone/Board/List/Card memakai modul ini, bukan reimplementasi.
 */

export type LifecycleState = "ACTIVE" | "ARCHIVED" | "DELETED";

export interface LifecycleTimestamps {
  archivedAt: string | null;
  deletedAt: string | null;
}

/** BR-011 — `deleted_at` menang atas `archived_at`. */
export function resolveLifecycleState(record: LifecycleTimestamps): LifecycleState {
  if (record.deletedAt !== null) return "DELETED";
  if (record.archivedAt !== null) return "ARCHIVED";
  return "ACTIVE";
}

/** BR-012 — helper eksplisit agar caller tidak menginterpretasi timestamp sendiri. */
export function isActive(state: LifecycleState): boolean {
  return state === "ACTIVE";
}

export function isArchived(state: LifecycleState): boolean {
  return state === "ARCHIVED";
}

export function isDeleted(state: LifecycleState): boolean {
  return state === "DELETED";
}

/**
 * INV-LIFE-001 / BR-014 — chain berisi state entity itu sendiri pada indeks 0,
 * lalu ancestor dari terdekat ke teratas (Card→List→Board→Milestone→Project).
 * Entity operasional efektif hanya jika SEMUA elemen chain ACTIVE — satu saja
 * ancestor ARCHIVED/DELETED membuat entity non-operational walau local state-nya ACTIVE.
 */
export function isEffectivelyOperational(chain: readonly LifecycleState[]): boolean {
  return chain.every((state) => state === "ACTIVE");
}

export type RestoreDecision =
  | { allowed: true }
  | { allowed: false; reason: "ENTITY_NOT_ARCHIVED"; currentState: Exclude<LifecycleState, "ARCHIVED"> }
  | { allowed: false; reason: "ENTITY_DELETED" }
  | { allowed: false; reason: "ANCESTOR_NOT_ACTIVE"; blockingAncestorIndex: number; ancestorState: Exclude<LifecycleState, "ACTIVE"> };

/**
 * INV-LIFE-002 + INV-LIFE-004 — evaluasi apakah entity ARCHIVED boleh di-restore.
 * Urutan cek: DELETED (terminal) → bukan ARCHIVED → ancestor non-ACTIVE.
 * Keputusan error mapping ada di caller; utility ini netral domain.
 */
export function evaluateRestore(
  currentState: LifecycleState,
  ancestorStates: readonly LifecycleState[],
): RestoreDecision {
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
