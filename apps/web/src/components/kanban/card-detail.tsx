import { useState } from "react";
import { useCard, useUpdateCard } from "@/features/cards/detail-hooks";
import { useCardActivities } from "@/features/cards/detail-hooks";
import { deriveCommentThread } from "@/features/comments/thread";
import { useAddComment, useEditComment } from "@/features/comments/hooks";
import { groupByDay } from "@/features/activity/hooks";
import { apiRequest } from "@/lib/api/client";
import { useQuery } from "@tanstack/react-query";

// Card Detail (05-FRONTEND §5): tab Details (description, assignee, due date,
// labels, **current List** — bukan "status") + Activity (immutable) +
// Comments (add + edit own, tanpa delete). Sheet besar desktop / full-screen
// mobile adalah polish 7.14.x; panel ini fondasi fungsionalnya.
export type DetailTab = "details" | "activity" | "comments";

function CurrentListTitle({
  projectId,
  listId,
}: {
  projectId: string;
  listId: string;
}) {
  const q = useQuery({
    queryKey: ["list", projectId, listId],
    queryFn: () =>
      apiRequest<{ list: { id: string; title: string } }>(
        `/api/v1/projects/${projectId}/lists/${listId}`,
      ),
    select: (d) => d.list,
  });
  return <span>{q.data?.title ?? "…"}</span>;
}

function CommentsTab({
  projectId,
  cardId,
  currentUserId,
}: {
  projectId: string;
  cardId: string;
  currentUserId?: string;
}) {
  const activities = useCardActivities(projectId, cardId);
  const thread = deriveCommentThread(activities.data ?? []);
  const add = useAddComment(projectId);
  const edit = useEditComment(projectId);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Daftar komentar" className="flex flex-col gap-2">
        {thread.map((c) => (
          <li key={c.originalId} data-comment-id={c.originalId} className="rounded-md border border-border bg-card p-2 text-sm">
            <div className="text-xs text-muted-foreground">
              {c.actorUserId.slice(-6)} ·{" "}
              {new Date(c.createdAt).toLocaleString("id-ID")}
              {c.editedAt ? " · diedit" : ""}
            </div>
            {editing?.id === c.originalId ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  edit.mutate(
                    { cardId, commentActivityId: c.originalId, body: editing.body },
                    { onSuccess: () => setEditing(null) },
                  );
                }}
                className="mt-1 flex flex-col gap-1"
              >
                <textarea
                  aria-label="Ubah komentar"
                  value={editing.body}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                  className="rounded-md border border-input bg-background p-1 text-sm"
                />
                <div className="flex gap-1">
                  <button type="submit" disabled={edit.isPending} className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                    Simpan
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className="rounded border border-input px-2 py-0.5 text-xs">
                    Batal
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
                {currentUserId && c.actorUserId === currentUserId ? (
                  <button
                    type="button"
                    onClick={() => setEditing({ id: c.originalId, body: c.body })}
                    className="mt-1 text-xs text-muted-foreground underline"
                  >
                    Edit
                  </button>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>

      <form
        aria-label="Form komentar"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          add.mutate(
            { cardId, body: draft },
            { onSuccess: () => setDraft("") },
          );
        }}
        className="flex items-end gap-2"
      >
        <label className="text-xs text-muted-foreground">
          Komentar
          <textarea
            name="body"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="ml-2 rounded-md border border-input bg-background p-1 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={add.isPending || !draft.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Kirim
        </button>
      </form>
      {add.isError || edit.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {add.error instanceof Error ? add.error.message : edit.error instanceof Error ? edit.error.message : ""}
        </p>
      ) : null}
    </div>
  );
}

export function CardDetailPanel({
  projectId,
  cardId,
  currentUserId,
}: {
  projectId: string;
  cardId: string;
  currentUserId?: string;
}) {
  const cardQuery = useCard(projectId, cardId);
  const activities = useCardActivities(projectId, cardId);
  const update = useUpdateCard(projectId);
  const [tab, setTab] = useState<DetailTab>("details");
  const [descriptionDraft, setDescriptionDraft] = useState<string | null>(null);

  if (cardQuery.isLoading) return <p className="p-4 text-sm">Memuat…</p>;
  const card = cardQuery.data;
  if (!card) return <p className="p-4 text-sm text-muted-foreground">Card tidak tersedia.</p>;

  const groups = groupByDay(activities.data ?? []);

  return (
    <section
      aria-label="Detail kartu"
      className="flex flex-col gap-3 bg-background p-4 max-md:fixed max-md:inset-0 max-md:z-40 md:relative"
    >
      <h2 className="text-lg font-semibold">{card.title}</h2>

      <nav aria-label="Tab detail kartu" className="flex gap-2 text-sm">
        {(
          [
            ["details", "Details"],
            ["activity", "Activity"],
            ["comments", "Comments"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-current={tab === key ? "true" : undefined}
            onClick={() => setTab(key)}
            className={`rounded px-2 py-1 ${tab === key ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "details" ? (
        <dl className="flex flex-col gap-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Description</dt>
            <dd>
              <textarea
                aria-label="Description"
                value={descriptionDraft ?? card.description ?? ""}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                className="w-full rounded-md border border-input bg-background p-2"
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Due date</dt>
            <dd>{card.dueDate ? new Date(card.dueDate).toLocaleDateString("id-ID") : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Assignee</dt>
            <dd>{card.assigneeUserId ? `● ${card.assigneeUserId.slice(-6)}` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Labels</dt>
            <dd className="flex flex-wrap gap-1">
              {(card.labels ?? []).map((l) => (
                <span key={l.id} className="rounded-sm bg-accent px-1.5 py-0.5 text-xs">
                  {l.name}
                </span>
              ))}
              {(card.labels ?? []).length === 0 ? "—" : null}
            </dd>
          </div>
          {/* §4 rekonsiliasi: label "List", BUKAN "Status". */}
          <div>
            <dt className="text-xs text-muted-foreground">List</dt>
            <dd>
              <CurrentListTitle projectId={projectId} listId={card.listId} />
            </dd>
          </div>

          {descriptionDraft !== null && descriptionDraft !== (card.description ?? "") ? (
            <button
              type="button"
              onClick={() =>
                update.mutate({
                  cardId,
                  changes: { description: descriptionDraft },
                  expectedVersion: card.version,
                })
              }
              disabled={update.isPending}
              className="self-start rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {update.isPending ? "Menyimpan..." : "Simpan description"}
            </button>
          ) : null}
          {update.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {update.error instanceof Error ? update.error.message : ""}
            </p>
          ) : null}
        </dl>
      ) : null}

      {tab === "activity" ? (
        <div aria-label="Activity timeline" className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.dayLabel}>
              <h3 className="mb-1 text-xs font-semibold text-muted-foreground">{g.dayLabel}</h3>
              <ol className="flex flex-col gap-1 text-sm">
                {g.entries.map(({ id, timeLabel, entry }) => (
                  <li key={id} className="flex gap-2">
                    <time className="w-12 shrink-0 text-xs text-muted-foreground">{timeLabel}</time>
                    <HistoricalLine entry={entry} />
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "comments" ? (
        <CommentsTab projectId={projectId} cardId={cardId} currentUserId={currentUserId} />
      ) : null}
    </section>
  );
}

/** 7.8.2 — render payload memakai konteks HISTORIS dari `data` (B.5). */
export function describeActivity(entry: {
  action: string;
  entityType: string;
  data: unknown;
}): string {
  const data = (entry.data ?? {}) as {
    from?: { listTitle?: string };
    to?: { listTitle?: string };
    previousState?: string;
    body?: unknown;
    after?: unknown;
    changes?: Record<string, unknown>;
  };
  switch (entry.action) {
    case "card.moved":
      return `Dipindahkan dari List “${data.from?.listTitle ?? "?"}” ke “${data.to?.listTitle ?? "?"}”`;
    case "comment.added":
      return `Komentar: ${String(data.body ?? "")}`;
    case "comment.edited":
      return `Komentar diubah menjadi: ${String(data.after ?? "")}`;
    default:
      if (entry.action.endsWith(".archived") && data.previousState) {
        return `Diarsipkan (sebelumnya ${data.previousState})`;
      }
      return entry.action;
  }
}

function HistoricalLine({ entry }: { entry: import("@/features/activity/hooks").ActivityEntry }) {
  return (
    <span>
      {describeActivity(entry)}{" "}
      <span className="text-muted-foreground">({entry.entityType})</span>
    </span>
  );
}
