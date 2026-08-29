import { expect, test } from "@playwright/test";

/**
 * QA-CL-69 regression: full magic link callback flow through the actual HTTP
 * server stack (Hono on port 3100, not mocked).
 *
 * Flow:
 *   1. POST /api/auth/sign-in/magic-link  → server sends email (mock), captures verify URL
 *   2. GET  /__test/captured-urls         → extract verification URL + token
 *   3. GET  /api/auth/magic-link/verify   → creates session, sets Set-Cookie, redirects
 *   4. Check Set-Cookie header on redirect response
 *   5. GET  /api/auth/get-session         → returns the created session
 *
 * QA-CL-69 found staging callback returns session=null. This test verifies
 * the session IS created through the full HTTP round-trip.
 */

const ORIGIN = "http://localhost:3100";

test.describe("Magic link callback: session creation (QA-CL-69 regression)", () => {
  test.beforeEach(async ({ request }) => {
    // Reset captured URLs before each test
    await request.post(`${ORIGIN}/__test/captured-urls/reset`);
  });

  test("verify without callbackURL: creates session + sets cookie (302 redirect)", async ({ request }) => {
    const email = `e2e-cb-${Date.now()}@test.local`;

    // 1. Request magic link
    const signInRes = await request.post(`${ORIGIN}/api/auth/sign-in/magic-link`, {
      data: { email },
    });
    expect(signInRes.status()).toBe(200);

    // 2. Retrieve captured verification URL
    const capturedRes = await request.get(`${ORIGIN}/__test/captured-urls`);
    expect(capturedRes.status()).toBe(200);
    const { urls } = await capturedRes.json();
    expect(urls.length).toBeGreaterThanOrEqual(1);

    const verifyUrl = urls[urls.length - 1] as string;
    expect(verifyUrl).toContain("/api/auth/magic-link/verify?token=");

    // 3. Verify the token — Better Auth returns 302 redirect (to origin / or callbackURL)
    //    even without explicit callbackURL. Critical: Set-Cookie must be present.
    const verifyRes = await request.get(verifyUrl, { maxRedirects: 0 });
    expect([200, 302]).toContain(verifyRes.status());

    // CRITICAL: Set-Cookie must be present on the response
    const setCookie = verifyRes.headers()["set-cookie"] ?? "";
    expect(setCookie).toContain("kanban.session_token=");
  });

  test("verify with callbackURL: 302 redirect with Set-Cookie header", async ({ request }) => {
    const email = `e2e-cb-redirect-${Date.now()}@test.local`;
    const callbackURL = `${ORIGIN}/projects/test-project`;

    // 1. Request magic link with callbackURL
    const signInRes = await request.post(`${ORIGIN}/api/auth/sign-in/magic-link`, {
      data: { email, callbackURL },
    });
    expect(signInRes.status()).toBe(200);

    // 2. Retrieve captured verification URL (should include callbackURL param)
    const capturedRes = await request.get(`${ORIGIN}/__test/captured-urls`);
    const { urls } = await capturedRes.json();
    const verifyUrl = urls[urls.length - 1] as string;
    expect(verifyUrl).toContain("/api/auth/magic-link/verify?token=");

    // 3. Verify WITH callbackURL → should redirect (302) + Set-Cookie
    const verifyRes = await request.get(verifyUrl, {
      maxRedirects: 0, // Don't follow redirects — we want to inspect the 302
    });
    expect(verifyRes.status()).toBe(302);

    const location = verifyRes.headers()["location"] ?? "";
    expect(location).toContain("/projects/test-project");

    // CRITICAL: Set-Cookie must be present on the redirect response
    // This is what QA-CL-69 found missing on staging
    const setCookie = verifyRes.headers()["set-cookie"] ?? "";
    expect(setCookie).toContain("kanban.session_token=");
  });

  test("full round-trip: sign-in → verify → get-session returns valid session", async ({ request }) => {
    const email = `e2e-cb-roundtrip-${Date.now()}@test.local`;

    // 1. Request magic link
    await request.post(`${ORIGIN}/api/auth/sign-in/magic-link`, {
      data: { email },
    });

    // 2. Get verification URL
    const capturedRes = await request.get(`${ORIGIN}/__test/captured-urls`);
    const { urls } = await capturedRes.json();
    const verifyUrl = urls[urls.length - 1] as string;

    // 3. Verify token → creates session (returns 302 or 200)
    const verifyRes = await request.get(verifyUrl, { maxRedirects: 0 });
    expect([200, 302]).toContain(verifyRes.status());

    // 4. Extract session cookie from Set-Cookie header
    const setCookie = verifyRes.headers()["set-cookie"] ?? "";
    // Cookie may be kanban.session_token or __Secure-kanban.session_token
    const cookieMatch = setCookie.match(/(kanban\.session_token)=([^;]+)/);
    expect(cookieMatch).not.toBeNull();
    const cookieName = cookieMatch![1];
    const cookieValue = cookieMatch![2];

    // 5. Use session cookie to call get-session
    const sessionRes = await request.get(`${ORIGIN}/api/auth/get-session`, {
      headers: { cookie: `${cookieName}=${cookieValue}` },
    });
    expect(sessionRes.status()).toBe(200);

    const sessionBody = await sessionRes.json();
    expect(sessionBody.session).toBeDefined();
    expect(sessionBody.session.token).toBeTruthy();
    expect(sessionBody.user).toBeDefined();
    expect(sessionBody.user.email).toBe(email);
  });

  test("verify with callbackURL: browser redirect flow sets session cookie", async ({ page }) => {
    const email = `e2e-cb-browser-${Date.now()}@test.local`;
    const callbackURL = `${ORIGIN}/`;

    // 1. Request magic link via API
    await page.request.post(`${ORIGIN}/api/auth/sign-in/magic-link`, {
      data: { email, callbackURL },
    });

    // 2. Get verification URL
    const capturedRes = await page.request.get(`${ORIGIN}/__test/captured-urls`);
    const { urls } = await capturedRes.json();
    const verifyUrl = urls[urls.length - 1] as string;

    // 3. Navigate to verify URL in browser (simulates clicking email link)
    //    The browser follows the 302 redirect and should receive the session cookie
    await page.goto(verifyUrl);

    // 4. After redirect, check that the session is active
    //    The page should have redirected to the callbackURL (/)
    //    and the session cookie should be set
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(
      (c) => c.name === "kanban.session_token" || c.name === "__Secure-kanban.session_token",
    );
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie!.httpOnly).toBe(true);
    expect(sessionCookie!.path).toBe("/");

    // 5. Verify session via API
    const sessionRes = await page.request.get(`${ORIGIN}/api/auth/get-session`, {
      headers: { cookie: `${sessionCookie!.name}=${sessionCookie!.value}` },
    });
    expect(sessionRes.status()).toBe(200);
    const sessionBody = await sessionRes.json();
    expect(sessionBody.session).toBeDefined();
    expect(sessionBody.user.email).toBe(email);
  });
});
