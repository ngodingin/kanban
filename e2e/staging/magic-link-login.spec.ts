import { expect, test } from "@playwright/test";
import {
  STAGING_ORIGIN,
  assertStagingOrigin,
  testNamespace,
} from "./helpers/staging.ts";
import { getSession, signOut } from "./helpers/api.ts";
import {
  buildRecipientAddress,
  waitForResendEmail,
  extractTokenFromUrl,
} from "./helpers/resend.ts";

test.describe("Staging: Magic Link login (7.16.1)", () => {
  test.beforeAll(() => {
    assertStagingOrigin(STAGING_ORIGIN);
  });

  test("origin allowlist: staging hanya menerima canonical origin", () => {
    expect(STAGING_ORIGIN).toBe("https://kanban-ngodingin.vercel.app");
    assertStagingOrigin(STAGING_ORIGIN);
    expect(() => assertStagingOrigin("https://evil.example.com")).toThrow("Origin tidak diizinkan");
  });

  test("magic link sign-in → Resend → verify → session aktif → sign-out", async ({ page, request }) => {
    const ns = testNamespace();
    const recipient = buildRecipientAddress(ns);
    let sessionCookie = "";

    try {
      // 1. Buka /login di browser dengan returnTo, isi form dengan Resend recipient, submit
      const receivedAfter = new Date();
      await page.goto(`${STAGING_ORIGIN}/login?returnTo=/projects/${encodeURIComponent(ns)}`);
      await page.waitForLoadState("networkidle");

      const emailInput = page.locator('input[type="email"], input[name="email"]');
      await emailInput.fill(recipient);
      await page.locator('button[type="submit"], button:has-text("Kirim"), button:has-text("Masuk")').click();

      // Tunggu konfirmasi "tautan sudah dikirim"
      await expect(
        page.locator("text=tautan sudah dikirim").or(page.locator("text=Tautan sudah dikirim")),
      ).toBeVisible({ timeout: 10_000 });

      // 2. Tunggu email via Resend Receiving API (filter by recipient + receivedAfter)
      const { link: emailLink } = await waitForResendEmail(recipient, receivedAfter, STAGING_ORIGIN);

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
      sessionCookie = `${sessionCookieObj!.name}=${sessionCookieObj!.value}`;

      // 5. Assert session aktif via API
      const sessionResult = await getSession(request, sessionCookie);
      expect(sessionResult.status, "get-session harus 200").toBe(200);
      expect(sessionResult.hasSession, "session harus aktif").toBe(true);
    } finally {
      // 6. Cleanup: sign-out selalu dijalankan
      if (sessionCookie) {
        await signOut(request, sessionCookie).catch(() => {});
      }
    }
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

  test("QA-CL-82 regression: session tetap aktif setelah beberapa navigasi protected", async ({ page, request }) => {
    const ns = testNamespace();
    const recipient = buildRecipientAddress(ns);
    let sessionCookie = "";

    try {
      // 1. Login via Magic Link (full browser flow)
      const receivedAfter = new Date();
      await page.goto(`${STAGING_ORIGIN}/login?returnTo=/projects/${encodeURIComponent(ns)}`);
      await page.waitForLoadState("networkidle");

      const emailInput = page.locator('input[type="email"], input[name="email"]');
      await emailInput.fill(recipient);
      await page.locator('button[type="submit"], button:has-text("Kirim"), button:has-text("Masuk")').click();

      await expect(
        page.locator("text=tautan sudah dikirim").or(page.locator("text=Tautan sudah dikirim")),
      ).toBeVisible({ timeout: 10_000 });

      const { link: emailLink } = await waitForResendEmail(recipient, receivedAfter, STAGING_ORIGIN);
      const token = extractTokenFromUrl(emailLink);
      expect(token, "token harus ada").toBeTruthy();

      await page.goto(emailLink);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(new RegExp(`/projects/${ns}`), { timeout: 15_000 });

      // 2. Extract session cookie
      const cookies = await page.context().cookies(STAGING_ORIGIN);
      const sessionCookieObj = cookies.find(
        (c) => c.name === "__Secure-kanban.session_token" || c.name === "kanban.session_token",
      );
      expect(sessionCookieObj, "session cookie harus ada").toBeTruthy();
      sessionCookie = `${sessionCookieObj!.name}=${sessionCookieObj!.value}`;

      // 3. Navigate ke beberapa route protected, assert session aktif setiap kali
      const protectedRoutes = [
        `/projects/${ns}`,
        `/projects/${ns}/boards/current`,
        `/`,
      ];

      for (const route of protectedRoutes) {
        await page.goto(`${STAGING_ORIGIN}${route}`);
        await page.waitForLoadState("networkidle");

        // Session harus masih aktif — tidak redirect ke /login
        const currentUrl = page.url();
        expect(currentUrl, `tidak boleh redirect ke /login dari ${route}`).not.toContain("/login");

        // Verify via API
        const sessionResult = await getSession(request, sessionCookie);
        expect(sessionResult.hasSession, `session harus aktif setelah navigasi ke ${route}`).toBe(true);
      }
    } finally {
      // 4. Cleanup: sign-out selalu dijalankan
      if (sessionCookie) {
        await signOut(request, sessionCookie).catch(() => {});
      }
    }
  });
});
