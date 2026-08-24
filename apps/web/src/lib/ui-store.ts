import { create } from "zustand";

// 05-FRONTEND §3.1 — Zustand HANYA untuk UI/interaction state (sidebar, drag,
// command palette). DILARANG menyimpan cache data server di sini: server
// state milik TanStack Query (src/lib/query-client.ts), domain state milik API.
export interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
