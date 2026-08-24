import type { ReactNode } from "react";
import type { LifecycleAction, LifecycleEntityKind } from "@/features/lifecycle/hooks";

// Modal konfirmasi archive/delete (04-DELIVERY A.4): menjelaskan dampak
// efektif subtree — TANPA child handling. Delete = terminal + peringatan kuat.
const LABEL: Record<LifecycleEntityKind, string> = {
  project: "Project",
  milestone: "Milestone",
  board: "Board",
  list: "List",
  card: "Card",
};

export function subtreeImpactText(
  kind: LifecycleEntityKind,
  action: Extract<LifecycleAction, "archive" | "delete">,
): string {
  if (action === "archive") {
    return `${LABEL[kind]} akan diarsipkan. Seluruh item di dalamnya menjadi tidak operasional sampai ${LABEL[kind]} dipulihkan.`;
  }
  return `${LABEL[kind]} akan DIHAPUS secara permanen (terminal, tidak dapat dipulihkan). Item di dalamnya tidak ikut diubah, tetapi tidak operasional sampai ikut di-prune internal.`;
}

export function ConfirmLifecycleDialog({
  kind,
  entityTitle,
  action,
  pending,
  error,
  footerNote,
  onConfirm,
  onCancel,
}: {
  kind: LifecycleEntityKind;
  entityTitle: string;
  action: LifecycleAction;
  pending?: boolean;
  error?: string | null;
  footerNote?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isDelete = action === "delete";
  return (
    <div role="dialog" aria-modal="true" aria-label={`Konfirmasi ${action} ${LABEL[kind]}`} className="rounded-md border border-border bg-card p-4 shadow-md">
      <h2 className="text-sm font-semibold">
        {isDelete ? "Hapus" : action === "archive" ? "Arsipkan" : "Pulihkan"} {LABEL[kind]} “{entityTitle}”?
      </h2>
      <p className={`mt-2 text-sm ${isDelete ? "text-destructive" : "text-muted-foreground"}`}>
        {action === "restore"
          ? `Pulihkan ${LABEL[kind]} ini dari arsip? Ancestor harus ACTIVE agar restore berhasil.`
          : subtreeImpactText(kind, action)}
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {footerNote}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-input px-3 py-1.5 text-sm">
          Batal
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className={`rounded-md px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50 ${
            isDelete ? "bg-destructive" : "bg-primary"
          }`}
        >
          {pending ? "Memproses..." : isDelete ? "Ya, hapus permanen" : "Konfirmasi"}
        </button>
      </div>
    </div>
  );
}
