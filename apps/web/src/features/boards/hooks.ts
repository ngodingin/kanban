import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";

export interface BoardSummary {
  id: string;
  milestoneId: string;
  name: string;
}

// GET /v1/projects/:project_id/milestones/:milestone_id/boards → { boards }
// Endpoint SUDAH scoping per Milestone — kandidat move antar Board secara
// struktural tidak mungkin lintas-Milestone (BR-018).
export function useBoards(projectId: string | undefined, milestoneId: string | undefined) {
  return useQuery({
    queryKey: ["boards", projectId, milestoneId],
    enabled: Boolean(projectId && milestoneId),
    queryFn: () =>
      apiRequest<{ boards: BoardSummary[] }>(
        `/api/v1/projects/${projectId}/milestones/${milestoneId}/boards`,
      ),
  });
}

/** Murni & diuji: kandidat board tujuan = Milestone sama, bukan board asal. */
export function siblingBoards(
  boards: ReadonlyArray<BoardSummary>,
  currentMilestoneId: string,
  currentBoardId: string,
): Array<{ id: string; name: string }> {
  return boards
    .filter((b) => b.milestoneId === currentMilestoneId && b.id !== currentBoardId)
    .map(({ id, name }) => ({ id, name }));
}
