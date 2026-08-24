import { useQueries } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import type { CardSummary } from "@/features/cards/hooks";

// 7.4.1 — agregasi "Your work" HANYA lewat endpoint Project-scoped existing
// (BR-010): walk hierarki per Project di sisi klien. Tidak ada endpoint/
// search lintas-Project baru; visibility tetap ditegakkan server per request.

interface FlatCard extends CardSummary {
  projectId: string;
  listId: string;
  dueDate?: string | null;
  assigneeUserId?: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
}

async function flattenProjectCards(projectId: string): Promise<FlatCard[]> {
  const { milestones } = await apiRequest<{
    milestones: Array<{ id: string }>;
  }>(`/api/v1/projects/${projectId}/milestones`);
  const out: FlatCard[] = [];
  for (const m of milestones) {
    const { boards } = await apiRequest<{ boards: Array<{ id: string }> }>(
      `/api/v1/projects/${projectId}/milestones/${m.id}/boards`,
    );
    for (const b of boards) {
      const { lists } = await apiRequest<{ lists: Array<{ id: string }> }>(
        `/api/v1/projects/${projectId}/boards/${b.id}/lists`,
      );
      for (const l of lists) {
        const { cards } = await apiRequest<{
          cards: Array<FlatCard & { version: number }>;
        }>(`/api/v1/projects/${projectId}/lists/${l.id}/cards`);
        for (const c of cards) {
          out.push({ ...c, projectId, listId: c.listId ?? l.id });
        }
      }
    }
  }
  return out;
}

export function useYourWorkCards(projectIds: ReadonlyArray<string>) {
  const queries = useQueries({
    queries: projectIds.map((projectId) => ({
      queryKey: ["your-work", projectId],
      queryFn: () => flattenProjectCards(projectId),
    })),
  });
  return {
    isLoading: queries.some((q) => q.isLoading),
    cards: queries.flatMap((q) => q.data ?? []),
  };
}

export type WorkBucket = "myTasks" | "dueSoon" | "overdue";

const DUE_SOON_DAYS = 7;

/** Murni & diuji: pembagian bucket dari field domain yang ADA. */
export function bucketFor(
  card: Pick<FlatCard, "assigneeUserId" | "archivedAt" | "deletedAt" | "dueDate">,
  currentUserId: string | undefined,
  now = new Date(),
): WorkBucket | null {
  if (card.deletedAt || card.archivedAt) return null;
  const mine =
    currentUserId !== undefined &&
    (card.assigneeUserId === currentUserId);
  if (!mine) return null;
  if (!card.dueDate) return "myTasks";
  const due = new Date(card.dueDate);
  if (Number.isNaN(due.getTime())) return "myTasks";
  if (due < now) return "overdue";
  const soon = new Date(now.getTime() + DUE_SOON_DAYS * 86_400_000);
  return due <= soon ? "dueSoon" : "myTasks";
}
