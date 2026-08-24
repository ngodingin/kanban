import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { useLists } from "@/features/lists/hooks";
import { useCards } from "@/features/cards/hooks";
import { useMoveCard } from "@/features/cards/mutations";

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

interface DraggableCardProps {
  projectId: string;
  listId: string;
  card: { id: string; title: string };
}

function DraggableCard({ listId, card }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `card:${card.id}`,
    data: { kind: "card", cardId: card.id, listId },
  });

  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-card-id={card.id}
      aria-roledescription="Kartu dapat dipindahkan"
      className={`cursor-grab rounded-md border border-border bg-card p-2 text-sm ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      {card.title}
    </li>
  );
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
      <header className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground" aria-label={`Jumlah kartu ${title}`}>
          {cardsQuery.isLoading ? "…" : cards.length}
        </span>
      </header>
      {/* Area drop kolom */}
      <ul ref={setNodeRef} className="flex min-h-16 flex-col gap-2">
        {cards.map((card) => (
          <DraggableCard key={card.id} projectId={projectId} listId={listId} card={card} />
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
      <div className="flex flex-1 items-start gap-4 overflow-x-auto p-4">
        {lists.map((list) => (
          <BoardColumn key={list.id} projectId={projectId} listId={list.id} title={list.title} />
        ))}
      </div>
    </DndContext>
  );
}
