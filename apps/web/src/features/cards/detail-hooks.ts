import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, newIdempotencyKey } from "@/lib/api/client";
import type { ActivityEntry } from "@/features/activity/hooks";

export interface CardLabel {
  id: string;
  name: string;
  scope: string;
}

export interface CardDetail {
  id: string;
  listId: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  dueDate?: string | null;
  assigneeUserId?: string | null;
  version: number;
  archivedAt: string | null;
  deletedAt: string | null;
  labels?: CardLabel[];
}

// GET detail → { card } (labels disertakan khusus endpoint ini — C.8/2.8.1).
export function useCard(projectId: string | undefined, cardId: string | undefined) {
  return useQuery({
    queryKey: ["card", projectId, cardId],
    enabled: Boolean(projectId && cardId),
    queryFn: () =>
      apiRequest<{ card: CardDetail }>(`/api/v1/projects/${projectId}/cards/${cardId}`),
    select: (d) => d.card,
  });
}

// GET /v1/projects/:p/cards/:c/activities → { activities } (C.9 convenience).
export function useCardActivities(projectId: string | undefined, cardId: string | undefined) {
  return useQuery({
    queryKey: ["card-activities", projectId, cardId],
    enabled: Boolean(projectId && cardId),
    queryFn: () =>
      apiRequest<{ activities: ActivityEntry[] }>(
        `/api/v1/projects/${projectId}/cards/${cardId}/activities`,
      ),
    select: (d) => d.activities,
  });
}

// PATCH generic update (7.7.4): HANYA field mutable C.15; expectedVersion
// wajib; listId/version dll ditolak server dan tidak pernah dikirim UI.
const MUTABLE_FIELDS = new Set(["title", "subtitle", "description", "dueDate", "assignee"]);

export function buildCardPatch(
  changes: Record<string, unknown>,
  expectedVersion: number,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { expectedVersion };
  for (const [key, value] of Object.entries(changes)) {
    if (!MUTABLE_FIELDS.has(key)) {
      throw new Error(`Field '${key}' bukan field mutable Card (C.15) — gunakan domain command.`);
    }
    patch[key] = value;
  }
  return patch;
}

export function useUpdateCard(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      cardId,
      changes,
      expectedVersion,
    }: {
      cardId: string;
      changes: Record<string, unknown>;
      expectedVersion: number;
    }) => {
      const res = await apiRequest<{ card: CardDetail }>(
        `/api/v1/projects/${projectId}/cards/${cardId}`,
        {
          method: "PATCH",
          body: buildCardPatch(changes, expectedVersion),
          idempotencyKey: newIdempotencyKey(),
        },
      );
      return res.card;
    },
    onSuccess: (card) => {
      void queryClient.invalidateQueries({ queryKey: ["card", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["cards", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["card-activities", projectId, card.id] });
    },
  });
}
