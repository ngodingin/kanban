import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";

// Query hooks konsumen endpoint domain yang sudah ada (02-SPEC C.4–C.6).
// Semua server state lewat TanStack Query — 05-FRONTEND §3.2.

export interface ProjectSummary {
  id: string;
  name: string;
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => apiRequest<{ projects?: ProjectSummary[] } | ProjectSummary[]>("/api/v1/projects"),
  });
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project", projectId],
    enabled: Boolean(projectId),
    queryFn: () => apiRequest<ProjectSummary>(`/api/v1/projects/${projectId}`),
  });
}

export function useMilestone(projectId: string | undefined, milestoneId: string | undefined) {
  return useQuery({
    queryKey: ["milestone", projectId, milestoneId],
    enabled: Boolean(projectId && milestoneId),
    queryFn: () =>
      apiRequest<ProjectSummary>(`/api/v1/projects/${projectId}/milestones/${milestoneId}`),
  });
}

export function useBoard(
  projectId: string | undefined,
  milestoneId: string | undefined,
  boardId: string | undefined,
) {
  return useQuery({
    queryKey: ["board", projectId, milestoneId, boardId],
    enabled: Boolean(projectId && milestoneId && boardId),
    queryFn: () =>
      apiRequest<ProjectSummary>(
        `/api/v1/projects/${projectId}/milestones/${milestoneId}/boards/${boardId}`,
      ),
  });
}
