import { useActivities, groupByDay } from "@/features/activity/hooks";

// Activity timeline (05-FRONTEND §5): audit trail historis grouped by
// day/time — BUKAN notification feed. Read-only: tidak ada tombol aksi,
// edit, atau delete (02-SPEC A.8, A.16 #8).
export function ActivityTimeline({ projectId }: { projectId?: string }) {
  const activitiesQuery = useActivities(projectId);
  const groups = groupByDay(activitiesQuery.data?.activities ?? []);

  if (!projectId) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Pilih Project untuk melihat activity.
      </p>
    );
  }

  return (
    <section aria-label="Activity timeline" className="flex flex-col gap-6 p-4">
      {groups.map((group) => (
        <div key={group.dayLabel}>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
            {group.dayLabel}
          </h3>
          <ol className="flex flex-col gap-1">
            {group.entries.map(({ id, timeLabel, entry }) => (
              <li key={id} className="flex items-baseline gap-3 text-sm" data-action={entry.action}>
                <time className="w-12 shrink-0 text-xs text-muted-foreground" dateTime={entry.createdAt}>
                  {timeLabel}
                </time>
                <span>
                  <span className="font-medium">{entry.action}</span>{" "}
                  <span className="text-muted-foreground">({entry.entityType})</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}
