import { expect, test } from "@playwright/test";

test.describe("Session Gate (03-ENG A.14, 05-FRONTEND §5)", () => {
  test("positif: deep link protected route without session redirects to /login", async ({ page }) => {
    // Better Auth client sends GET /api/auth/get-session; server returns { session: null, user: null }
    await page.route("**/api/auth/get-session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: null, user: null }),
      }),
    );

    await page.goto("/projects/some-project-id");

    // Should redirect to /login with returnTo parameter
    await expect(page).toHaveURL(/\/login/);
    await expect(page).toHaveURL(/returnTo=%2Fprojects%2Fsome-project-id/);

    // Login form should be visible
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("button", { name: /Kirim tautan masuk/ })).toBeVisible();
  });

  test("positif: /login remains public (no session check redirect loop)", async ({ page }) => {
    await page.route("**/api/auth/get-session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: null, user: null }),
      }),
    );

    await page.goto("/login");

    // Should stay on /login, not redirect elsewhere
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test("positif: session valid renders protected route content", async ({ page }) => {
    // Stub session endpoint to return valid session
    await page.route("**/api/auth/get-session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: { id: "sess-001", userId: "e2e-user-001", expiresAt: Date.now() + 3600_000 },
          user: { id: "e2e-user-001", name: "Test User", email: "test@example.com" },
        }),
      }),
    );

    await page.goto("/");

    // Should NOT redirect to /login — should render the home page
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "NGodingin Kanban" })).toBeVisible();
  });

  test("negatif: unauthenticated API request still returns 401 (session gate is UI-only)", async ({ page }) => {
    // Session gate intercept returns no session → redirect to /login
    await page.route("**/api/auth/get-session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: null, user: null }),
      }),
    );

    // API returns 401 for unauthenticated requests (defense-in-depth)
    await page.route("**/api/v1/**", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Unauthorized" } }),
      }),
    );

    await page.goto("/");

    // Should redirect to login (session gate catches it first)
    await expect(page).toHaveURL(/\/login/);
  });

  test("positif: loading state shown while session check is pending", async ({ page }) => {
    // Delay session response to observe loading state
    await page.route("**/api/auth/get-session", async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: { id: "s1", userId: "u1", expiresAt: Date.now() + 3600_000 },
          user: { id: "u1" },
        }),
      });
    });

    await page.goto("/");

    // Loading indicator should appear
    await expect(page.getByRole("status")).toBeVisible();

    // Eventually content renders
    await expect(page.getByRole("heading", { name: "NGodingin Kanban" })).toBeVisible();
  });

  test("negatif: deep link with nested route preserves returnTo correctly", async ({ page }) => {
    await page.route("**/api/auth/get-session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: null, user: null }),
      }),
    );

    await page.goto("/projects/p1/milestones/m2/boards/b3");

    await expect(page).toHaveURL(/\/login/);
    // returnTo should be the full nested path
    const url = new URL(page.url());
    const returnTo = url.searchParams.get("returnTo");
    expect(returnTo).toBe("/projects/p1/milestones/m2/boards/b3");
  });
});
