import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";

export interface CardSummary {
  id: string;
  title: string;
}

// GET /v1/projects/:project_id/lists/:list_id/cards → { cards: [...] }
// Visibility & anti-enumeration ditegakkan server-side (C.8, BR-047..049).
export function useCards(projectId: string | undefined, listId: string | undefined) {
  return useQuery({
    queryKey: ["cards", projectId, listId],
    enabled: Boolean(projectId && listId),
    queryFn: () =>
      apiRequest<{ cards: CardSummary[] }>(
        `/api/v1/projects/${projectId}/lists/${listId}/cards`,
      ),
  });
}
