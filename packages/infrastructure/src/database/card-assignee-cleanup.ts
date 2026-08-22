import type { Client } from "@libsql/client";
import { ulid } from "ulid";
import { runInWriteTransaction } from "./transaction.ts";

/**
 * FR-026 / BR-054 / 03-ENG A.5 — reactive cleanup assignee saat Membership
 * di-revoke (TASK-2.12). Tidak ada transaksi tunggal lintas-DB: revoke
 * Membership commit duluan di Global DB, lalu cleanup berjalan terpisah
 * di Project DB, ATOMIK PER CARD (mutation + Activity masing-masing),
 * bukan satu Activity borongan.
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
export async function unassignCardFromRevokedMember(
  projectClient: Client,
  input: UnassignRevokedAssigneeInput,
): Promise<boolean> {
  return runInWriteTransaction(projectClient, async (tx) => {
    const row = (
      await tx.execute("SELECT assignee_user_id, version FROM cards WHERE id = ?", [input.cardId])
    ).rows[0];
    if (!row) return false;
    const currentAssignee = row.assignee_user_id === null ? null : String(row.assignee_user_id);
    if (currentAssignee !== input.revokedUserId) return false;
    const currentVersion = Number(row.version);

    const now = new Date().toISOString();
    const nextVersion = currentVersion + 1;
    await tx.execute(
      "UPDATE cards SET assignee_user_id = NULL, updated_at = ?, version = ? WHERE id = ? AND assignee_user_id = ? AND version = ?",
      [now, nextVersion, input.cardId, input.revokedUserId, currentVersion],
    );
    await tx.execute(
      "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, 'card', ?, ?, ?, 'card.unassigned', ?, ?)",
      [
        ulid(),
        input.cardId,
        nextVersion,
        input.actorUserId,
        JSON.stringify({
          previous_assignee_user_id: input.revokedUserId,
          reason: "membership_revoked",
        }),
        now,
      ],
    );
    return true;
  });
}

export interface CleanupRevokedAssigneeResult {
  cleaned: number;
  skipped: number;
}

/**
 * Loop best-effort atas seluruh Card milik Project ini yang masih
 * meng-assign User yang di-revoke. Kegagalan satu Card TIDAK menggulung
 * yang lain — masing-masing sudah atomik sendiri.
 */
export async function cleanupAssigneesForRevokedMembership(
  projectClient: Client,
  projectId: string,
  revokedUserId: string,
  actorUserId: string,
): Promise<CleanupRevokedAssigneeResult> {
  void projectId;
  const ids = await projectClient.execute({
    sql: "SELECT id FROM cards WHERE assignee_user_id = ?",
    args: [revokedUserId],
  });
  let cleaned = 0;
  let skipped = 0;
  for (const row of ids.rows) {
    const cardId = String(row.id);
    const changed = await unassignCardFromRevokedMember(projectClient, {
      cardId,
      revokedUserId,
      actorUserId,
    });
    if (changed) cleaned++;
    else skipped++;
  }
  return { cleaned, skipped };
}
