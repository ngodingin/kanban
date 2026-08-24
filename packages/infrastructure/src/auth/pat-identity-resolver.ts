import type { Client } from "@libsql/client";
import type { IdentityResolver, ResolvedIdentity } from "./resolve-identity.ts";
import { hashPatToken } from "../database/personal-access-token.ts";
export class PersonalAccessTokenIdentityResolver implements IdentityResolver {
    private readonly globalClient: Client;
    constructor(globalClient: Client) {
        this.globalClient = globalClient;
    }
    async resolveIdentity(request: Request): Promise<ResolvedIdentity | null> {
        const header = request.headers.get("authorization");
        if (!header)
            return null;
        const match = /^Bearer\s+(.+)$/i.exec(header.trim());
        if (!match)
            return null;
        const token = match[1]!.trim();
        if (!token.startsWith("pat_"))
            return null;
        const tokenHash = hashPatToken(token);
        const result = await this.globalClient.execute({
            sql: `SELECT t.id, t.user_id, u.email, u.name AS display_name, t.expires_at, t.revoked_at
            FROM personal_access_tokens t JOIN users u ON u.id = t.user_id
            WHERE t.token_hash = ? LIMIT 1`,
            args: [tokenHash],
        });
        const row = result.rows[0];
        if (!row)
            return null;
        if (row.revoked_at !== null)
            return null;
        if (row.expires_at !== null && new Date(String(row.expires_at)).getTime() <= Date.now())
            return null;
        try {
            await this.globalClient.execute({
                sql: "UPDATE personal_access_tokens SET last_used_at = ? WHERE id = ?",
                args: [new Date().toISOString(), String(row.id)],
            });
        }
        catch {
        }
        return {
            type: "session",
            userId: String(row.user_id),
            email: String(row.email),
            name: String(row.display_name),
            emailVerified: true,
            image: null,
        };
    }
}
