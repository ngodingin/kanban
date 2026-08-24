import { createHash, randomBytes } from "node:crypto";
import type { Client } from "@libsql/client";
import { PipelineError } from "../pipeline/errors.ts";
export interface PersonalAccessTokenCreateInput {
    userId: string;
    name: string;
    expiresAt?: string | null;
}
export interface PersonalAccessTokenCreated {
    id: string;
    name: string;
    token: string;
    expiresAt: string | null;
    createdAt: string;
}
export interface PersonalAccessTokenSummary {
    id: string;
    name: string;
    expiresAt: string | null;
    revokedAt: string | null;
    createdAt: string;
    lastUsedAt: string | null;
}
export function hashPatToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
}
function generateToken(): string {
    return `pat_${randomBytes(24).toString("base64url")}`;
}
export async function createPersonalAccessToken(globalClient: Client, input: PersonalAccessTokenCreateInput): Promise<PersonalAccessTokenCreated> {
    if (typeof input.name !== "string" || input.name.trim().length === 0) {
        throw new PipelineError("VALIDATION_ERROR", "Field name wajib string non-kosong.", 400);
    }
    const now = new Date();
    if (input.expiresAt !== null && input.expiresAt !== undefined) {
        const parsed = new Date(input.expiresAt);
        if (Number.isNaN(parsed.getTime())) {
            throw new PipelineError("VALIDATION_ERROR", "expires_at bukan ISO date-time yang valid.", 400);
        }
        if (parsed.getTime() <= now.getTime()) {
            throw new PipelineError("VALIDATION_ERROR", "expires_at harus di masa depan.", 400);
        }
    }
    const id = `pt-${randomBytes(8).toString("hex")}`;
    const token = generateToken();
    const createdAt = now.toISOString();
    await globalClient.execute({
        sql: "INSERT INTO personal_access_tokens (id, user_id, name, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: [id, input.userId, input.name.trim(), hashPatToken(token), input.expiresAt ?? null, createdAt],
    });
    return { id, name: input.name.trim(), token, expiresAt: input.expiresAt ?? null, createdAt };
}
export async function revokePersonalAccessToken(globalClient: Client, input: {
    userId: string;
    tokenId: string;
}): Promise<PersonalAccessTokenSummary> {
    const existing = await globalClient.execute({
        sql: "SELECT id FROM personal_access_tokens WHERE id = ? AND user_id = ? LIMIT 1",
        args: [input.tokenId, input.userId],
    });
    if (!existing.rows[0]) {
        throw new PipelineError("RESOURCE_NOT_FOUND", `Personal Access Token ${input.tokenId} tidak ditemukan.`, 404);
    }
    const revokedAt = new Date().toISOString();
    await globalClient.execute({
        sql: "UPDATE personal_access_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
        args: [revokedAt, input.tokenId],
    });
    return getPersonalAccessToken(globalClient, input.userId, input.tokenId) as Promise<PersonalAccessTokenSummary>;
}
export async function getPersonalAccessToken(globalClient: Client, userId: string, tokenId: string): Promise<PersonalAccessTokenSummary | null> {
    const result = await globalClient.execute({
        sql: "SELECT id, name, expires_at, revoked_at, created_at, last_used_at FROM personal_access_tokens WHERE id = ? AND user_id = ?",
        args: [tokenId, userId],
    });
    return mapSummary(result.rows[0]);
}
export async function listPersonalAccessTokens(globalClient: Client, userId: string): Promise<PersonalAccessTokenSummary[]> {
    const result = await globalClient.execute({
        sql: "SELECT id, name, expires_at, revoked_at, created_at, last_used_at FROM personal_access_tokens WHERE user_id = ? ORDER BY created_at, id",
        args: [userId],
    });
    return result.rows.map(mapSummary).filter((r): r is PersonalAccessTokenSummary => r !== null);
}
function mapSummary(row: Record<string, unknown> | undefined): PersonalAccessTokenSummary | null {
    if (!row)
        return null;
    return {
        id: String(row.id),
        name: String(row.name),
        expiresAt: row.expires_at === null ? null : String(row.expires_at),
        revokedAt: row.revoked_at === null ? null : String(row.revoked_at),
        createdAt: String(row.created_at),
        lastUsedAt: row.last_used_at === null ? null : String(row.last_used_at),
    };
}
