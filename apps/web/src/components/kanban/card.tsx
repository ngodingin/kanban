import { useDraggable } from "@dnd-kit/core";

// Card compact (05-FRONTEND §5): title · description preview · labels ·
// assignee · due date. TANPA priority, TANPA progress, TANPA status field —
// field itu tidak ada di domain (§4 rekonsiliasi UI↔domain).

export interface KanbanCardData {
  id: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  assigneeUserId?: string | null;
  labels?: ReadonlyArray<{ id: string; name: string }>;
}

const PREVIEW_MAX = 80;

export function previewDescription(text: string | null | undefined): string {
  if (!text) return "";
  return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}…` : text;
}

export function formatDueDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export function KanbanCard({ card, listId, onSelect }: { card: KanbanCardData; listId: string; onSelect?: (cardId: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `card:${card.id}`,
    data: { kind: "card", cardId: card.id, listId },
  });

  const preview = previewDescription(card.description);

  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-card-id={card.id}
      aria-roledescription="Kartu dapat dipindahkan"
      onClick={() => onSelect?.(card.id)}
      className={`cursor-grab rounded-md border border-border bg-card p-2 text-sm ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <p className="font-medium">{card.title}</p>
      {preview ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{preview}</p>
      ) : null}

      {card.labels && card.labels.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1">
          {card.labels.map((label) => (
            <li
              key={label.id}
              className="rounded-sm bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground"
            >
              {label.name}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        {card.assigneeUserId ? (
          <span aria-label={`Assignee ${card.assigneeUserId}`} title={card.assigneeUserId}>
            ● {card.assigneeUserId.slice(-4)}
          </span>
        ) : (
          <span />
        )}
        {formatDueDate(card.dueDate) ? <time dateTime={card.dueDate ?? undefined}>{formatDueDate(card.dueDate)}</time> : null}
      </div>
    </li>
  );
}
