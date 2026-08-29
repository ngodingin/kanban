import { expect, test } from "@playwright/test";

test.describe("SPA deep link + routing (05-FRONTEND §5)", () => {
  test("positif: root / returns HTML with app shell", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    const html = await page.content();
    expect(html).toContain("NGodingin Kanban");
  });

  test("positif: SPA deep link /projects/p1/milestones/m1/boards/b1 returns HTML", async ({ page }) => {
    const res = await page.goto("/projects/p1/milestones/m1/boards/b1");
    expect(res?.status()).toBe(200);
    const html = await page.content();
    expect(html).toContain("NGodingin Kanban");
  });

  test("positif: SPA deep link /login returns HTML", async ({ page }) => {
    const res = await page.goto("/login");
    expect(res?.status()).toBe(200);
    const html = await page.content();
    expect(html).toContain("NGodingin Kanban");
  });

  test("positif: unknown SPA route returns HTML fallback", async ({ page }) => {
    const res = await page.goto("/a/b/c/d");
    expect(res?.status()).toBe(200);
    const html = await page.content();
    expect(html).toContain("NGodingin Kanban");
  });

  test("negatif: /api/* does NOT return HTML fallback", async ({ request }) => {
    const res = await request.get("/api/v1/tidak-ada");
    expect(res.status()).toBe(404);
    const contentType = res.headers()["content-type"] ?? "";
    expect(contentType).not.toContain("text/html");
    const body = await res.text();
    expect(body).not.toContain("NGodingin Kanban");
  });

  test("positif: /api/v1/health returns JSON", async ({ request }) => {
    const res = await request.get("/api/v1/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ data: { status: "ok" } });
  });

  test("positif: static assets served from filesystem", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    const cssLinks = await page.locator('link[rel="stylesheet"]').count();
    const scripts = await page.locator("script[src]").count();
    expect(cssLinks + scripts).toBeGreaterThan(0);
  });
});
