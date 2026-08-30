import type { Page } from "@playwright/test";

const MAILINATOR_ORIGIN = "https://www.mailinator.com";

export interface InboxSnapshot {
  messageIds: string[];
}

async function readRowIds(page: Page): Promise<string[]> {
  const rows = page.locator("tr[id^='row_']");
  const count = await rows.count();
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = await rows.nth(i).getAttribute("id");
    if (id) ids.push(id);
  }
  return ids;
}

export async function snapshotInbox(
  page: Page,
  email: string,
  timeoutMs: number = 20_000,
): Promise<InboxSnapshot> {
  const localPart = email.split("@")[0];
  const inboxUrl = `${MAILINATOR_ORIGIN}/v4/public/inboxes.jsp?to=${localPart}`;

  // Retry up to 5 times with stabilization check
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.goto(inboxUrl, { waitUntil: "networkidle", timeout: timeoutMs });

    // Wait for Angular to render
    try {
      await page.waitForSelector("tr[id^='row_']", { timeout: 12_000 });
    } catch {
      // No rows — might be empty or still loading
    }

    const ids = await readRowIds(page);

    if (ids.length > 0) {
      // Stabilization: wait 2s, re-read. If rows disappeared, retry.
      await page.waitForTimeout(2_000);
      const stableIds = await readRowIds(page);
      if (stableIds.length > 0) {
        return { messageIds: stableIds };
      }
    }

    // Empty or unstable — retry with increasing delay
    await page.waitForTimeout(3_000 * (attempt + 1));
  }

  // Final attempt — return whatever we have (may be empty)
  await page.goto(
    `${MAILINATOR_ORIGIN}/v4/public/inboxes.jsp?to=${localPart}`,
    { waitUntil: "networkidle", timeout: timeoutMs },
  );
  try {
    await page.waitForSelector("tr[id^='row_']", { timeout: 10_000 });
  } catch {
    // Empty inbox
  }
  return { messageIds: await readRowIds(page) };
}

export async function waitForNewEmail(
  page: Page,
  email: string,
  snapshot: InboxSnapshot,
  timeoutMs: number = 90_000,
  pollIntervalMs: number = 3_000,
): Promise<{ messageId: string }> {
  const localPart = email.split("@")[0];
  const inboxUrl = `${MAILINATOR_ORIGIN}/v4/public/inboxes.jsp?to=${localPart}`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await page.goto(inboxUrl, { waitUntil: "networkidle", timeout: 15_000 });

    try {
      await page.waitForSelector("tr[id^='row_']", { timeout: 10_000 });
    } catch {
      await page.waitForTimeout(pollIntervalMs);
      continue;
    }

    // Stabilization: re-read after short delay
    await page.waitForTimeout(1_500);
    const currentIds = await readRowIds(page);

    if (currentIds.length === 0) {
      await page.waitForTimeout(pollIntervalMs);
      continue;
    }

    for (const id of currentIds) {
      if (!snapshot.messageIds.includes(id)) {
        return { messageId: id };
      }
    }

    await page.waitForTimeout(pollIntervalMs);
  }

  const finalCount = await page.locator("tr[id^='row_']").count().catch(() => 0);
  throw new Error(
    `Email baru tidak ditemukan di ${email} setelah ${timeoutMs}ms. ` +
    `Inbox final: ${finalCount} baris (snapshot: ${snapshot.messageIds.length} ID). ` +
    `Kemungkinan: (a) email tidak terkirim, (b) email menggantikan email lama, atau (c) selector berubah.`,
  );
}

export async function openEmailAndExtractLink(
  page: Page,
  messageId: string,
  stagingOrigin: string,
): Promise<string> {
  const row = page.locator(`tr[id="${messageId}"]`);
  await row.click();

  await page.waitForSelector("#email_pane", { state: "visible", timeout: 10_000 });

  const iframe = page.frameLocator("iframe[name='html_msg_body']");
  const linkSelector = `a[href*="${stagingOrigin}/login/verify"]`;

  try {
    const link = iframe.locator(linkSelector).first();
    await link.waitFor({ state: "attached", timeout: 15_000 });
    const href = await link.getAttribute("href");
    if (!href) throw new Error("Magic link href null");
    return href;
  } catch {
    const fallback = page.locator(`a[href*="${stagingOrigin}/login/verify"]`).first();
    const href = await fallback.getAttribute("href");
    if (href) return href;
    throw new Error(`Magic link tidak ditemukan di email (iframe: html_msg_body, origin: ${stagingOrigin})`);
  }
}

export function extractTokenFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("token");
  } catch {
    return null;
  }
}
