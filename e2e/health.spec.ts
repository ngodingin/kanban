import { expect, test } from "@playwright/test";

test("AC-meta: production build API health responds ok", async ({ request }) => {
  const res = await request.get("/api/v1/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ data: { status: "ok" } });
});
