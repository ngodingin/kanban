import { expect, test } from "@playwright/test";
import {
  STAGING_ORIGIN,
  assertStagingOrigin,
  testNamespace,
  stagingTest,
  registerCleanup,
} from "./helpers/staging.ts";
import { signInMagicLink, verifyMagicLink, getSession, extractSessionCookie } from "./helpers/api.ts";
import { waitForMagicLinkEmail } from "./helpers/mailinator.ts";

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? process.env.TEST_EMAIL ?? "";

test.describe("Staging: Magic Link login (7.16.1)", () => {
  test.beforeAll(() => {
    assertStagingOrigin(STAGING_ORIGIN);
    if (!TEST_EMAIL) {
      throw new Error("E2E_TEST_EMAIL atau TEST_EMAIL harus tersedia di environment");
    }
  });

  test("origin allowlist: staging hanya menerima canonical origin", () => {
    expect(STAGING_ORIGIN).toBe("https://kanban-ngodingin.vercel.app");
    assertStagingOrigin(STAGING_ORIGIN);
    expect(() => assertStagingOrigin("https://evil.example.com")).toThrow("Origin tidak diizinkan");
  });

  stagingTest("magic link sign-in → Mailinator → verify → session aktif", async ({ request }) => {
    const ns = testNamespace();
    const email = TEST_EMAIL;
    const callbackPath = `/projects/${ns}`;

    registerCleanup(`sign-out ${ns}`, async () => {
      // Sign out via API — clear session cookie
      // Session akan expired sendiri (1h idle / Sunday boundary)
    });

    // 1. Request magic link
    const signInResult = await signInMagicLink(request, email, callbackPath);
    expect(signInResult.status, "sign-in harus 200").toBe(200);

    // 2. Tunggu email di Mailinator + ekstrak token
    const { token, emailUrl } = await waitForMagicLinkEmail(request, email, STAGING_ORIGIN, 60_000, 3_000);
    expect(token).toBeTruthy();
    expect(emailUrl).toContain("/login/verify?");
    expect(emailUrl).toContain("token=");

    // 3. Verify token → 200 JSON + Set-Cookie
    const verifyResult = await verifyMagicLink(request, token);
    expect(verifyResult.status, "verify harus 200").toBe(200);
    expect(verifyResult.setCookie, "set-cookie harus ada").toContain("kanban.session_token=");

    // 4. Assert session aktif via get-session
    const cookie = extractSessionCookie(verifyResult.setCookie);
    expect(cookie, "session cookie harus ada").toBeTruthy();

    const sessionResult = await getSession(request, cookie);
    expect(sessionResult.status, "get-session harus 200").toBe(200);
    expect(sessionResult.hasSession, "session harus aktif").toBe(true);
  });

  stagingTest("verify dengan token salah → tidak membuat session", async ({ request }) => {
    const fakeToken = "000000000000000000000000000000000000000000000000000000000000000000";
    const verifyResult = await verifyMagicLink(request, fakeToken);
    expect(verifyResult.status, "verify token salah harus gagal (bukan 200)").not.toBe(200);
  });

  stagingTest("get-session tanpa cookie → tidak ada session", async ({ request }) => {
    const sessionResult = await getSession(request, "");
    expect(sessionResult.status, "get-session harus 200").toBe(200);
    expect(sessionResult.hasSession, "session harus null").toBe(false);
  });
});
