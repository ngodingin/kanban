import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins/magic-link";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { ulid } from "ulid";
import { Resend } from "resend";
import { users, authSessions, authAccounts, authVerifications } from "../database/global-schema.ts";
import { loadAppConfig } from "../config/env.ts";
import { initialSessionLifetime } from "./session-lifetime.ts";

export interface SendMagicLinkData {
  email: string;
  url: string;
  token: string;
}

export interface AuthConfigInput {
  globalClient: Client;
  baseUrl: string;
  secret: string;
  trustedOrigins?: string[];
  sendMagicLink?: (data: SendMagicLinkData) => Promise<void>;
}

async function defaultSendMagicLink(data: SendMagicLinkData): Promise<void> {
  const config = loadAppConfig(process.env);
  const resend = new Resend(config.AUTH_RESEND_KEY);
  const res = await resend.emails.send({
    from: config.MAIL_FROM,
    to: data.email,
    subject: "Masuk ke NGodingin Kanban",
    html: `<p>Klik tautan berikut untuk masuk ke NGodingin Kanban:</p><p><a href="${data.url}">${data.url}</a></p>`,
  });
  if (res.error) throw new Error(`Resend gagal: ${res.error.message}`);
}

/**
 * Bungkus SETIAP implementasi sendMagicLink (default maupun custom dari
 * caller) supaya TIDAK PERNAH reject ke plugin magic-link Better Auth.
 *
 * TASK-0.14 (CL-64/CL-65): kegagalan pengiriman (mis. AUTH_RESEND_KEY
 * invalid di provider) yang reject sampai ke plugin menghasilkan
 * unhandled rejection SETELAH verification token sudah dibuat — Better
 * Auth 1.6.x tidak menangkapnya dengan baik, request berakhir crash 500
 * body kosong (bukan JSON envelope try/catch `/auth/*` kita, yang cuma
 * membungkus `auth.handler()` itu sendiri, bukan callback async lepas
 * yang dipanggil plugin di dalamnya). Kegagalan transport email di titik
 * ini SELALU infra-level (validasi input sudah lewat sebelum callback
 * ini dipanggil) — di-log untuk observability, TIDAK di-propagate,
 * konsisten prinsip "response request-link MUST tidak membocorkan"
 * (03-ENG A.14): client tetap dapat respons sukses standar Better Auth
 * dari sisi API (token benar dibuat), walau email fisiknya gagal terkirim.
 */
/**
 * Vercel CDN men-strip header Set-Cookie dari response 302 redirect. Better Auth
 * magic link verify mengembalikan 302 redirect + Set-Cookie, tetapi Vercel
 * menghapus Set-Cookie sebelum sampai ke browser (QA-CL-69/70/71).
 *
 * Solusi: rewrite email URL agar mengarah ke route SPA `/login/verify` (bukan
 * endpoint API). URL email menjadi:
 *   https://host/login/verify?token=<raw>&callbackURL=<original>&returnTo=<path>
 *
 * Flow:
 *   1. User klik link email → browser navigasi ke /login/verify (SPA)
 *   2. SPA load, JavaScript ekstrak token + returnTo dari URL
 *   3. SPA panggil GET /api/auth/magic-link/verify?token=<raw> (tanpa callbackURL)
 *      → response 200 JSON + Set-Cookie → cookie TERSET (200, bukan 302)
 *   4. SPA redirect client-side ke returnTo (sudah punya session valid)
 *
 * Token hanya dikonsumsi SEKALI (saat SPA panggil API), tidak ada 302 redirect
 * yang mengonsumsi token tapi kehilangan cookie.
 */
function rewriteEmailUrl(data: SendMagicLinkData): void {
  try {
    const raw = data.url.startsWith("http") ? data.url : `http://placeholder${data.url}`;
    const url = new URL(raw);
    const callbackRaw = url.searchParams.get("callbackURL");

    let returnTo = "/";
    if (callbackRaw) {
      const cbUrl = callbackRaw.startsWith("http")
        ? new URL(callbackRaw)
        : new URL(callbackRaw, url.origin);
      returnTo = cbUrl.pathname + cbUrl.search + cbUrl.hash;
    }

    const origin = data.url.startsWith("http") ? url.origin : "";
    const spaUrl = new URL(`${origin}/login/verify`);
    spaUrl.searchParams.set("token", data.token);
    spaUrl.searchParams.set("returnTo", returnTo);
    data.url = spaUrl.toString();
  } catch {
    // Jika rewrite gagal, biarkan URL asli.
  }
}

function guardedSendMagicLink(
  impl: (data: SendMagicLinkData) => Promise<void>,
): (data: SendMagicLinkData) => Promise<void> {
  return async (data) => {
    rewriteEmailUrl(data);
    try {
      await impl(data);
    } catch (error) {
      console.error(
        `[auth] sendMagicLink gagal (email tidak terkirim, request TETAP dianggap sukses ke client): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };
}

export function createAuth(config: AuthConfigInput) {
  const db = drizzle(config.globalClient);
  return betterAuth({
    // Auth routes are mounted at /api/auth/* via Hono basePath("/api") + route
    // /auth/*. Better Auth needs the full base path (including /api/auth) to:
    // 1. Construct correct magic link verify URLs in emails
    // 2. Strip the path prefix when matching internal routes
    baseURL: `${config.baseUrl}/api/auth`,
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
      // Better Auth tidak boleh melakukan sliding refresh sendiri: lifetime
      // diatur oleh session-lifetime.ts setelah aksi pengguna yang berhasil.
      expiresIn: 60 * 60,
      disableSessionRefresh: true,
      fields: {
        userId: "user_id",
        expiresAt: "expires_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
      additionalFields: {
        lastActivityAt: {
          type: "date",
          required: true,
          input: false,
          fieldName: "last_activity_at",
        },
        absoluteExpiresAt: {
          type: "date",
          required: true,
          input: false,
          fieldName: "absolute_expires_at",
        },
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const issuedAt = session.createdAt instanceof Date ? session.createdAt : new Date();
            const lifetime = initialSessionLifetime(issuedAt);
            return {
              data: {
                ...session,
                expiresAt: lifetime.idleExpiresAt,
                lastActivityAt: issuedAt,
                absoluteExpiresAt: lifetime.absoluteExpiresAt,
              },
            };
          },
        },
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
    plugins: [
      magicLink({
        storeToken: "hashed",
        expiresIn: 300,
        sendMagicLink: guardedSendMagicLink(config.sendMagicLink ?? defaultSendMagicLink),
      }),
    ],
    advanced: {
      cookiePrefix: "kanban",
      database: {
        generateId: () => ulid().toLowerCase(),
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
