// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import { BoardView } from "../src/components/kanban/board-view";
import { queryClient } from "../src/lib/query-client";

const mocks = vi.hoisted(() => ({
  useLists: vi.fn(),
  useCards: vi.fn(),
}));

vi.mock("../src/features/lists/hooks", () => ({ useLists: mocks.useLists }));
vi.mock("../src/features/cards/hooks", () => ({ useCards: mocks.useCards }));

function idle<T>(data?: T) {
  return { data, isLoading: false } as never;
}

afterEach(() => {
  cleanup();
  for (const fn of Object.values(mocks)) fn.mockReset();
});

describe("TASK-7.5.1 — render kolom = List (nama bebas) + count + card list", () => {
  test("positif: kolom dirender dari List dengan judul bebas dan count kartu", () => {
    mocks.useLists.mockReturnValue(
      idle({
        lists: [
          { id: "l1", boardId: "b1", title: "Todo" },
          { id: "l2", boardId: "b1", title: "Review" },
        ],
      }),
    );
    mocks.useCards.mockImplementation((_p: string, listId: string) =>
      listId === "l1"
        ? idle({ cards: [{ id: "c1", title: "Kartu A" }, { id: "c2", title: "Kartu B" }] })
        : idle({ cards: [] }),
    );

    render(
      <QueryClientProvider client={queryClient}>
        <BoardView projectId="p1" boardId="b1" />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Todo")).toBeTruthy();
    expect(screen.getByText("Review")).toBeTruthy();
    expect(screen.getByLabelText("Jumlah kartu Todo").textContent).toBe("2");
    expect(screen.getByLabelText("Jumlah kartu Review").textContent).toBe("0");
    expect(screen.getByText("Kartu A")).toBeTruthy();
  });

  test("negatif: tidak ada makna status sistem pada kolom/kartu (List nama bebas)", () => {
    mocks.useLists.mockReturnValue(
      idle({ lists: [{ id: "l1", boardId: "b1", title: "Done-ish" }] }),
    );
    mocks.useCards.mockReturnValue(idle({ cards: [{ id: "c9", title: "Kartu Z" }] }));

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <BoardView projectId="p1" boardId="b1" />
      </QueryClientProvider>,
    );

    expect(container.textContent).not.toMatch(/priority|progress|status:/i);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  test("board tanpa List merender tanpa kolom dan tanpa error", () => {
    mocks.useLists.mockReturnValue(idle({ lists: [] }));
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <BoardView projectId="p1" boardId="b1" />
      </QueryClientProvider>,
    );
    expect(container.querySelectorAll("section")).toHaveLength(0);
  });
});
