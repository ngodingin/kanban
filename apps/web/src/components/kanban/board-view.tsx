import { useLists } from "@/features/lists/hooks";
import { useCards } from "@/features/cards/hooks";

// Board view (05-FRONTEND §5): kolom = List (nama bebas) + count + card list.
// "Review"/"Done" hanyalah nama List — TANPA makna status sistem. Kolom tidak
// dapat dipindahkan; drag Card adalah goal 7.5.2+.
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
      <ul className="flex flex-col gap-2">
        {cards.map((card) => (
          <li
            key={card.id}
            className="rounded-md border border-border bg-card p-2 text-sm"
            data-card-id={card.id}
          >
            {card.title}
          </li>
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

  return (
    <div className="flex flex-1 items-start gap-4 overflow-x-auto p-4">
      {lists.map((list) => (
        <BoardColumn key={list.id} projectId={projectId} listId={list.id} title={list.title} />
      ))}
    </div>
  );
}
