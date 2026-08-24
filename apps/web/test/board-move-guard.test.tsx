// @vitest-environment happy-dom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import { siblingBoards, useBoards, type BoardSummary } from "../src/features/boards/hooks";
import { useMoveCard } from "../src/features/cards/mutations";
import { ApiError } from "../src/lib/api/client";
import { queryClient } from "../src/lib/query-client";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  queryClient.clear();
});

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("TASK-7.5.3 — move antar Board hanya dalam Milestone sama (BR-018)", () => {
  // Field entity Board = `title` (C.6, QA-CL-10) — bukan `name`.
  const boards: BoardSummary[] = [
    { id: "b1", milestoneId: "m1", title: "Sprint 1 — Utama" },
    { id: "b2", milestoneId: "m1", title: "Sprint 1 — Backup" },
    { id: "b3", milestoneId: "m2", title: "Sprint 2" },
  ];

  test("positif: kandidat hanya board Milestone sama, board asal dikecualikan", () => {
    expect(siblingBoards(boards, "m1", "b1")).toEqual([
      { id: "b2", title: "Sprint 1 — Backup" },
    ]);
  });

  test("negatif: board lintas-Milestone tidak pernah ditawarkan", () => {
    const titles = siblingBoards(boards, "m1", "b1").map((b) => b.title);
    expect(titles).not.toContain("Sprint 2");
    // Milestone berbeda sekalipun satu-satunya board lain → kandidat kosong.
    expect(siblingBoards(boards, "m9", "b1")).toEqual([]);
  });

  test("positif: hook useBoards mengambil endpoint scoping per-Milestone dan meng-unwrap {boards} dengan field title", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith("/api/v1/projects/p1/milestones/m1/boards")) {
        return Promise.resolve(
          jsonRes(200, {
            data: {
              boards: [
                {
                  id: "b2",
                  milestoneId: "m1",
                  title: "Backup",
                  createdAt: "2026-08-01T00:00:00.000Z",
                  updatedAt: "2026-08-01T00:00:00.000Z",
                  archivedAt: null,
                  deletedAt: null,
                  version: 1,
                },
              ],
            },
          }),
        );
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useBoards("p1", "m1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("/api/v1/projects/p1/milestones/m1/boards");
    expect(result.current.data?.[0]).toMatchObject({ id: "b2", title: "Backup" });
  });
});

describe("TASK-7.5.4 — VERSION_CONFLICT → pesan + reload, bukan auto-overwrite", () => {
  test("konflik melempar ApiError bertipe dan meng-invalidasi query cards (reload terjadi)", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith("/move")) {
        return Promise.resolve(
          jsonRes(409, { error: { code: "VERSION_CONFLICT", message: "berubah di server" } }),
        );
      }
      return Promise.resolve(jsonRes(200, { data: { cards: [] } }));
    });
    vi.stubGlobal("fetch", fetchMock);

    // Prefill cache lalu pastikan data ada.
    queryClient.setQueryData(["cards", "p1"], { cards: [{ id: "c1", title: "A" }] });

    const mutation = renderHook(() => useMoveCard("p1"), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    const fetchesBefore = fetchMock.mock.calls.length;
    mutation.result.current.mutate({
      cardId: "c1",
      destinationListId: "l2",
      expectedVersion: 3,
    });
    await waitFor(() => expect(mutation.result.current.isError).toBe(true));

    const error = mutation.result.current.error as ApiError;
    expect(error.code).toBe("VERSION_CONFLICT");
    expect(error.status).toBe(409);

    // onError konflik → invalidateQueries(["cards","p1"]) memicu refetch nyata.
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(fetchesBefore));

    // Tidak ada penimpaan state lokal: cache tidak di-set manual oleh client,
    // hanya di-invalidasi (data baru berasal dari refetch server).
    expect(queryClient.getQueryState(["cards", "p1"])?.isInvalidated).toBe(true);
  });
});
