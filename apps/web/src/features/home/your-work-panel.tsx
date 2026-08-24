import { useYourWorkCards, bucketFor, type WorkBucket } from "@/features/home/your-work";

// Panel "Your work" (05-FRONTEND §5): My Tasks / Due soon / Overdue —
// work-management tool, BUKAN admin panel (tanpa revenue/charts).
const LABEL: Record<WorkBucket, string> = {
  myTasks: "My Tasks",
  dueSoon: "Due soon",
  overdue: "Overdue",
};

export function YourWorkPanel({
  projectIds,
  currentUserId,
}: {
  projectIds: ReadonlyArray<string>;
  currentUserId?: string;
}) {
  const { cards, isLoading } = useYourWorkCards(projectIds);

  const buckets: Record<WorkBucket, typeof cards> = {
    myTasks: [],
    dueSoon: [],
    overdue: [],
  };
  for (const card of cards) {
    const b = bucketFor(card, currentUserId);
    if (b) buckets[b].push(card);
  }

  if (isLoading) return <p className="p-4 text-sm">Mengumpulkan tugas…</p>;

  return (
    <section aria-label="Your work" className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3">
      {(Object.keys(buckets) as WorkBucket[]).map((bucket) => (
        <div key={bucket} className="rounded-md border border-border p-3">
          <h3 className="mb-2 text-sm font-semibold">{LABEL[bucket]}</h3>
          <ul className="flex flex-col gap-1 text-sm" data-bucket={bucket}>
            {buckets[bucket].length === 0 ? (
              <li className="text-muted-foreground">—</li>
            ) : (
              buckets[bucket].map((c) => (
                <li key={`${c.projectId}:${c.id}`} data-card-id={c.id}>
                  {c.title}
                </li>
              ))
            )}
          </ul>
        </div>
      ))}
    </section>
  );
}
