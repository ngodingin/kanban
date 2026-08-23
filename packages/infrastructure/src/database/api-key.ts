import { createHash, randomBytes } from "node:crypto";
import type { Client } from "@libsql/client";
import { PipelineError } from "../pipeline/errors.ts";

export interface ApiKeyCreateInput {
  projectId: string;
  createdByUserId: string;
  name: string;
  expiresAt?: string | null;
}

export interface ApiKeyCreated {
  id: string;
  name: string;
  /** RAW secret — HANYA sekali ini; sistem menyimpan hash-nya saja (BR-057). */
  secret: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface ApiKeySummary {
  id: string;
  name: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export function hashApiKeySecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** CSPRNG — BUKAN Math.random (DoD TASK-4.7). */
function generateSecret(): string {
  return `ak_${randomBytes(24).toString("base64url")}`;
}

function validateName(name: string): void {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new PipelineError("VALIDATION_ERROR", "Field name wajib string non-kosong.", 400);
  }
}

function validateExpiry(expiresAt: string | null | undefined, now: Date): void {
  if (expiresAt === null || expiresAt === undefined) return;
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new PipelineError("VALIDATION_ERROR", "expires_at bukan ISO date-time yang valid.", 400);
  }
  if (parsed.getTime() <= now.getTime()) {
    throw new PipelineError("VALIDATION_ERROR", "expires_at harus di masa depan.", 400);
  }
}

export async function createApiKey(globalClient: Client, input: ApiKeyCreateInput): Promise<ApiKeyCreated> {
  validateName(input.name);
  const now = new Date();
  validateExpiry(input.expiresAt ?? null, now);
  const id = `ak-${randomBytes(8).toString("hex")}`;
  const secret = generateSecret();
  const createdAt = now.toISOString();
  await globalClient.execute({
    sql: "INSERT INTO api_keys (id, project_id, created_by_user_id, name, key_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [
      id,
      input.projectId,
      input.createdByUserId,
      input.name.trim(),
      hashApiKeySecret(secret),
      input.expiresAt ?? null,
      createdAt,
    ],
  });
  return { id, name: input.name.trim(), secret, expiresAt: input.expiresAt ?? null, createdAt };
}

export async function revokeApiKey(
  globalClient: Client,
  input: { projectId: string; keyId: string },
): Promise<ApiKeySummary> {
  const existing = await globalClient.execute({
    sql: "SELECT id FROM api_keys WHERE id = ? AND project_id = ? LIMIT 1",
    args: [input.keyId, input.projectId],
  });
  if (!existing.rows[0]) {
    throw new PipelineError("RESOURCE_NOT_FOUND", `API Key ${input.keyId} tidak ditemukan di Project ini.`, 404);
  }
  const revokedAt = new Date().toISOString();
  await globalClient.execute({
    sql: "UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
    args: [revokedAt, input.keyId],
  });
  return getApiKey(globalClient, input.projectId, input.keyId) as Promise<ApiKeySummary>;
}

export async function getApiKey(
  globalClient: Client,
  projectId: string,
  keyId: string,
): Promise<ApiKeySummary | null> {
  const result = await globalClient.execute({
    sql: "SELECT id, name, expires_at, revoked_at, created_at, last_used_at FROM api_keys WHERE id = ? AND project_id = ?",
    args: [keyId, projectId],
  });
  return mapSummary(result.rows[0]);
}

export async function listApiKeys(globalClient: Client, projectId: string): Promise<ApiKeySummary[]> {
  // C.2 03-ENG / BR-057 — key_hash TIDAK PERNAH keluar dari storage.
  const result = await globalClient.execute({
    sql: "SELECT id, name, expires_at, revoked_at, created_at, last_used_at FROM api_keys WHERE project_id = ? ORDER BY created_at, id",
    args: [projectId],
  });
  return result.rows.map(mapSummary).filter((r): r is ApiKeySummary => r !== null);
}

function mapSummary(row: Record<string, unknown> | undefined): ApiKeySummary | null {
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name),
    expiresAt: row.expires_at === null ? null : String(row.expires_at),
    revokedAt: row.revoked_at === null ? null : String(row.revoked_at),
    createdAt: String(row.created_at),
    lastUsedAt: row.last_used_at === null ? null : String(row.last_used_at),
  };
}
