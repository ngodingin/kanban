import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import type { ActivityEntry } from "@/features/activity/hooks";

// GET /v1/projects/:project_id/activities → { activities: [...] } (C.9).
// Filter `action` di server exact-match; audit butuh banyak aksi lifecycle
// sekaligus, jadi fetch sekali lalu filter sisi klien.
export function useLifecycleAudit(projectId: string | undefined) {
  return useQuery({
    queryKey: ["activities", projectId],
    enabled: Boolean(projectId),
    queryFn: () =>
      apiRequest<{ activities: ActivityEntry[] }>(
        `/api/v1/projects/${projectId}/activities`,
      ),
    select: selectLifecycleEvents,
  });
}

/** Murni & diuji: hanya event archived/deleted, urut terbaru dulu. */
export function selectLifecycleEvents(
  data: { activities: ActivityEntry[] } | undefined,
): ActivityEntry[] {
  return (data?.activities ?? [])
    .filter((a) => a.action.endsWith(".archived") || a.action.endsWith(".deleted"))
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}
