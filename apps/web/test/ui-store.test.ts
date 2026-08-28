// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useUiStore } from "../src/lib/ui-store";

describe("TASK-7.1.4 — Zustand dibatasi ke UI/interaction state saja", () => {
  test("positif: toggle sidebar mengubah UI state", () => {
    const { result } = renderHook(() => useUiStore());
    expect(result.current.sidebarCollapsed).toBe(false);
    act(() => result.current.toggleSidebar());
    expect(result.current.sidebarCollapsed).toBe(true);
    act(() => result.current.toggleSidebar());
    expect(result.current.sidebarCollapsed).toBe(false);
  });

  test("negatif: store TIDAK memuat field domain/server state (bukan database lokal)", () => {
    const keys = Object.keys(useUiStore.getState());
    // Guard struktural: hanya UI/interaction state yang boleh ada. Field
    // khas cache server/domain (entities, cards, projects, session data) dilarang.
    const allowed = new Set(["sidebarCollapsed", "toggleSidebar", "paletteOpen", "openPalette", "closePalette", "togglePalette"]);
    for (const key of keys) {
      expect(allowed.has(key)).toBe(true);
    }
    const forbidden = /card|board|list|milestone|project|activity|member|invitation|token|session|query/i;
    for (const key of keys) {
      expect(forbidden.test(key)).toBe(false);
    }
  });
});
