import { useProjects } from "@/features/projects/hooks";
import { useActivities } from "@/features/activity/hooks";

// 7.4.2 — Recent Projects (urutan kunjungan sisi klien, UI-only state di
// localStorage) + Recent Activity (C.9, per konteks Project — TIDAK ada
// cross-project search endpoint).
const RECENT_KEY = "kanban.recent-projects";
const MAX_RECENT = 5;

export function recordProjectVisit(projectId: string): void {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    const next = [projectId, ...ids.filter((id) => id !== projectId)].slice(0, MAX_RECENT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // localStorage tidak tersedia — fitur recent bersifat best-effort.
  }
}

export function readRecentProjectIds(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function orderRecentFirst<T extends { id: string }>(
  projects: ReadonlyArray<T>,
  recentIds: ReadonlyArray<string>,
): T[] {
  const rank = new Map(recentIds.map((id, i) => [id, i]));
  return [...projects].sort(
    (a, b) =>
      (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

export function useRecentContext(activeProjectId?: string) {
  const projectsQuery = useProjects();
  const ordered = orderRecentFirst(projectsQuery.data ?? [], readRecentProjectIds());
  const contextId = activeProjectId ?? ordered[0]?.id;
  return { ordered, contextId };
}

export function RecentActivityPreview({ projectId }: { projectId?: string }) {
  const activities = useActivities(projectId);
  const latest = (activities.data?.activities ?? []).slice(0, 5);
  if (!projectId) {
    return <p className="text-sm text-muted-foreground">Belum ada konteks Project.</p>;
  }
  return (
    <ul aria-label="Recent Activity" className="flex flex-col gap-1 text-sm">
      {latest.length === 0 ? (
        <li className="text-muted-foreground">—</li>
      ) : (
        latest.map((a) => (
          <li key={a.id}>
            <span className="font-medium">{a.action}</span>{" "}
            <span className="text-muted-foreground">
              · {new Date(a.createdAt).toLocaleString("id-ID")}
            </span>
          </li>
        ))
      )}
    </ul>
  );
}
