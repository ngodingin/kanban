import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";

export interface ListSummary {
  id: string;
  boardId: string;
  title: string;
  archivedAt: string | null;
  deletedAt: string | null;
}

// GET /v1/projects/:project_id/boards/:board_id/lists → { lists: [...] }
export function useLists(projectId: string | undefined, boardId: string | undefined) {
  return useQuery({
    queryKey: ["lists", projectId, boardId],
    enabled: Boolean(projectId && boardId),
    queryFn: () =>
      apiRequest<{ lists: ListSummary[] }>(
        `/api/v1/projects/${projectId}/boards/${boardId}/lists`,
      ),
  });
}
