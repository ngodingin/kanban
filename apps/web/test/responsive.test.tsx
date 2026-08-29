// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { DndContext } from "@dnd-kit/core";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Sidebar } from "../src/components/layout/sidebar";
import { CardDetailPanel } from "../src/components/kanban/card-detail";
import { BoardView } from "../src/components/kanban/board-view";
import { useUiStore } from "../src/lib/ui-store";
import { queryClient } from "../src/lib/query-client";

const mocks = vi.hoisted(() => ({
  useLists: vi.fn(),
  useCards: vi.fn(),
  useCard: vi.fn(),
  useCardActivities: vi.fn(),
  useBoard: vi.fn(),
  useMilestone: vi.fn(),
  useProject: vi.fn(),
}));

vi.mock("../src/features/lists/hooks", () => ({ useLists: mocks.useLists }));
vi.mock("../src/features/cards/hooks", () => ({ useCards: mocks.useCards }));
vi.mock("../src/features/cards/detail-hooks", async (orig) => {
  const mod = await orig<typeof import("../src/features/cards/detail-hooks")>();
  return {
    ...mod,
    useCard: mocks.useCard,
    useCardActivities: mocks.useCardActivities,
  };
});
vi.mock("../src/features/projects/hooks", () => ({
  useBoard: mocks.useBoard,
  useMilestone: mocks.useMilestone,
  useProject: mocks.useProject,
}));

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  queryClient.clear();
  for (const fn of Object.values(mocks)) fn.mockReset();
});

describe("TASK-7.14.1 — Desktop sidebar|board; tablet collapsed", () => {
  test("positif: sidebar tersembunyi di mobile (hidden md:flex); collapsed menyusut ke md:w-14", () => {
    const utils = renderSidebar();
    const aside = utils.container.querySelector("aside")!;
    expect(aside.className).toContain("hidden");
    expect(aside.className).toContain("md:flex");
    expect(aside.className).toContain("md:w-56");
    cleanup();

    useUiStore.setState({ sidebarCollapsed: true });
    const collapsedUtils = renderSidebar();
    expect(collapsedUtils.container.querySelector("aside")!.className).toContain("md:w-14");
  });
});

describe("TASK-7.14.2 — Mobile horizontal-scroll + card detail full-screen", () => {
  test("positif: board columns flex-nowrap overflow-x-auto; kolom lebar tetap w-64", () => {
    mocks.useLists.mockReturnValue({
      data: { lists: [{ id: "l1", boardId: "b1", title: "Todo" }] },
    });
    mocks.useCards.mockReturnValue({ data: { cards: [] }, isLoading: false });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <BoardView projectId="p1" boardId="b1" />
      </QueryClientProvider>,
    );
    const scroller = container.querySelector(".overflow-x-auto")!;
    expect(scroller.className).toContain("flex-nowrap");
    expect(container.querySelector("section")!.className).toContain("w-64");
  });

  test("positif: card detail full-screen di mobile (max-md:fixed inset-0)", () => {
    mocks.useCard.mockReturnValue({
      data: {
        id: "c1",
        listId: "l1",
        title: "Kartu",
        version: 1,
        archivedAt: null,
        deletedAt: null,
      },
      isLoading: false,
    });
    mocks.useCardActivities.mockReturnValue({ data: [], isLoading: false });
    mocks.useBoard.mockReturnValue({
      data: { id: "b1", title: "Board 1" },
      isLoading: false,
    });
    mocks.useMilestone.mockReturnValue({
      data: { id: "m1", title: "M1" },
      isLoading: false,
    });
    mocks.useProject.mockReturnValue({
      data: { id: "p1", name: "P1" },
      isLoading: false,
    });
    mocks.useLists.mockReturnValue({
      data: {
        lists: [
          { id: "l1", boardId: "b1", title: "Todo" },
          { id: "l2", boardId: "b1", title: "Done" },
        ],
      },
      isLoading: false,
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <DndContext>
          <CardDetailPanel projectId="p1" milestoneId="m1" boardId="b1" cardId="c1" />
        </DndContext>
      </QueryClientProvider>,
    );
    const section = container.querySelector('section[aria-label="Detail kartu"]')!;
    expect(section.className).toContain("max-md:fixed");
    expect(section.className).toContain("max-md:inset-0");
    expect(section.className).toContain("md:relative");
  });
});
