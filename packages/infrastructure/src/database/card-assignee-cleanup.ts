import type { Client } from "@libsql/client";
import { ulid } from "ulid";
import { runInWriteTransaction, type Tx } from "./transaction.ts";
export interface UnassignRevokedAssigneeInput {
    cardId: string;
    revokedUserId: string;
    actorUserId: string;
}
async function unassignCardInTx(tx: Tx, input: UnassignRevokedAssigneeInput): Promise<boolean> {
    const row = (await tx.execute("SELECT assignee_user_id, version FROM cards WHERE id = ?", [input.cardId])).rows[0];
    if (!row)
        return false;
    const currentAssignee = row.assignee_user_id === null ? null : String(row.assignee_user_id);
    if (currentAssignee !== input.revokedUserId)
        return false;
    const currentVersion = Number(row.version);
    const now = new Date().toISOString();
    const nextVersion = currentVersion + 1;
    await tx.execute("UPDATE cards SET assignee_user_id = NULL, updated_at = ?, version = ? WHERE id = ? AND assignee_user_id = ? AND version = ?", [now, nextVersion, input.cardId, input.revokedUserId, currentVersion]);
    await tx.execute("INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, 'card', ?, ?, ?, 'card.unassigned', ?, ?)", [
        ulid(),
        input.cardId,
        nextVersion,
        input.actorUserId,
        JSON.stringify({
            previousAssigneeUserId: input.revokedUserId,
            reason: "membership_revoked",
        }),
        now,
    ]);
    return true;
}
export async function unassignCardFromRevokedMember(projectClient: Client, input: UnassignRevokedAssigneeInput): Promise<boolean> {
    return runInWriteTransaction(projectClient, (tx) => unassignCardInTx(tx, input));
}
export interface CleanupRevokedAssigneeResult {
    cleaned: number;
    skipped: number;
}
export async function cleanupAssigneesForRevokedMembership(projectClient: Client, projectId: string, revokedUserId: string, actorUserId: string): Promise<CleanupRevokedAssigneeResult> {
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
            if (changed)
                cleaned++;
            else
                skipped++;
        }
        return { cleaned, skipped };
    });
}
