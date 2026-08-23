/**
 * Retention & prune-eligibility utility (Phase 5 TASK-5.1).
 *
 * Sumber rule:
 * - BR-016A — entity DELETED eligible di-prune fisik hanya setelah 30 hari
 *   sejak `deleted_at`; boundary inclusive (`deleted_at <= now - 30 hari`).
 * - BR-016 — retention per-entity, bukan menunggu Project ikut di-delete.
 * - Prinsip #7 Phase 5 — 30 hari dihitung dari `deleted_at`, BUKAN sejak job
 *   pertama kali menemukannya (job terlambat jalan → tetap eligible).
 *
 * Fungsi 100% murni: `now` WAJIB parameter (tanpa default `new Date()`) —
 * deterministik, tanpa I/O, pola sama `effective-state.ts`.
 */

/** Lama retention DELETED sebelum boleh di-prune fisik (hari) — satu titik perubahan. */
export const RETENTION_DAYS = 30;

const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function isPruneEligible(deletedAt: string | null, now: Date): boolean {
  if (deletedAt === null) return false; // ACTIVE/ARCHIVED tidak pernah eligible
  const deletedMs = Date.parse(deletedAt);
  if (Number.isNaN(deletedMs)) return false;
  return now.getTime() - deletedMs >= RETENTION_MS;
}
