import type { IdentityResolver, ResolvedIdentity } from "./resolve-identity.ts";
import type { Client } from "@libsql/client";
import { ApiKeyIdentityResolver } from "./api-key-identity-resolver.ts";
import { PersonalAccessTokenIdentityResolver } from "./pat-identity-resolver.ts";

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

/**
 * Komposisi resolver (Prinsip #9 TASK-4.7): header Authorization diparse
 * dulu — prefix `ak_` → API Key, `pat_` → PAT (TASK-4.8) — tanpa header
 * fallback ke session cookie (Better Auth). Interface IdentityResolver
 * tetap; pemanggil tidak berubah.
 */
export class CompositeIdentityResolver implements IdentityResolver {
  private readonly apiKeyResolver: ApiKeyIdentityResolver;
  private readonly patResolver: PersonalAccessTokenIdentityResolver;
  private readonly fallback: IdentityResolver;

  constructor(input: { globalClient: Client; fallback: IdentityResolver }) {
    this.apiKeyResolver = new ApiKeyIdentityResolver(input.globalClient);
    this.patResolver = new PersonalAccessTokenIdentityResolver(input.globalClient);
    this.fallback = input.fallback;
  }

  async resolveIdentity(request: Request): Promise<ResolvedIdentity | null> {
    const token = bearerToken(request);
    if (token !== null && token.startsWith("ak_")) {
      return this.apiKeyResolver.resolveIdentity(request);
    }
    if (token !== null && token.startsWith("pat_")) {
      return this.patResolver.resolveIdentity(request);
    }
    return this.fallback.resolveIdentity(request);
  }
}
