import { useLifecycleAudit } from "@/features/lifecycle/audit";

// Archived/Deleted Audit view (7.13.4): read-only murni di atas activity
// trail immutable — tanpa tombol aksi apa pun. Permission ditegakkan
// server-side; view hanya menampilkan yang boleh dibaca.
export function LifecycleAuditView({ projectId }: { projectId?: string }) {
  const auditQuery = useLifecycleAudit(projectId);
  const events = auditQuery.data ?? [];

  if (!projectId) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Pilih Project untuk melihat audit arsip/hapus.
      </p>
    );
  }

  return (
    <section aria-label="Audit arsip dan hapus" className="p-4">
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada event arsip/hapus.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="py-1 pr-3 font-medium">Waktu</th>
              <th className="py-1 pr-3 font-medium">Aksi</th>
              <th className="py-1 pr-3 font-medium">Entity</th>
              <th className="py-1 font-medium">Aktor</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} data-action={e.action}>
                <td className="py-1 pr-3 text-muted-foreground">
                  <time dateTime={e.createdAt}>
                    {new Date(e.createdAt).toLocaleString("id-ID")}
                  </time>
                </td>
                <td className="py-1 pr-3 font-medium">{e.action}</td>
                <td className="py-1 pr-3">
                  {e.entityType} · {e.entityId.slice(-6)}
                </td>
                <td className="py-1 text-muted-foreground">{e.actorUserId.slice(-6)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
