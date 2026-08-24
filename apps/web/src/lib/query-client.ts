import { QueryClient } from "@tanstack/react-query";

// Semua server state lewat TanStack Query (05-FRONTEND §3.1); Zustand hanya
// UI/interaction state (goal 7.1.4). Default bawaan dipertahankan — tidak ada
// perilaku domain yang diciptakan di layer ini.
export const queryClient = new QueryClient();
