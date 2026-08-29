// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  orderRecentFirst,
  readRecentProjectIds,
  recordProjectVisit,
  RecentActivityPreview,
} from "../src/features/home/recent";
import { queryClient } from "../src/lib/query-client";
import App from "../src/App";

const mocks = vi.hoisted(() => ({
  useActivities: vi.fn(),
  useProjects: vi.fn(),
}));
vi.mock("../src/features/activity/hooks", async (orig) => {
  const mod = await orig<typeof import("../src/features/activity/hooks")>();
  return { ...mod, useActivities: () => mocks.useActivities() };
});
vi.mock("../src/features/projects/hooks", async (orig) => {
  const mod = await orig<typeof import("../src/features/projects/hooks")>();
  return { ...mod, useProjects: () => mocks.useProjects() };
});
// Mock session-gate to always pass through (session valid in tests)
vi.mock("@/components/auth/session-gate", () => ({
  SessionGate: ({ children }: { children: React.ReactNode }) => children,
  isSafeReturnTo: (v: string | null) => !!v && v.startsWith("/"),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  queryClient.clear();
  mocks.useActivities.mockReset();
  mocks.useProjects.mockReset();
});

function renderWithRouter(initialEntry: string) {
  mocks.useProjects.mockReturnValue({
    data: [
      { id: "p1", name: "Alpha" },
      { id: "p2", name: "Beta" },
      { id: "p3", name: "Gamma" },
    ],
    isLoading: false,
  });
  mocks.useActivities.mockReturnValue({ data: { activities: [] }, isLoading: false });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TASK-7.4.2 — Recent Projects + Recent Activity (per konteks Project)", () => {
  test("positif: recordProjectVisit menyimpan urutan kunjungan terbaru di UI state", () => {
    recordProjectVisit("p1");
    recordProjectVisit("p2");
    recordProjectVisit("p1");
    expect(readRecentProjectIds()).toEqual(["p1", "p2"]);
  });

  test("positif: orderRecentFirst mengurutkan recent duluan, sisanya mempertahankan urutan API", () => {
    const projects = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(orderRecentFirst(projects, ["c", "a"]).map((p) => p.id)).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
    expect(orderRecentFirst([], ["x"])).toEqual([]);
  });

  test("kosong & tanpa konteks → state netral", () => {
    mocks.useActivities.mockReturnValue({ data: [], isLoading: false } as never);
    render(
      <QueryClientProvider client={queryClient}>
        <RecentActivityPreview projectId="p1" />
      </QueryClientProvider>,
    );
    expect(screen.getByLabelText("Recent Activity").textContent).toContain("—");
    cleanup();
    mocks.useActivities.mockReturnValue({ data: undefined, isLoading: false } as never);
    const empty = render(
      <QueryClientProvider client={queryClient}>
        <RecentActivityPreview projectId={undefined} />
      </QueryClientProvider>,
    );
    expect(empty.container.textContent).toContain("Belum ada konteks");
  });

  test("integrasi: navigasi ke Project mencatat kunjungan, Recent berubah urutan", async () => {
    // Navigate to project p3 — this should record the visit
    const { unmount: unmount1 } = renderWithRouter("/projects/p3");
    await waitFor(() => expect(readRecentProjectIds()).toEqual(["p3"]));
    unmount1();

    // Navigate to project p1
    const { unmount: unmount2 } = renderWithRouter("/projects/p1");
    await waitFor(() => expect(readRecentProjectIds()).toEqual(["p1", "p3"]));
    unmount2();

    // Render Home — p1 should be first, p3 second
    renderWithRouter("/");
    const items = screen.getByLabelText("Recent Projects").querySelectorAll("li");
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain("Alpha");
    expect(items[1].textContent).toContain("Gamma");
  });
});
