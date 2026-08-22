import { describe, expect, it } from "vitest";
import {
  evaluateRestore,
  isArchived,
  isDeleted,
  isEffectivelyOperational,
  isActive,
  resolveLifecycleState,
} from "@kanban/domain";

describe("resolveLifecycleState — BR-011/BR-012 (goal 2.1.1)", () => {
  it("[BR-011] deletedAt menang atas archivedAt untuk seluruh kombinasi", () => {
    expect(resolveLifecycleState({ archivedAt: null, deletedAt: null })).toBe("ACTIVE");
    expect(resolveLifecycleState({ archivedAt: "2026-01-01T00:00:00.000Z", deletedAt: null })).toBe("ARCHIVED");
    expect(resolveLifecycleState({ archivedAt: null, deletedAt: "2026-01-02T00:00:00.000Z" })).toBe("DELETED");
    expect(resolveLifecycleState({ archivedAt: "2026-01-01T00:00:00.000Z", deletedAt: "2026-01-02T00:00:00.000Z" })).toBe(
      "DELETED",
    );
  });

  it("[BR-012] helper eksplisit IsActive/IsArchived/IsDeleted konsisten dengan resolver", () => {
    for (const record of [
      { archivedAt: null, deletedAt: null },
      { archivedAt: "2026-01-01T00:00:00.000Z", deletedAt: null },
      { archivedAt: null, deletedAt: "2026-01-02T00:00:00.000Z" },
    ] as const) {
      const state = resolveLifecycleState(record);
      expect(isActive(state)).toBe(state === "ACTIVE");
      expect(isArchived(state)).toBe(state === "ARCHIVED");
      expect(isDeleted(state)).toBe(state === "DELETED");
    }
  });
});

describe("isEffectivelyOperational — INV-LIFE-001/BR-014 (goal 2.1.1)", () => {
  const A = "ACTIVE" as const;
  const R = "ARCHIVED" as const;
  const D = "DELETED" as const;

  it("positif: entity ACTIVE + semua ancestor ACTIVE → operational", () => {
    // chain Card→List→Board→Milestone→Project
    expect(isEffectivelyOperational([A, A, A, A, A])).toBe(true);
    expect(isEffectivelyOperational([A])).toBe(true); // Project tanpa ancestor
  });

  it("negatif: entity ACTIVE tapi satu ancestor ARCHIVED → TIDAK operational (local state descendant tetap ACTIVE — BR-013)", () => {
    const chain = [A, A, A, R, A];
    expect(isEffectivelyOperational(chain)).toBe(false);
    // local state entity (chain[0]) tidak berubah oleh ancestor
    expect(chain[0]).toBe(A);
  });

  it("negatif: satu ancestor DELETED → TIDAK operational", () => {
    expect(isEffectivelyOperational([A, A, D, A])).toBe(false);
  });

  it("negatif: entity sendiri ARCHIVED/DELETED → tidak operational walau semua ancestor ACTIVE", () => {
    expect(isEffectivelyOperational([R, A, A])).toBe(false);
    expect(isEffectivelyOperational([D, A, A])).toBe(false);
  });
});

describe("evaluateRestore — INV-LIFE-002/INV-LIFE-004 (goal 2.1.1)", () => {
  const A = "ACTIVE" as const;
  const R = "ARCHIVED" as const;
  const D = "DELETED" as const;

  it("positif: entity ARCHIVED + semua ancestor ACTIVE → restore diizinkan", () => {
    expect(evaluateRestore(R, [A, A])).toEqual({ allowed: true });
    expect(evaluateRestore(R, [])).toEqual({ allowed: true }); // Project tanpa ancestor
  });

  it("negatif: entity ARCHIVED + satu ancestor ARCHIVED → ditolak INV-LIFE-002 (urutan benar: restore ancestor dulu)", () => {
    // Board=ARCHIVED, List=ARCHIVED → restore List langsung DENY
    const decision = evaluateRestore(R, [R]);
    expect(decision).toEqual({ allowed: false, reason: "ANCESTOR_NOT_ACTIVE", blockingAncestorIndex: 0, ancestorState: R });
  });

  it("negatif: entity ARCHIVED + ancestor DELETED → ditolak", () => {
    const decision = evaluateRestore(R, [A, D, A]);
    expect(decision).toEqual({ allowed: false, reason: "ANCESTOR_NOT_ACTIVE", blockingAncestorIndex: 1, ancestorState: D });
  });

  it("[INV-LIFE-004] negatif: entity manapun DELETED → restore selalu ditolak walau ancestor semua ACTIVE", () => {
    expect(evaluateRestore(D, [])).toEqual({ allowed: false, reason: "ENTITY_DELETED" });
    expect(evaluateRestore(D, [A, A, A])).toEqual({ allowed: false, reason: "ENTITY_DELETED" });
  });

  it("negatif: entity masih ACTIVE → bukan kandidat restore (state machine A.3)", () => {
    const decision = evaluateRestore(A, []);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed && decision.reason === "ENTITY_NOT_ARCHIVED") {
      expect(decision.currentState).toBe(A);
    }
  });
});
