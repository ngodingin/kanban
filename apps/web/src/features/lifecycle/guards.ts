import { ApiError } from "@/lib/api/client";
import type { LifecycleAction } from "@/features/lifecycle/hooks";

// 7.13.2 (INV-LIFE-002/004) — aksi lifecycle yang BOLEH ditawarkan UI,
// murni dari local state entity: ACTIVE → archive+delete; ARCHIVED → restore;
// DELETED → tidak ada apa pun (terminal, tanpa tombol restore).
export function availableLifecycleActions(entity: {
  archivedAt?: string | null;
  deletedAt?: string | null;
}): LifecycleAction[] {
  if (entity.deletedAt) return [];
  if (entity.archivedAt) return ["restore"];
  return ["archive", "delete"];
}

/** Klasifikasi penolakan restore karena ancestor belum ACTIVE (A.5). */
export function describeRestoreBlock(error: unknown): {
  ancestorKind: string | null;
  hint: string;
} | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code !== "INVALID_STATE") return null;
  const text = error.message;
  // Pesan pola server (A.5): "<Entity> tidak dapat dipulihkan karena <Parent>
  // induknya masih ARCHIVED/DELETED." — ancestor = kata setelah "karena".
  const kindMatch =
    /\bkarena\s+(project|milestone|board|list|card)\s+induknya/i.exec(text);
  const ancestorKind = kindMatch ? kindMatch[1]!.toLowerCase() : "induk";
  return {
    ancestorKind,
    hint: `Pulihkan ${ancestorKind} terlebih dahulu.`,
  };
}
