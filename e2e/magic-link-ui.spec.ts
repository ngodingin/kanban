import { expect, test } from "@playwright/test";

test.describe("Magic Link UI (03-ENG A.14, 05-FRONTEND §5)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("positif: login page renders email form without password/social", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Masuk ke NGodingin Kanban/ })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("button", { name: /Kirim tautan masuk/ })).toBeVisible();

    // No password field
    const passwordFields = await page.locator('input[type="password"]').count();
    expect(passwordFields).toBe(0);

    // No social provider buttons (Google, GitHub, etc.)
    const body = await page.textContent("body");
    expect(body).not.toMatch(/google|github|facebook|oauth/i);
  });

  test("positif: submit shows 'Tautan sudah dikirim' state", async ({ page }) => {
    await page.getByLabel("Email").fill("test-e2e@example.com");
    await page.getByRole("button", { name: /Kirim tautan masuk/ }).click();

    await expect(page.getByRole("status")).toContainText("Tautan sudah dikirim");
  });

  test("positif: submit button transitions from submitting to sent", async ({ page }) => {
    await page.getByLabel("Email").fill("test-e2e@example.com");
    await page.getByRole("button", { name: /Kirim tautan masuk/ }).click();

    // Button is disabled during submitting (brief), then form replaced with sent message
    await expect(page.getByRole("status")).toContainText("Tautan sudah dikirim");
  });

  test("positif: ?error=INVALID_TOKEN shows expired/used message", async ({ page }) => {
    await page.goto("/login?error=INVALID_TOKEN");

    await expect(page.getByText("Tautan tidak valid atau sudah kedaluwarsa")).toBeVisible();
    await expect(page.getByText("Minta tautan baru di bawah")).toBeVisible();
  });

  test("negatif: error response shows generic message without account enumeration", async ({ page }) => {
    // Abort the request to guarantee the catch block is hit
    await page.route("**/api/auth/**", (route) => route.abort("failed"));

    await page.getByLabel("Email").fill("test-e2e@example.com");
    await page.getByRole("button", { name: /Kirim tautan masuk/ }).click();

    await expect(page.getByText("Terjadi kesalahan. Coba lagi.")).toBeVisible({ timeout: 10_000 });

    // No account enumeration hints
    const body = await page.textContent("body");
    expect(body).not.toMatch(/terdaftar|belum punya akun|not found|tidak ditemukan/i);
  });

  test("positif: form has no password input", async ({ page }) => {
    const inputs = await page.locator("input").all();
    for (const input of inputs) {
      const type = await input.getAttribute("type");
      expect(type).not.toBe("password");
    }
  });

  test("positif: powered by footer visible", async ({ page }) => {
    await expect(page.getByText("Powered by NGodingiN")).toBeVisible();
  });
});
