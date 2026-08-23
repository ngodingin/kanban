import type { Auth } from "./auth.ts";

export interface SessionIdentity {
  type: "session";
  userId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image: string | null;
}

/** Identitas non-session dari credential Project-scoped (AC-021). */
export interface ApiKeyIdentity {
  type: "api_key";
  userId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image: null;
  /** Project tempat key terdaftar — request ke Project lain WAJIB ditolak pipeline. */
  apiKeyProjectId: string;
}

export type ResolvedIdentity = SessionIdentity | ApiKeyIdentity;

export interface IdentityResolver {
  resolveIdentity(request: Request): Promise<ResolvedIdentity | null>;
}

export class BetterAuthIdentityResolver implements IdentityResolver {
  private readonly auth: Auth;

  constructor(auth: Auth) {
    this.auth = auth;
  }

  async resolveIdentity(request: Request): Promise<ResolvedIdentity | null> {
    const session = await this.auth.api.getSession({
      headers: request.headers,
    });
    if (!session?.user) return null;
    return {
      type: "session",
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      emailVerified: session.user.emailVerified ?? false,
      image: session.user.image ?? null,
    };
  }
}