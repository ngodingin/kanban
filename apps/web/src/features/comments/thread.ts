import type { ActivityEntry } from "@/features/activity/hooks";

// C.10/BR-030 — Comment adalah Activity. Thread dirender dari trail:
// `comment.added` (data.body) = komentar dasar; `comment.edited`
// (data.commentActivityId → original, data.after) = rantai edit terakhir
// menang. Tidak ada delete (C.10).
export interface CommentThreadItem {
  originalId: string;
  actorUserId: string;
  createdAt: string;
  body: string;
  editedAt: string | null;
}

export function deriveCommentThread(
  activities: ReadonlyArray<ActivityEntry>,
): CommentThreadItem[] {
  const chrono = [...activities].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const byOriginal = new Map<string, CommentThreadItem>();

  for (const entry of chrono) {
    const data = (entry.data ?? {}) as {
      body?: unknown;
      after?: unknown;
      commentActivityId?: unknown;
    };
    if (entry.action === "comment.added") {
      byOriginal.set(entry.id, {
        originalId: entry.id,
        actorUserId: entry.actorUserId,
        createdAt: entry.createdAt,
        body: String(data.body ?? ""),
        editedAt: null,
      });
    } else if (entry.action === "comment.edited") {
      const target = byOriginal.get(String(data.commentActivityId));
      if (!target) continue; // edit untuk thread yang tidak terlihat — abaikan aman
      target.body = String(data.after ?? target.body);
      target.editedAt = entry.createdAt;
    }
  }
  return [...byOriginal.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}
