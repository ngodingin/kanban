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
  useBoard: vi.fn(),
  useMilestone: vi.fn(),
  useProject: vi.fn(),
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

vi.mock("../src/features/projects/hooks", () => ({
  useBoard: mocks.useBoard,
  useMilestone: mocks.useMilestone,
  useProject: mocks.useProject,
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

function renderCardDetail(overrides?: {
  archivedAt?: string | null;
  deletedAt?: string | null;
  boardArchivedAt?: string | null;
  boardDeletedAt?: string | null;
  milestoneArchivedAt?: string | null;
  milestoneDeletedAt?: string | null;
  projectArchivedAt?: string | null;
  projectDeletedAt?: string | null;
}) {
  const moveMutate = vi.fn();
  const archiveMutate = vi.fn();
  mocks.useCard.mockReturnValue({
    data: {
      id: "card-1",
      listId: "list-a",
      title: "Test Card",
      version: 3,
      archivedAt: overrides?.archivedAt ?? null,
      deletedAt: overrides?.deletedAt ?? null,
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
  mocks.useBoard.mockReturnValue({
    data: {
      id: "b1",
      title: "Board 1",
      archivedAt: overrides?.boardArchivedAt ?? null,
      deletedAt: overrides?.boardDeletedAt ?? null,
    },
    isLoading: false,
  });
  mocks.useMilestone.mockReturnValue({
    data: {
      id: "m1",
      title: "Milestone 1",
      archivedAt: overrides?.milestoneArchivedAt ?? null,
      deletedAt: overrides?.milestoneDeletedAt ?? null,
    },
    isLoading: false,
  });
  mocks.useProject.mockReturnValue({
    data: {
      id: "p1",
      name: "Project 1",
      archivedAt: overrides?.projectArchivedAt ?? null,
      deletedAt: overrides?.projectDeletedAt ?? null,
    },
    isLoading: false,
  });

  const onClose = vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/projects/p1/milestones/m1/boards/b1"]}>
        <CardDetailPanel
          projectId="p1"
          milestoneId="m1"
          boardId="b1"
          cardId="card-1"
          onClose={onClose}
        />
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

  test("negatif: card archived → command Move/Archive tidak terdaftar", async () => {
    renderCardDetail({ archivedAt: "2026-08-29T00:00:00Z" });

    const commands = useUiStore.getState().paletteCommands;
    const moveCmd = commands.find((c) => c.id === "act-move-card");
    const archiveCmd = commands.find((c) => c.id === "act-archive-card");

    expect(moveCmd).toBeUndefined();
    expect(archiveCmd).toBeUndefined();
    expect(commands).toHaveLength(0);
  });

  test("negatif: card deleted → command Move/Archive tidak terdaftar", async () => {
    renderCardDetail({ deletedAt: "2026-08-29T00:00:00Z" });

    const commands = useUiStore.getState().paletteCommands;
    const moveCmd = commands.find((c) => c.id === "act-move-card");
    const archiveCmd = commands.find((c) => c.id === "act-archive-card");

    expect(moveCmd).toBeUndefined();
    expect(archiveCmd).toBeUndefined();
    expect(commands).toHaveLength(0);
  });

  test("negatif: card archived+deleted → command Move/Archive tidak terdaftar", async () => {
    renderCardDetail({
      archivedAt: "2026-08-28T00:00:00Z",
      deletedAt: "2026-08-29T00:00:00Z",
    });

    const commands = useUiStore.getState().paletteCommands;
    expect(commands).toHaveLength(0);
  });

  test("negatif: card archived → render card detail tanpa error", async () => {
    renderCardDetail({ archivedAt: "2026-08-29T00:00:00Z" });

    // Card detail should still render (read-only), just without lifecycle commands
    expect(screen.getByText("Test Card")).toBeTruthy();
    expect(screen.getByLabelText("Tutup detail kartu")).toBeTruthy();
  });

  test("negatif: board archived → command Move/Archive tidak terdaftar (effective ancestor)", async () => {
    renderCardDetail({ boardArchivedAt: "2026-08-29T00:00:00Z" });

    const commands = useUiStore.getState().paletteCommands;
    const moveCmd = commands.find((c) => c.id === "act-move-card");
    const archiveCmd = commands.find((c) => c.id === "act-archive-card");

    expect(moveCmd).toBeUndefined();
    expect(archiveCmd).toBeUndefined();
    expect(commands).toHaveLength(0);
  });

  test("negatif: milestone deleted → command Move/Archive tidak terdaftar (effective ancestor)", async () => {
    renderCardDetail({ milestoneDeletedAt: "2026-08-29T00:00:00Z" });

    const commands = useUiStore.getState().paletteCommands;
    expect(commands).toHaveLength(0);
  });

  test("negatif: project archived → command Move/Archive tidak terdaftar (effective ancestor)", async () => {
    renderCardDetail({ projectArchivedAt: "2026-08-29T00:00:00Z" });

    const commands = useUiStore.getState().paletteCommands;
    expect(commands).toHaveLength(0);
  });

  test("negatif: project deleted → command Move/Archive tidak terdaftar (effective ancestor)", async () => {
    renderCardDetail({ projectDeletedAt: "2026-08-29T00:00:00Z" });

    const commands = useUiStore.getState().paletteCommands;
    expect(commands).toHaveLength(0);
  });

  test("negatif: card active tapi board archived → render card detail tanpa error", async () => {
    renderCardDetail({ boardArchivedAt: "2026-08-29T00:00:00Z" });

    expect(screen.getByText("Test Card")).toBeTruthy();
    expect(screen.getByLabelText("Tutup detail kartu")).toBeTruthy();
  });
});
