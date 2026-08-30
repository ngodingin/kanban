import { expect, test } from "@playwright/test";
import {
  STAGING_ORIGIN,
  assertStagingOrigin,
  testNamespace,
} from "./helpers/staging.ts";
import { getSession, signOut } from "./helpers/api.ts";
import { snapshotInbox, waitForNewEmail, openEmailAndExtractLink, extractTokenFromUrl } from "./helpers/mailinator.ts";

const E2E_TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? "";

test.describe("Staging: Magic Link login (7.16.1)", () => {
  test.beforeAll(() => {
    assertStagingOrigin(STAGING_ORIGIN);
    if (!E2E_TEST_EMAIL) {
      throw new Error("E2E_TEST_EMAIL harus tersedia di environment");
    }
  });

  test("origin allowlist: staging hanya menerima canonical origin", () => {
    expect(STAGING_ORIGIN).toBe("https://kanban-ngodingin.vercel.app");
    assertStagingOrigin(STAGING_ORIGIN);
    expect(() => assertStagingOrigin("https://evil.example.com")).toThrow("Origin tidak diizinkan");
  });

  test("magic link sign-in → Mailinator → verify → session aktif → sign-out", async ({ page, request }) => {
    const ns = testNamespace();

    // Snapshot inbox sebelum kirim email
    const mailboxPage = await page.context().newPage();
    const snapshot = await snapshotInbox(mailboxPage, E2E_TEST_EMAIL);
    await mailboxPage.close();

    // 1. Buka /login di browser, isi form, submit
    await page.goto(`${STAGING_ORIGIN}/login`);
    await page.waitForLoadState("networkidle");

    const emailInput = page.locator('input[type="email"], input[name="email"]');
    await emailInput.fill(E2E_TEST_EMAIL);
    await page.locator('button[type="submit"], button:has-text("Kirim"), button:has-text("Masuk")').click();

    // Tunggu konfirmasi "tautan sudah dikirim"
    await expect(
      page.locator("text=tautan sudah dikirim").or(page.locator("text=Tautan sudah dikirim")),
    ).toBeVisible({ timeout: 10_000 });

    // 2. Buka Mailinator di tab baru, tunggu email baru, ambil link
    const mailPage = await page.context().newPage();
    const { rowLocator } = await waitForNewEmail(mailPage, E2E_TEST_EMAIL, snapshot);
    const emailLink = await openEmailAndExtractLink(mailPage, rowLocator, STAGING_ORIGIN);
    await mailPage.close();

    expect(emailLink).toContain("/login/verify?");
    expect(emailLink).toContain("token=");
    const token = extractTokenFromUrl(emailLink);
    expect(token, "token harus ada").toBeTruthy();

    // 3. Navigasi ke magic link URL di browser (bukan API)
    await page.goto(emailLink);
    await page.waitForLoadState("networkidle");

    // Verifikasi: harus redirect ke callbackPath, session aktif
    await expect(page).toHaveURL(new RegExp(`/projects/${ns}`), { timeout: 15_000 });

    // 4. Extract session cookie dari browser context
    const cookies = await page.context().cookies(STAGING_ORIGIN);
    const sessionCookieObj = cookies.find(
      (c) => c.name === "__Secure-kanban.session_token" || c.name === "kanban.session_token",
    );
    expect(sessionCookieObj, "session cookie harus ada").toBeTruthy();
    const sessionCookie = `${sessionCookieObj!.name}=${sessionCookieObj!.value}`;

    // 5. Assert session aktif via API
    const sessionResult = await getSession(request, sessionCookie);
    expect(sessionResult.status, "get-session harus 200").toBe(200);
    expect(sessionResult.hasSession, "session harus aktif").toBe(true);

    // 6. Cleanup: sign-out, assert session hilang
    const signOutResult = await signOut(request, sessionCookie);
    expect(signOutResult.status, "sign-out harus 200").toBe(200);

    const afterSignOut = await getSession(request, sessionCookie);
    expect(afterSignOut.hasSession, "session harus hilang setelah sign-out").toBe(false);
  });

  test("verify dengan token salah → tidak membuat session", async ({ request }) => {
    const fakeToken = "000000000000000000000000000000000000000000000000000000000000000000";
    const res = await request.get(
      `${STAGING_ORIGIN}/api/auth/magic-link/verify?token=${fakeToken}`,
      {
        headers: { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "" },
        maxRedirects: 0,
      },
    );
    // Server harus reject: 302 redirect (atau 200 JSON dengan verified:false)
    const status = res.status();
    expect([200, 302, 400]).toContain(status);

    // Tidak ada session yang dibuat
    const cookies = res.headers()["set-cookie"];
    if (cookies) {
      const match = cookies.match(/(?:__Secure-)?kanban\.session_token=[^;]+/);
      expect(match, "tidak ada session cookie").toBeNull();
    }
  });

  test("get-session tanpa cookie → tidak ada session", async ({ request }) => {
    const sessionResult = await getSession(request, "");
    expect(sessionResult.status, "get-session harus 200").toBe(200);
    expect(sessionResult.hasSession, "session harus null").toBe(false);
  });
});
