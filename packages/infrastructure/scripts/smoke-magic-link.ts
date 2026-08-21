import { createClient } from "@libsql/client";
import { applyGlobalMigrations } from "../src/database/migrate.ts";
import { createAuth } from "../src/auth/auth.ts";
import type { SendMagicLinkData } from "../src/auth/auth.ts";

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

const cleanupEmails = `ml-smoke-${Date.now()}`;

try {
  await applyGlobalMigrations(client);

  const sent: SendMagicLinkData[] = [];
  const baseUrl = "https://kanban-ngodingin.vercel.app";
  const auth = createAuth({
    globalClient: client,
    baseUrl,
    secret: "x".repeat(32),
    sendMagicLink: async (data) => {
      sent.push(data);
    },
  });

  const knownEmail = `${cleanupEmails}@smoke.local`;
  const unknownEmail = `${cleanupEmails}-unknown@smoke.local`;

  const requestLink = (email: string, name?: string) =>
    auth.handler(
      new Request(`${baseUrl}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, name }),
      }),
    );

  const resKnown = await requestLink(knownEmail, "ML Smoke");
  assert(resKnown.status === 200, "request-link-200", "POST /sign-in/magic-link -> 200");
  assert(((await resKnown.json()) as { status?: boolean }).status === true, "request-link-body", "body {status:true} (tanpa kebocoran)");
  assert(sent.length === 1 && sent[0]!.email === knownEmail, "send-called", "sendMagicLink dipanggil dengan email yang diminta");
  const linkUrl = sent[0]!.url;
  assert(linkUrl.startsWith(`${baseUrl}/api/auth/magic-link/verify?token=`), "link-origin", `link memakai canonical origin staging`);

  const rawRows = await client.execute({
    sql: "SELECT identifier FROM auth_verifications WHERE identifier = ?",
    args: [sent[0]!.token],
  });
  assert(rawRows.rows.length === 0, "token-raw-not-stored", "token mentah tidak pernah menjadi identifier");
  const hashRows = await client.execute({
    sql: "SELECT identifier FROM auth_verifications WHERE value LIKE ?",
    args: [`%${knownEmail}%`],
  });
  assert(hashRows.rows.length === 1, "verification-row", "satu baris auth_verifications untuk link");
  const identifier = hashRows.rows[0]!.identifier as string;
  assert(identifier !== sent[0]!.token && identifier.length === 43, "token-hashed", "identifier = SHA-256 base64url token (43 char), bukan token mentah");

  const resUnknown = await requestLink(unknownEmail);
  assert(resUnknown.status === 200, "enumeration-status", "email tak dikenal -> status 200 yang sama");
  assert(((await resUnknown.json()) as { status?: boolean }).status === true, "enumeration-body", "email tak dikenal -> body identik {status:true}");

  const verify = (t: string) =>
    auth.handler(
      new Request(`${baseUrl}/api/auth/magic-link/verify?token=${encodeURIComponent(t)}`, {
        headers: { cookie: "kanban.session_token=unused" },
      }),
    );

  const successRes = await verify(sent[0]!.token);
  assert(successRes.status === 200, "verify-success", "verify link valid -> 200 (JSON session, tanpa callbackURL)");
  const successJson = (await successRes.json()) as { session?: { id?: string }; user?: { id?: string } };
  assert(!!successJson.session && !!successJson.user, "verify-session", "response memuat session + user");
  const setCookies = successRes.headers.getSetCookie?.() ?? [];
  const cookieName = "__Secure-kanban.session_token";
  const sessionCookie = setCookies.find((c) => c.startsWith(`${cookieName}=`)) ?? "";
  assert(sessionCookie.includes("HttpOnly"), "verify-cookie", "Set-Cookie session HttpOnly (origin https -> __Secure- prefix)");
  assert(sessionCookie.includes("Secure"), "verify-cookie-secure", "Set-Cookie session Secure");

  const sessionToken = sessionCookie.split("=")[1]?.split(";")[0] ?? "";
  const getSes = await auth.handler(
    new Request(`${baseUrl}/api/auth/get-session`, {
      headers: { cookie: `${cookieName}=${sessionToken}` },
    }),
  );
  const getSesJson = (await getSes.json()) as { user?: { email?: string } } | null;
  assert(getSesJson?.user?.email === knownEmail, "session-created", "link valid menghasilkan session untuk user yang benar");

  const reuseRes = await verify(sent[0]!.token);
  const reuseLocation = reuseRes.headers.get("location") ?? "";
  assert(reuseRes.status === 302 && reuseLocation.includes("error=INVALID_TOKEN"), "verify-reuse", "konsumsi kedua ditolak (single-use)");

  const invalidRes = await verify("totally-invalid-token");
  const invalidLocation = invalidRes.headers.get("location") ?? "";
  assert(invalidRes.status === 302 && invalidLocation.includes("error=INVALID_TOKEN"), "verify-invalid", "token invalid ditolak");

  await requestLink(`${cleanupEmails}-expired@smoke.local`);
  const expSent = sent[sent.length - 1]!;
  const expRows = await client.execute({
    sql: "SELECT identifier FROM auth_verifications WHERE value LIKE ?",
    args: [`%${cleanupEmails}-expired@smoke.local%`],
  });
  const expIdentifier = expRows.rows[0]!.identifier as string;
  await client.execute({
    sql: "UPDATE auth_verifications SET expires_at = ? WHERE identifier = ?",
    args: [Math.floor(Date.now() / 1000) - 60, expIdentifier],
  });
  const expRes = await verify(expSent.token);
  const expLocation = expRes.headers.get("location") ?? "";
  assert(expRes.status === 302 && expLocation.includes("error=INVALID_TOKEN"), "verify-expired", "token kedaluwarsa ditolak");

  await Promise.all([
    requestLink(`${cleanupEmails}-conc@smoke.local`),
    requestLink(`${cleanupEmails}-conc@smoke.local`),
  ]);
  const concSent = sent.filter((s) => s.email === `${cleanupEmails}-conc@smoke.local`);
  const concToken = concSent[0]!.token;
  const [c1, c2] = await Promise.all([verify(concToken), verify(concToken)]);
  const c1Ok = c1.status === 200;
  const c2Ok = c2.status === 200;
  const c1Loc = c1.headers.get("location") ?? "";
  const c2Loc = c2.headers.get("location") ?? "";
  const successes = (c1Ok ? 1 : 0) + (c2Ok ? 1 : 0);
  const rejectedOne = c1Ok ? c2 : c1;
  const rejectedLoc = c1Ok ? c2Loc : c1Loc;
  assert(successes === 1 && rejectedOne.status === 302 && rejectedLoc.includes("error=INVALID_TOKEN"), "verify-concurrent", "dua konsumsi konkuren -> tepat satu sukses (single-use atomik)");

  const emailPasswordRes = await auth.handler(
    new Request(`${baseUrl}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: knownEmail, password: "x" }),
    }),
  );
  assert(emailPasswordRes.status === 400, "password-unavailable", "sign-in/email tidak tersedia (400: email and password not enabled)");
  const socialRes = await auth.handler(
    new Request(`${baseUrl}/api/auth/sign-in/google`, { method: "POST" }),
  );
  assert(socialRes.status === 404, "social-unavailable", "social/OAuth tidak tersedia (404)");

  const prodSent: SendMagicLinkData[] = [];
  const prod = createAuth({
    globalClient: client,
    baseUrl: "https://kanban.ngodingin.xyz",
    secret: "x".repeat(32),
    sendMagicLink: async (d) => {
      prodSent.push(d);
    },
  });
  await prod.handler(
    new Request("https://kanban.ngodingin.xyz/api/auth/sign-in/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `${cleanupEmails}-prod@smoke.local` }),
    }),
  );
  assert((prodSent[0]?.url ?? "").startsWith("https://kanban.ngodingin.xyz/api/auth/magic-link/verify?token="), "link-origin-prod", "production link memakai origin produksi");
} catch (e) {
  fail("exception", String(e));
} finally {
  for (const email of [`${cleanupEmails}@smoke.local`, `${cleanupEmails}-unknown@smoke.local`, `${cleanupEmails}-expired@smoke.local`, `${cleanupEmails}-conc@smoke.local`, `${cleanupEmails}-prod@smoke.local`]) {
    const uRows = await client.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [email] });
    for (const u of uRows.rows as unknown as Array<{ id: string }>) {
      await client.execute({ sql: "DELETE FROM auth_sessions WHERE user_id = ?", args: [u.id] });
      await client.execute({ sql: "DELETE FROM users WHERE id = ?", args: [u.id] });
    }
  }
  await client.execute({ sql: "DELETE FROM auth_verifications WHERE value LIKE ?", args: [`%${cleanupEmails}%`] });
  await client.close();
}

if (failed > 0) {
  console.log(`smoke magic-link GAGAL (${failed} kegagalan)`);
  process.exit(1);
}
console.log("smoke magic-link selesai");