// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  orderRecentFirst,
  readRecentProjectIds,
  recordProjectVisit,
  RecentActivityPreview,
} from "../src/features/home/recent";
import { queryClient } from "../src/lib/query-client";

const mocks = vi.hoisted(() => ({ useActivities: vi.fn() }));
vi.mock("../src/features/activity/hooks", async (orig) => {
  const mod = await orig<typeof import("../src/features/activity/hooks")>();
  return { ...mod, useActivities: mocks.useActivities };
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  queryClient.clear();
  mocks.useActivities.mockReset();
});

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
});
