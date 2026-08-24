import { useState } from "react";
import { ConfirmLifecycleDialog } from "@/components/kanban/confirm-lifecycle-dialog";
import { useLifecycleMutation } from "@/features/lifecycle/hooks";
import { availableLifecycleActions, describeRestoreBlock } from "@/features/lifecycle/guards";
import { ApiError } from "@/lib/api/client";

// Menu aksi lifecycle berbasis state entity (7.13.2/7.13.3):
// ACTIVE → Archive/Delete · ARCHIVED → Restore · DELETED → tanpa tombol.
// Restore ditolak server bila ancestor belum ACTIVE → pesan + shortcut aktif
// "Restore [parent] first" yang benar-benar menjalankan restore parent (A.5).
export type LifecycleKind = "milestone" | "board" | "list" | "card";

export function LifecycleActionsMenu({
  projectId,
  kind,
  entityId,
  entityTitle,
  expectedVersion,
  archivedAt,
  deletedAt,
  parent,
}: {
  projectId: string;
  kind: LifecycleKind;
  entityId: string;
  entityTitle: string;
  expectedVersion: number;
  archivedAt?: string | null;
  deletedAt?: string | null;
  parent?: {
    kind: Exclude<LifecycleKind, "card"> | "project";
    id: string;
    title: string;
    expectedVersion: number;
  } | null;
}) {
  const mutation = useLifecycleMutation(projectId);
  const [openAction, setOpenAction] = useState<"archive" | "restore" | "delete" | null>(null);
  const actions = availableLifecycleActions({ archivedAt, deletedAt });

  if (actions.length === 0) return null; // DELETED terminal — tidak ada tombol restore

  const restoreBlock = mutation.isError ? describeRestoreBlock(mutation.error) : null;

  function confirm() {
    if (!openAction) return;
    mutation.mutate(
      { kind, entityId, action: openAction, expectedVersion },
      { onSuccess: () => setOpenAction(null) },
    );
  }

  function restoreParentFirst() {
    if (!parent || parent.kind === "project") return;
    mutation.mutate({
      kind: parent.kind,
      entityId: parent.id,
      action: "restore",
      expectedVersion: parent.expectedVersion,
    });
  }

  const shortcut =
    restoreBlock && parent && parent.kind !== "project" ? (
      <button
        type="button"
        className="mt-1 text-xs font-medium underline"
        onClick={restoreParentFirst}
        disabled={mutation.isPending}
      >
        Restore {restoreBlock.ancestorKind} first
      </button>
    ) : null;

  return (
    <div data-testid={`lifecycle-menu-${entityId}`}>
      <div className="flex gap-1">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            aria-label={`${action === "archive" ? "Arsipkan" : action === "restore" ? "Pulihkan" : "Hapus"} ${entityTitle}`}
            onClick={() => setOpenAction(action)}
            className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
          >
            {action === "archive" ? "Arsipkan" : action === "restore" ? "Pulihkan" : "Hapus"}
          </button>
        ))}
      </div>

      {restoreBlock && !openAction && !mutation.isPending ? (
        <div role="alert" className="mt-1 flex items-center gap-2 rounded bg-warning/15 px-2 py-1 text-xs">
          <span>{mutation.error instanceof Error ? mutation.error.message : ""}</span>
          {shortcut}
        </div>
      ) : null}

      {openAction ? (
        <ConfirmLifecycleDialog
          kind={kind}
          entityTitle={entityTitle}
          action={openAction}
          pending={mutation.isPending}
          error={
            mutation.error instanceof ApiError
              ? `${mutation.error.code} — ${mutation.error.message}`
              : null
          }
          footerNote={openAction === "restore" ? shortcut : null}
          onConfirm={confirm}
          onCancel={() => {
            mutation.reset();
            setOpenAction(null);
          }}
        />
      ) : null}
    </div>
  );
}
