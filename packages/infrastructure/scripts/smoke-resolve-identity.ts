import { createClient } from "@libsql/client";
import { applyGlobalMigrations } from "../src/database/migrate.ts";
import { createAuth } from "../src/auth/auth.ts";
import { BetterAuthIdentityResolver } from "../src/auth/resolve-identity.ts";

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

const cleanupEmail = `resolve-smoke-${Date.now()}@smoke.local`;

try {
  await applyGlobalMigrations(client);
  const secret = "x".repeat(32);
  const auth = createAuth({
    globalClient: client,
    baseUrl: "http://localhost:3000",
    secret,
  });
  const ctx = await auth.$context;
  const resolver = new BetterAuthIdentityResolver(auth, client);

  const now = new Date();
  const user = await ctx.internalAdapter.createUser({
    name: "Resolve Smoke",
    email: cleanupEmail,
    emailVerified: true,
    image: null,
    createdAt: now,
    updatedAt: now,
  });
  const session = await ctx.internalAdapter.createSession(user.id, false);
  const signed = await signCookieValue(session.token, secret);
  const cookie = `kanban.session_token=${encodeURIComponent(signed)}`;

  const reqValid = new Request("http://localhost:3000/api/v1/anything", {
    headers: { cookie },
  });
  const identity = await resolver.resolveIdentity(reqValid);
  assert(identity !== null, "resolve-valid", "request dengan session valid -> identitas ter-resolve");
  assert(identity?.type === "session", "resolve-kind", "jenis identitas = session");
  assert(identity?.userId === user.id, "resolve-user-id", "userId cocok dengan user session");
  assert(identity?.email === cleanupEmail && identity.emailVerified === true, "resolve-user-data", "email + emailVerified ikut ter-resolve");

  const identityNoCookie = await resolver.resolveIdentity(new Request("http://localhost:3000/api/v1/anything"));
  assert(identityNoCookie === null, "resolve-anonymous", "tanpa cookie -> null");

  const identityBadCookie = await resolver.resolveIdentity(
    new Request("http://localhost:3000/api/v1/anything", {
      headers: { cookie: "kanban.session_token=invalid" },
    }),
  );
  assert(identityBadCookie === null, "resolve-invalid-cookie", "cookie invalid -> null");

  const expired = await ctx.internalAdapter.createSession(user.id, false, {
    expiresAt: new Date(Date.now() - 60_000),
  }, true);
  const expiredCookie = `kanban.session_token=${encodeURIComponent(await signCookieValue(expired.token, secret))}`;
  const identityExpired = await resolver.resolveIdentity(
    new Request("http://localhost:3000/api/v1/anything", {
      headers: { cookie: expiredCookie },
    }),
  );
  assert(identityExpired === null, "resolve-expired", "session expired -> null");

  const direct = await auth.api.getSession({ headers: new Headers({ cookie }) });
  assert(identity?.userId === direct?.user.id, "resolve-single-source", "hasil resolver identik dengan auth.api.getSession (satu titik resolusi)");
} catch (e) {
  fail("exception", String(e));
} finally {
  const uRows = await client.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [cleanupEmail] });
  for (const u of uRows.rows as unknown as Array<{ id: string }>) {
    await client.execute({ sql: "DELETE FROM auth_sessions WHERE user_id = ?", args: [u.id] });
    await client.execute({ sql: "DELETE FROM users WHERE id = ?", args: [u.id] });
  }
  await client.close();
}

if (failed > 0) {
  console.log(`smoke resolve-identity GAGAL (${failed} kegagalan)`);
  process.exit(1);
}
console.log("smoke resolve-identity selesai");
