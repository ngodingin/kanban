import { createClient } from "@libsql/client";
import { applyGlobalMigrations } from "../src/database/migrate.ts";
import { createAuth } from "../src/auth/auth.ts";

const url = process.env.GLOBAL_DB_URL;
const token = process.env.GLOBAL_DB_TOKEN;
if (!url || !token) {
  console.log("SKIP: GLOBAL_DB_URL/GLOBAL_DB_TOKEN tidak ada");
  process.exit(0);
}

const client = createClient({ url, authToken: token });
let failed = 0;
const fail = (name: string, msg: string): void => {
  failed++;
  console.log(`FAIL ${name}: ${msg}`);
};
const pass = (name: string, msg: string): void => {
  console.log(`PASS: ${name} — ${msg}`);
};
const assert = (cond: boolean, name: string, msg: string): void =>
  cond ? pass(name, msg) : fail(name, msg);

async function signCookieValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return `${value}.${Buffer.from(new Uint8Array(sig)).toString("base64")}`;
}

try {
  await applyGlobalMigrations(client);
  const secret = "x".repeat(32);
  const auth = createAuth({
    globalClient: client,
    baseUrl: "http://localhost:3000",
    secret,
  });
  const ctx = await auth.$context;

  const now = new Date();
  const email = `session-smoke-${Date.now()}@smoke.local`;
  const created = await ctx.internalAdapter.createUser({
    name: "Session Smoke",
    email,
    emailVerified: false,
    image: null,
    createdAt: now,
    updatedAt: now,
  });
  const userId = created.id as string;

  const session = await ctx.internalAdapter.createSession(userId, false);
  const signedCookie = await signCookieValue(session.token, secret);
  const cookieValue = encodeURIComponent(signedCookie);

  const rows = await client.execute({
    sql: "SELECT id, user_id, token, expires_at FROM auth_sessions WHERE id = ?",
    args: [session.id],
  });
  const sessionRow = rows.rows[0] as unknown as { user_id: string; token: string };
  assert(rows.rows.length === 1, "session-db-backed", "session tersimpan di auth_sessions (database-backed, bukan cookie cache)");
  assert(sessionRow.user_id === userId, "session-db-user", "user_id pada session sesuai user");
  assert(sessionRow.token === session.token, "session-opaque", "token session opaque tersimpan di DB");

  const cookieName = ctx.authCookies.sessionToken.name;
  assert(cookieName === "kanban.session_token", "cookie-name", `nama cookie ${cookieName} (prefix kanban)`);

  const attrs = ctx.authCookies.sessionToken.attributes;
  assert(attrs.httpOnly === true, "cookie-httponly", "cookie session HttpOnly");
  assert(attrs.sameSite === "lax", "cookie-samesite", "cookie session SameSite=Lax");
  assert(attrs.path === "/", "cookie-path", "cookie session Path=/");
  assert(attrs.secure === false, "cookie-secure-dev", "dev (http localhost) tidak memaksa Secure");

  const authProd = createAuth({
    globalClient: client,
    baseUrl: "https://kanban.ngodingin.xyz",
    secret: "x".repeat(32),
  });
  const ctxProd = await authProd.$context;
  assert(ctxProd.authCookies.sessionToken.attributes.secure === true, "cookie-secure-prod", "origin https => cookie Secure");

  const res = await auth.api.getSession({
    headers: new Headers({ cookie: `${cookieName}=${cookieValue}` }),
  });
  assert(res?.user?.id === userId, "session-valid", "getSession mengembalikan user untuk session valid (cookie signed)");

  const tampered = await signCookieValue("tampered-token", secret);
  const tamperedRes = await auth.api.getSession({
    headers: new Headers({ cookie: `${cookieName}=${encodeURIComponent(tampered)}` }),
  });
  assert(tamperedRes === null, "session-tampered", "getSession null untuk cookie dengan signature tidak valid");

  const bad = await auth.api.getSession({
    headers: new Headers({ cookie: `${cookieName}=invalid-token` }),
  });
  assert(bad === null, "session-invalid-token", "getSession null untuk token tidak dikenal");

  const expired = await ctx.internalAdapter.createSession(userId, false, {
    expiresAt: new Date(Date.now() - 60_000),
  }, true);
  const expRes = await auth.api.getSession({
    headers: new Headers({ cookie: `${cookieName}=${encodeURIComponent(await signCookieValue(expired.token, secret))}` }),
  });
  assert(expRes === null, "session-expired", "getSession null untuk session kedaluwarsa");

  const sessionOptions = auth.options.session as { useCookieCache?: boolean } | undefined;
  assert(!sessionOptions?.useCookieCache, "session-cookie-cache-off", "cookie cache/stateless mode nonaktif (useCookieCache falsy)");

  await ctx.internalAdapter.deleteSession(session.token);
  const afterRevoke = await auth.api.getSession({
    headers: new Headers({ cookie: `${cookieName}=${cookieValue}` }),
  });
  assert(afterRevoke === null, "session-revoked", "getSession null setelah sign-out/revoke");
  const revRows = await client.execute({
    sql: "SELECT id FROM auth_sessions WHERE id = ?",
    args: [session.id],
  });
  assert(revRows.rows.length === 0, "session-revoke-db", "row session terhapus dari auth_sessions setelah revoke");

  await client.execute("DELETE FROM auth_sessions WHERE user_id = ?", [userId]);
  await client.execute("DELETE FROM users WHERE id = ?", [userId]);
  console.log("INFO: data uji dihapus (cleanup)");
} catch (e) {
  fail("exception", String(e));
} finally {
  await client.close();
}

if (failed > 0) {
  console.log(`smoke session GAGAL (${failed} kegagalan)`);
  process.exit(1);
}
console.log("smoke session selesai");