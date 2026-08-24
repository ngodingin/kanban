import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";

export interface ActivityEntry {
  id: string;
  entityType: string;
  entityId: string;
  entityVersion: number;
  actorUserId: string;
  action: string;
  data: unknown;
  createdAt: string;
}

// GET /v1/projects/:project_id/activities → { activities: [...] }
// Read-only audit trail (02-SPEC A.8) — tidak ada jalur mutasi di sini.
export function useActivities(projectId: string | undefined) {
  return useQuery({
    queryKey: ["activities", projectId],
    enabled: Boolean(projectId),
    queryFn: () =>
      apiRequest<{ activities: ActivityEntry[] }>(
        `/api/v1/projects/${projectId}/activities`,
      ),
  });
}

export interface ActivityGroup {
  dayLabel: string;
  entries: Array<{ id: string; timeLabel: string; entry: ActivityEntry }>;
}

/** Murni & diuji: kelompokkan berdasarkan hari (label locale), urut waktu. */
export function groupByDay(
  activities: ReadonlyArray<ActivityEntry>,
  now = new Date(),
): ActivityGroup[] {
  const dayFmt = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const map = new Map<string, ActivityGroup>();
  for (const entry of [...activities].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )) {
    const d = new Date(entry.createdAt);
    const key = d.toDateString();
    let group = map.get(key);
    if (!group) {
      const today = now.toDateString();
      const yesterday = new Date(now.getTime() - 86_400_000).toDateString();
      const label =
        key === today ? "Hari ini" : key === yesterday ? "Kemarin" : dayFmt.format(d);
      group = { dayLabel: label, entries: [] };
      map.set(key, group);
    }
    group.entries.push({ id: entry.id, timeLabel: timeFmt.format(d), entry });
  }
  return [...map.values()];
}
