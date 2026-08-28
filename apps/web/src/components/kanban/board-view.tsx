import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/lib/api/client";
import { KanbanCard } from "@/components/kanban/card";
import { useLists } from "@/features/lists/hooks";
import { useCards } from "@/features/cards/hooks";
import { useMoveCard } from "@/features/cards/mutations";
import { useUiStore } from "@/lib/ui-store";

// Board view + drag & drop Card antar List (05-FRONTEND §3.1/§5): hanya Card
// yang dapat dipindahkan; kolom/List tidak draggable (02-SPEC A.5). Move
// memanggil domain command C.8 dengan expectedVersion dari detail kartu
// TERKINI saat drop (anti stale version), bukan menimpa state lokal.

export interface MovePlan {
  cardId: string;
  destinationListId: string;
}

/** Murni & mudah diuji: rencana move hanya bila Card di-drop ke List berbeda. */
export function planMove(
  active: { kind: "card"; cardId: string; listId: string } | undefined,
  over: { kind: "list"; listId: string } | undefined,
): MovePlan | null {
  if (!active || !over || active.listId === over.listId) return null;
  return { cardId: active.cardId, destinationListId: over.listId };
}

function BoardColumn({
  projectId,
  listId,
  title,
}: {
  projectId: string;
  listId: string;
  title: string;
}) {
  const cardsQuery = useCards(projectId, listId);
  const cards = cardsQuery.data?.cards ?? [];
  const { setNodeRef, isOver } = useDroppable({
    id: `list:${listId}`,
    data: { kind: "list", listId },
  });
  void isOver;

  return (
    <section
      aria-label={`List ${title}`}
      className="flex w-64 shrink-0 flex-col gap-2 rounded-md bg-muted p-2"
    >
      {/* Kolom tidak menumpuk vertikal di mobile — wajib horizontal (§7). */}
      <header className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground" aria-label={`Jumlah kartu ${title}`}>
          {cardsQuery.isLoading ? "…" : cards.length}
        </span>
      </header>
      {/* Area drop kolom */}
      <ul ref={setNodeRef} className="flex min-h-16 flex-col gap-2">
        {cards.map((card) => (
          <KanbanCard key={card.id} card={card} listId={listId} />
        ))}
      </ul>
    </section>
  );
}

export function BoardView({
  projectId,
  boardId,
}: {
  projectId: string;
  boardId: string;
}) {
  const listsQuery = useLists(projectId, boardId);
  const lists = listsQuery.data?.lists ?? [];
  const moveMutation = useMoveCard(projectId);
  const queryClient = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor));
  const [conflictDismissed, setConflictDismissed] = useState(false);
  const registerPaletteCommands = useUiStore((s) => s.registerPaletteCommands);

  // Register card commands for palette when on a board
  useEffect(() => {
    if (lists.length === 0) return;
    const firstListId = lists[0].id;
    registerPaletteCommands([
      {
        id: "act-create-card",
        label: "Buat Card Baru",
        group: "Aksi",
        run: () => {
          // Placeholder — actual creation needs a form/modal (not in scope of palette)
          window.alert(`Create Card in list ${firstListId}`);
        },
      },
    ]);
    return () => registerPaletteCommands([]);
  }, [lists, registerPaletteCommands]);
  const conflict =
    moveMutation.error instanceof ApiError && moveMutation.error.code === "VERSION_CONFLICT"
      ? moveMutation.error
      : null;

  async function onDragEnd(event: DragEndEvent) {
    const activeData = event.active.data.current as
      | { kind: "card"; cardId: string; listId: string }
      | undefined;
    const overData = event.over?.data.current as
      | { kind: "list"; listId: string }
      | undefined;
    const plan = planMove(activeData, overData);
    if (!plan) return;

    // Ambil version TERKINI dari server sebelum command move (optimistic
    // locking tetap ditegakkan server; client hanya menyediakan nilai jujur).
    const detail = await queryClient.fetchQuery({
      queryKey: ["card", projectId, plan.cardId],
      queryFn: () =>
        apiRequest<{ id: string; version: number }>(
          `/api/v1/projects/${projectId}/cards/${plan.cardId}`,
        ),
      staleTime: 0,
    });

    moveMutation.mutate({
      cardId: plan.cardId,
      destinationListId: plan.destinationListId,
      expectedVersion: detail.version,
    });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex flex-1 flex-col">
        {/* 7.5.4 — VERSION_CONFLICT: pesan + data sudah di-reload via invalidasi;
            tidak ada penimpaan state lokal. */}
        {conflict && !conflictDismissed ? (
          <div role="alert" className="flex items-center justify-between bg-warning/15 px-4 py-2 text-sm text-foreground">
            <span>
              Kartu sudah berubah di server (VERSION_CONFLICT). Papan dimuat ulang — coba pindahkan lagi.
            </span>
            <button
              type="button"
              aria-label="Tutup pesan konflik"
              onClick={() => setConflictDismissed(true)}
              className="rounded px-2 py-1 hover:bg-accent"
            >
              Tutup
            </button>
          </div>
        ) : null}
        <div className="flex flex-1 flex-nowrap items-start gap-4 overflow-x-auto p-4">
          {lists.map((list) => (
            <BoardColumn key={list.id} projectId={projectId} listId={list.id} title={list.title} />
          ))}
        </div>
      </div>
    </DndContext>
  );
}
