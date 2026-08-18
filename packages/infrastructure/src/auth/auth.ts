import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { ulid } from "ulid";
import { users, authSessions, authAccounts, authVerifications } from "../database/global-schema.ts";

export interface AuthConfigInput {
  globalClient: Client;
  baseUrl: string;
  secret: string;
  trustedOrigins?: string[];
}

export function createAuth(config: AuthConfigInput) {
  const db = drizzle(config.globalClient);
  return betterAuth({
    baseURL: config.baseUrl,
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        users,
        auth_sessions: authSessions,
        auth_accounts: authAccounts,
        auth_verifications: authVerifications,
      },
    }),
    user: {
      modelName: "users",
      fields: {
        emailVerified: "email_verified",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    session: {
      modelName: "auth_sessions",
      fields: {
        userId: "user_id",
        expiresAt: "expires_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    account: {
      modelName: "auth_accounts",
      fields: {
        userId: "user_id",
        accountId: "account_id",
        providerId: "provider_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    verification: {
      modelName: "auth_verifications",
      fields: {
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    emailAndPassword: {
      enabled: false,
    },
advanced: {
      cookiePrefix: "kanban",
      database: {
        generateId: () => ulid().toLowerCase(),
      },
    },
  });
}