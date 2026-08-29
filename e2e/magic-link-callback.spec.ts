import { expect, test } from "@playwright/test";

/**
 * QA-CL-69/CL-106 regression: full magic link callback flow through the actual
 * HTTP server stack (Hono on port 3100, not mocked).
 *
 * CL-106 flow:
 *   1. POST /api/auth/sign-in/magic-link → server sends email, rewrites email URL
 *      to /login/verify?token=...&returnTo=... (SPA route, not API endpoint)
 *   2. GET  /__test/captured-urls      → extract email URL with token
 *   3. Extract token from URL params
 *   4. GET  /api/auth/magic-link/verify?token=... (without callbackURL)
 *      → creates session, sets Set-Cookie on 200 JSON response
 *   5. GET  /api/auth/get-session      → returns the created session
 *
 * On Vercel, the email URL navigates to SPA /login/verify which calls the API
 * verify endpoint (200 response preserves Set-Cookie, unlike 302 redirect).
 */

const ORIGIN = "http://localhost:3100";

test.describe("Magic link callback: session creation (QA-CL-69 regression)", () => {
  test.beforeEach(async ({ request }) => {
    await request.post(`${ORIGIN}/__test/captured-urls/reset`);
  });

  test("verify token: creates session + sets cookie (200 JSON response)", async ({ request }) => {
    const email = `e2e-cb-${Date.now()}@test.local`;

    // 1. Request magic link
    const signInRes = await request.post(`${ORIGIN}/api/auth/sign-in/magic-link`, {
      data: { email },
    });
    expect(signInRes.status()).toBe(200);

    // 2. Retrieve captured email URL (CL-106: points to /login/verify, not API)
    const capturedRes = await request.get(`${ORIGIN}/__test/captured-urls`);
    expect(capturedRes.status()).toBe(200);
    const { urls } = await capturedRes.json();
    expect(urls.length).toBeGreaterThanOrEqual(1);

    const emailUrl = urls[urls.length - 1] as string;
    expect(emailUrl).toContain("/login/verify?");

    // 3. Extract token from the email URL
    const parsed = new URL(emailUrl);
    const token = parsed.searchParams.get("token");
    expect(token).toBeTruthy();

    // 4. Call API verify WITHOUT callbackURL → 200 JSON + Set-Cookie
    //    (On Vercel: 200 response preserves Set-Cookie, unlike 302 redirect)
    const verifyRes = await request.get(
      `${ORIGIN}/api/auth/magic-link/verify?token=${token}`,
      { maxRedirects: 0 },
    );
    expect(verifyRes.status()).toBe(200);

    // CRITICAL: Set-Cookie must be present on the 200 response
    const setCookie = verifyRes.headers()["set-cookie"] ?? "";
    expect(setCookie).toContain("kanban.session_token=");
  });

  test("verify with returnTo: 200 response includes session cookie", async ({ request }) => {
    const email = `e2e-cb-redirect-${Date.now()}@test.local`;

    // 1. Request magic link with callbackURL
    const signInRes = await request.post(`${ORIGIN}/api/auth/sign-in/magic-link`, {
      data: { email, callbackURL: `${ORIGIN}/projects/test-project` },
    });
    expect(signInRes.status()).toBe(200);

    // 2. Retrieve captured email URL
    const capturedRes = await request.get(`${ORIGIN}/__test/captured-urls`);
    const { urls } = await capturedRes.json();
    const emailUrl = urls[urls.length - 1] as string;
    expect(emailUrl).toContain("/login/verify?");

    // 3. Extract token + verify returnTo is preserved
    const parsed = new URL(emailUrl);
    const token = parsed.searchParams.get("token");
    expect(token).toBeTruthy();
    expect(parsed.searchParams.get("returnTo")).toBe("/projects/test-project");

    // 4. Verify token via API → 200 JSON + Set-Cookie
    const verifyRes = await request.get(
      `${ORIGIN}/api/auth/magic-link/verify?token=${token}`,
      { maxRedirects: 0 },
    );
    expect(verifyRes.status()).toBe(200);

    // CRITICAL: Set-Cookie must be present
    const setCookie = verifyRes.headers()["set-cookie"] ?? "";
    expect(setCookie).toContain("kanban.session_token=");
  });

  test("full round-trip: sign-in → verify → get-session returns valid session", async ({ request }) => {
    const email = `e2e-cb-roundtrip-${Date.now()}@test.local`;

    // 1. Request magic link
    await request.post(`${ORIGIN}/api/auth/sign-in/magic-link`, {
      data: { email },
    });

    // 2. Get email URL
    const capturedRes = await request.get(`${ORIGIN}/__test/captured-urls`);
    const { urls } = await capturedRes.json();
    const emailUrl = urls[urls.length - 1] as string;

    // 3. Extract token from email URL
    const parsed = new URL(emailUrl);
    const token = parsed.searchParams.get("token")!;

    // 4. Verify token → creates session (200 JSON + Set-Cookie)
    const verifyRes = await request.get(
      `${ORIGIN}/api/auth/magic-link/verify?token=${token}`,
      { maxRedirects: 0 },
    );
    expect(verifyRes.status()).toBe(200);

    // 5. Extract session cookie from Set-Cookie header
    const setCookie = verifyRes.headers()["set-cookie"] ?? "";
    const cookieMatch = setCookie.match(/(kanban\.session_token)=([^;]+)/);
    expect(cookieMatch).not.toBeNull();
    const cookieName = cookieMatch![1];
    const cookieValue = cookieMatch![2];

    // 6. Use session cookie to call get-session
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

  test("SPA callback flow: browser navigates to /login/verify, gets session cookie", async ({ page }) => {
    const email = `e2e-cb-browser-${Date.now()}@test.local`;

    // 1. Request magic link via API
    await page.request.post(`${ORIGIN}/api/auth/sign-in/magic-link`, {
      data: { email, callbackURL: `${ORIGIN}/` },
    });

    // 2. Get email URL
    const capturedRes = await page.request.get(`${ORIGIN}/__test/captured-urls`);
    const { urls } = await capturedRes.json();
    const emailUrl = urls[urls.length - 1] as string;

    // 3. Navigate to email URL in browser (simulates clicking email link).
    //    SPA loads /login/verify, calls verify API (200 + Set-Cookie), redirects to /.
    await page.goto(emailUrl, { waitUntil: "networkidle" });

    // 4. After redirect, the browser should have the session cookie set.
    //    The page snapshot should show the dashboard (not /login), proving the session was created.
    const cookies = await page.context().cookies(ORIGIN);
    const sessionCookie = cookies.find(
      (c) => c.name === "kanban.session_token" || c.name === "__Secure-kanban.session_token",
    );
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie!.httpOnly).toBe(true);
    expect(sessionCookie!.path).toBe("/");

    // 5. The browser is now on / (the returnTo destination), and the session is active.
    //    Verify by checking the page URL is not /login (which would mean auth failed).
    expect(page.url()).not.toContain("/login");
  });
});
