// @vitest-environment happy-dom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import { planMove } from "../src/components/kanban/board-view";
import { useMoveCard } from "../src/features/cards/mutations";
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

describe("TASK-7.5.2 — drag Card antar List memicu move API C.8", () => {
  test("positif: planMove menghasilkan rencana move untuk drop lintas List", () => {
    const plan = planMove(
      { kind: "card", cardId: "c1", listId: "l1" },
      { kind: "list", listId: "l2" },
    );
    expect(plan).toEqual({ cardId: "c1", destinationListId: "l2" });
  });

  test("negatif: drop pada List sama / target bukan list / data hilang → tanpa rencana (tanpa side-effect)", () => {
    expect(
      planMove({ kind: "card", cardId: "c1", listId: "l1" }, { kind: "list", listId: "l1" }),
    ).toBeNull();
    expect(
      planMove({ kind: "card", cardId: "c1", listId: "l1" }, undefined),
    ).toBeNull();
    expect(planMove(undefined, { kind: "list", listId: "l2" })).toBeNull();
  });

  test("positif: useMoveCard POST JSON {destinationListId, expectedVersion} + Idempotency-Key ke endpoint move", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonRes(200, { data: { id: "c1", listId: "l2" } }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMoveCard("p1"), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    result.current.mutate({
      cardId: "c1",
      destinationListId: "l2",
      expectedVersion: 7,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/projects/p1/cards/c1/move");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ destinationListId: "l2", expectedVersion: 7 }));
    const headers = init.headers as Headers;
    expect(headers.get("Idempotency-Key")).toBeTruthy();
  });

  test("negatif: mutation gagal VERSION_CONFLICT tidak retry sendiri (tepat satu fetch)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonRes(409, {
          error: { code: "VERSION_CONFLICT", message: "modified by another request" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMoveCard("p1"), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    result.current.mutate({
      cardId: "c1",
      destinationListId: "l2",
      expectedVersion: 3,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((result.current.error as Error).message).toContain("modified by another request");
  });
});
