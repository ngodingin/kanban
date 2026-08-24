import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";

// Kontrak nyata API (02-SPEC C.4–C.6): single-resource GET terbungkus
// { project } / { milestone } / { board }; Project memakai `name`,
// Milestone & Board memakai `title` (C.2.1 camelCase).

export interface ProjectSummary {
  id: string;
  name: string;
}

export interface MilestoneSummary {
  id: string;
  title: string;
}

export interface BoardSummary {
  id: string;
  title: string;
}

// GET /v1/projects → { projects: [...] }
export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => apiRequest<{ projects: ProjectSummary[] }>("/api/v1/projects"),
    select: (d) => d.projects,
  });
}

// GET /v1/projects/:project_id → { project: {...name} }
export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project", projectId],
    enabled: Boolean(projectId),
    queryFn: () =>
      apiRequest<{ project: ProjectSummary & Record<string, unknown> }>(
        `/api/v1/projects/${projectId}`,
      ),
    select: (d) => d.project,
  });
}

// GET /v1/projects/:project_id/milestones/:milestone_id → { milestone: {...title} }
export function useMilestone(projectId: string | undefined, milestoneId: string | undefined) {
  return useQuery({
    queryKey: ["milestone", projectId, milestoneId],
    enabled: Boolean(projectId && milestoneId),
    queryFn: () =>
      apiRequest<{ milestone: MilestoneSummary & Record<string, unknown> }>(
        `/api/v1/projects/${projectId}/milestones/${milestoneId}`,
      ),
    select: (d) => d.milestone,
  });
}

// GET /v1/projects/:project_id/milestones/:milestone_id/boards/:board_id
//   → { board: {...title} }
export function useBoard(
  projectId: string | undefined,
  milestoneId: string | undefined,
  boardId: string | undefined,
) {
  return useQuery({
    queryKey: ["board", projectId, milestoneId, boardId],
    enabled: Boolean(projectId && milestoneId && boardId),
    queryFn: () =>
      apiRequest<{ board: BoardSummary & Record<string, unknown> }>(
        `/api/v1/projects/${projectId}/milestones/${milestoneId}/boards/${boardId}`,
      ),
    select: (d) => d.board,
  });
}
