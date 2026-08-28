// @vitest-environment happy-dom
import { cleanup, render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CardDetailPanel } from "../src/components/kanban/card-detail";
import { queryClient } from "../src/lib/query-client";
import { useUiStore } from "../src/lib/ui-store";

const mocks = vi.hoisted(() => ({
  useCard: vi.fn(),
  useCardActivities: vi.fn(),
  useUpdateCard: vi.fn(),
  useMoveCard: vi.fn(),
  useLifecycleMutation: vi.fn(),
  useLists: vi.fn(),
}));

vi.mock("../src/features/cards/detail-hooks", () => ({
  useCard: mocks.useCard,
  useCardActivities: mocks.useCardActivities,
  useUpdateCard: mocks.useUpdateCard,
}));

vi.mock("../src/features/cards/mutations", () => ({
  useMoveCard: mocks.useMoveCard,
}));

vi.mock("../src/features/lifecycle/hooks", () => ({
  useLifecycleMutation: mocks.useLifecycleMutation,
}));

vi.mock("../src/features/lists/hooks", () => ({
  useLists: mocks.useLists,
}));

vi.mock("../src/features/comments/hooks", () => ({
  useAddComment: vi.fn(() => ({ mutate: vi.fn() })),
  useEditComment: vi.fn(() => ({ mutate: vi.fn() })),
}));

vi.mock("../src/features/comments/thread", () => ({
  deriveCommentThread: vi.fn(() => []),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useUiStore.setState({ paletteCommands: [], paletteOpen: false });
});

function renderCardDetail() {
  const moveMutate = vi.fn();
  const archiveMutate = vi.fn();
  mocks.useCard.mockReturnValue({
    data: {
      id: "card-1",
      listId: "list-a",
      title: "Test Card",
      version: 3,
      archivedAt: null,
      deletedAt: null,
    },
    isLoading: false,
  });
  mocks.useCardActivities.mockReturnValue({ data: [], isLoading: false });
  mocks.useUpdateCard.mockReturnValue({ mutate: vi.fn() });
  mocks.useMoveCard.mockReturnValue({ mutate: moveMutate, error: null });
  mocks.useLifecycleMutation.mockReturnValue({ mutate: archiveMutate, error: null });
  mocks.useLists.mockReturnValue({
    data: {
      lists: [
        { id: "list-a", title: "To Do" },
        { id: "list-b", title: "In Progress" },
        { id: "list-c", title: "Done" },
      ],
    },
    isLoading: false,
  });

  const onClose = vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/projects/p1/milestones/m1/boards/b1"]}>
        <CardDetailPanel projectId="p1" boardId="b1" cardId="card-1" onClose={onClose} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { ...utils, moveMutate, archiveMutate, onClose };
}

function triggerPaletteCommand(id: string) {
  const commands = useUiStore.getState().paletteCommands;
  const cmd = commands.find((c) => c.id === id);
  if (cmd) {
    act(() => { cmd.run(); });
  }
}

describe("TASK-7.12.1 — Move Card picker flow", () => {
  test("debug: palette commands are registered after render", async () => {
    renderCardDetail();
    const commands = useUiStore.getState().paletteCommands;
    expect(commands.length).toBe(2);
    expect(commands.map((c) => c.id)).toContain("act-move-card");
    expect(commands.map((c) => c.id)).toContain("act-archive-card");
  });

  test("positif: 'Pindahkan Card' command membuka list picker", async () => {
    renderCardDetail();

    const commands = useUiStore.getState().paletteCommands;
    expect(commands.length).toBe(2);

    expect(screen.queryByText("Pindahkan ke List:")).toBeNull();

    triggerPaletteCommand("act-move-card");

    expect(screen.getByText("Pindahkan ke List:")).toBeTruthy();
    expect(screen.getByRole("button", { name: /To Do/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "In Progress" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Batal" })).toBeTruthy();
  });

  test("positif: list asal ditandai '(saat ini)' dan disabled", async () => {
    renderCardDetail();

    triggerPaletteCommand("act-move-card");

    const currentItem = screen.getByText(/To Do.*saat ini/);
    expect(currentItem).toBeTruthy();
    expect(currentItem.closest("button")?.disabled).toBe(true);
  });

  test("positif: klik list tujuan memanggil moveMutation dengan payload benar", async () => {
    const user = userEvent.setup();
    const { moveMutate } = renderCardDetail();

    triggerPaletteCommand("act-move-card");

    await user.click(screen.getByRole("button", { name: "In Progress" }));

    expect(moveMutate).toHaveBeenCalledTimes(1);
    expect(moveMutate).toHaveBeenCalledWith(
      {
        cardId: "card-1",
        destinationListId: "list-b",
        expectedVersion: 3,
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  test("positif: klik 'Batal' menutup list picker tanpa mutation", async () => {
    const user = userEvent.setup();
    const { moveMutate } = renderCardDetail();

    triggerPaletteCommand("act-move-card");

    await user.click(screen.getByRole("button", { name: "Batal" }));

    expect(screen.queryByText("Pindahkan ke List:")).toBeNull();
    expect(moveMutate).not.toHaveBeenCalled();
  });

  test("negatif: klik list asal TIDAK memanggil moveMutation", async () => {
    const { moveMutate } = renderCardDetail();

    triggerPaletteCommand("act-move-card");

    const currentItem = screen.getByText(/To Do.*saat ini/);
    const button = currentItem.closest("button");
    expect(button?.disabled).toBe(true);
    expect(moveMutate).not.toHaveBeenCalled();
  });

  test("positif: 'Arsipkan Card' command memanggil archiveMutate dengan version 3", async () => {
    const { archiveMutate } = renderCardDetail();

    triggerPaletteCommand("act-archive-card");

    expect(archiveMutate).toHaveBeenCalledTimes(1);
    expect(archiveMutate).toHaveBeenCalledWith({
      kind: "card",
      entityId: "card-1",
      action: "archive",
      expectedVersion: 3,
    });
  });
});
