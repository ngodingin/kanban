import type { Client } from "@libsql/client";
import { ulid } from "ulid";
import { runInWriteTransaction, type Tx } from "./transaction.ts";

/**
 * BR-054C langkah (3) / FR-026 / 03-ENG A.5 — cleanup assignee saat Membership
 * di-revoke. Protokol lintas-DB retryable dipimpin Global DB
 * (`revocation_pending_at`, lihat project-admin.ts): cleanup SELURUH Card
 * + satu Activity `card.unassigned` per Card dalam SATU transaksi Project DB,
 * idempotent terhadap retry (tanpa Activity ganda).
 */

export interface UnassignRevokedAssigneeInput {
  cardId: string;
  revokedUserId: string;
  actorUserId: string;
}

/**
 * Bersihkan SATU Card secara atomik. Guard `AND assignee_user_id = ?` +
 `AND version = ?` menjamin tidak ada Activity tanpa mutation yang sesuai:
 jika row sudah berubah (assignee diganti aktor lain), helper skip tanpa
 efek samping dan mengembalikan false.
 */
/** Inti mutasi satu Card — dipakai API tunggal DAN batch BR-054C (SATU tx untuk seluruh Project). */
async function unassignCardInTx(tx: Tx, input: UnassignRevokedAssigneeInput): Promise<boolean> {
  const row = (
    await tx.execute("SELECT assignee_user_id, version FROM cards WHERE id = ?", [input.cardId])
  ).rows[0];
  if (!row) return false;
  const currentAssignee = row.assignee_user_id === null ? null : String(row.assignee_user_id);
  if (currentAssignee !== input.revokedUserId) return false;
  const currentVersion = Number(row.version);

  const now = new Date().toISOString();
  const nextVersion = currentVersion + 1;
  const updated = await tx.execute(
    "UPDATE cards SET assignee_user_id = NULL, updated_at = ?, version = ? WHERE id = ? AND assignee_user_id = ? AND version = ?",
    [now, nextVersion, input.cardId, input.revokedUserId, currentVersion],
  );
  // TASK-6.1.1 — docstring di atas SUDAH mengklaim guard ini "menjamin tidak
  // ada Activity tanpa mutation yang sesuai... skip tanpa efek samping" —
  // TAPI implementasi sebelumnya TIDAK PERNAH memverifikasi rowsAffected,
  // jadi klaim itu tidak benar-benar ditegakkan (Activity tetap ditulis
  // walau UPDATE ternyata no-op). Diperbaiki di sini agar docstring dan
  // kode konsisten.
  if (Number(updated.rowsAffected ?? 0) === 0) return false;
  await tx.execute(
    "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, 'card', ?, ?, ?, 'card.unassigned', ?, ?)",
    [
      ulid(),
      input.cardId,
      nextVersion,
      input.actorUserId,
      JSON.stringify({
        previousAssigneeUserId: input.revokedUserId,
        reason: "membership_revoked",
      }),
      now,
    ],
  );
  return true;
}

export async function unassignCardFromRevokedMember(
  projectClient: Client,
  input: UnassignRevokedAssigneeInput,
): Promise<boolean> {
  return runInWriteTransaction(projectClient, (tx) => unassignCardInTx(tx, input));
}

export interface CleanupRevokedAssigneeResult {
  cleaned: number;
  skipped: number;
}

/**
 * BR-054C langkah (3): SELURUH Card terkait di-unassign + satu Activity
 * `card.unassigned` per Card dalam SATU transaksi Project DB. Idempotent:
 * retry menemukan tidak ada Card ber-assign lagi → tanpa Activity ganda.
 * Kegagalan di tengah = rollback penuh (tidak ada partial cleanup).
 */
export async function cleanupAssigneesForRevokedMembership(
  projectClient: Client,
  projectId: string,
  revokedUserId: string,
  actorUserId: string,
): Promise<CleanupRevokedAssigneeResult> {
  void projectId;
  return runInWriteTransaction(projectClient, async (tx) => {
    const ids = await tx.execute("SELECT id FROM cards WHERE assignee_user_id = ?", [revokedUserId]);
    let cleaned = 0;
    let skipped = 0;
    for (const row of ids.rows) {
      const changed = await unassignCardInTx(tx, {
        cardId: String(row.id),
        revokedUserId,
        actorUserId,
      });
      if (changed) cleaned++;
      else skipped++;
    }
    return { cleaned, skipped };
  });
}
