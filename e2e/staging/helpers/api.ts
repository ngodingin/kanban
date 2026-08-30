import type { APIRequestContext } from "@playwright/test";
import { STAGING_ORIGIN } from "./staging.ts";

export interface SignInResult {
  status: number;
}

export async function signInMagicLink(
  request: APIRequestContext,
  email: string,
  callbackPath: string = "/",
): Promise<SignInResult> {
  const res = await request.post(`${STAGING_ORIGIN}/api/auth/sign-in/magic-link`, {
    data: { email, callbackURL: `${STAGING_ORIGIN}${callbackPath}` },
    headers: { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "" },
  });
  return { status: res.status() };
}

export interface VerifyResult {
  status: number;
  setCookie: string;
  body: unknown;
}

export async function verifyMagicLink(
  request: APIRequestContext,
  token: string,
): Promise<VerifyResult> {
  const res = await request.get(
    `${STAGING_ORIGIN}/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`,
    {
      headers: { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "" },
      maxRedirects: 0,
    },
  );
  const setCookie = res.headers()["set-cookie"] ?? "";
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status(), setCookie, body };
}

export interface SessionResult {
  status: number;
  hasSession: boolean;
  body: unknown;
}

export async function getSession(
  request: APIRequestContext,
  cookieHeader: string,
): Promise<SessionResult> {
  const res = await request.get(`${STAGING_ORIGIN}/api/auth/get-session`, {
    headers: {
      cookie: cookieHeader,
      "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "",
    },
  });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const data = body as { session?: unknown; user?: unknown } | null;
  return {
    status: res.status(),
    hasSession: !!data?.session,
    body,
  };
}

export async function signOut(
  request: APIRequestContext,
  cookieHeader: string,
): Promise<{ status: number }> {
  const res = await request.post(`${STAGING_ORIGIN}/api/auth/sign-out`, {
    headers: {
      cookie: cookieHeader,
      "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "",
    },
  });
  return { status: res.status() };
}

export function extractSessionCookie(setCookieHeader: string): string {
  const match = setCookieHeader.match(/(?:__Secure-)?kanban\.session_token=[^;]+/);
  return match ? match[0] : "";
}
