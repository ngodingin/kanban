import type { Client } from "@libsql/client";
import type { IdentityResolver, ResolvedIdentity } from "./resolve-identity.ts";
import { hashApiKeySecret } from "../database/api-key.ts";

interface ApiKeyRow {
  id: string;
  user_id: string;
  email: string;
  project_id: string;
  expires_at: string | null;
  revoked_at: string | null;
}

function extractBearerToken(request: Request, prefix: string): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1]!.trim();
  return token.startsWith(prefix) ? token : null;
}

/**
 * Credential API Key — Project-scoped (BR-055/057). BUKAN model otorisasi
 * baru: permission tetap di-resolve dari User→Membership→Permission.
 */
export class ApiKeyIdentityResolver implements IdentityResolver {
  private readonly globalClient: Client;

  constructor(globalClient: Client) {
    this.globalClient = globalClient;
  }

  async resolveIdentity(request: Request): Promise<ResolvedIdentity | null> {
    const token = extractBearerToken(request, "ak_");
    if (!token) return null;
    // Lookup dilakukan atas HASH secret, bukan secret mentah — timing dari
    // pencarian indexed-equality di DB tidak membocorkan byte hash asli
    // (beda dari perbandingan string naif byte-per-byte di application code),
    // jadi ini sudah cukup aman tanpa perbandingan constant-time tambahan.
    const keyHash = hashApiKeySecret(token);
    const result = await this.globalClient.execute({
      sql: `SELECT k.id, k.created_by_user_id AS user_id, u.email, k.project_id, k.expires_at, k.revoked_at
            FROM api_keys k JOIN users u ON u.id = k.created_by_user_id
            WHERE k.key_hash = ? LIMIT 1`,
      args: [keyHash],
    });
    const row = result.rows[0] as unknown as ApiKeyRow | undefined;
    if (!row) return null;
    // AC-024 revoked; AC-023 expired → identity gagal resolve (null, bukan throw).
    if (row.revoked_at !== null) return null;
    if (row.expires_at !== null && new Date(row.expires_at).getTime() <= Date.now()) return null;

    // Best-effort — kegagalan update TIDAK boleh menggagalkan request.
    try {
      await this.globalClient.execute({
        sql: "UPDATE api_keys SET last_used_at = ? WHERE id = ?",
        args: [new Date().toISOString(), row.id],
      });
    } catch {
      // ignore
    }
    return {
      type: "api_key",
      userId: row.user_id,
      email: row.email,
      name: row.email,
      emailVerified: true,
      image: null,
      apiKeyProjectId: row.project_id,
    };
  }
}
