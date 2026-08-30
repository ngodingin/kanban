import type { Page } from "@playwright/test";

const MAILINATOR_ORIGIN = "https://www.mailinator.com";

export interface InboxSnapshot {
  messageIds: string[];
}

export async function snapshotInbox(
  page: Page,
  email: string,
  timeoutMs: number = 15_000,
  retries: number = 3,
): Promise<InboxSnapshot> {
  const localPart = email.split("@")[0];
  const inboxUrl = `${MAILINATOR_ORIGIN}/v4/public/inboxes.jsp?to=${localPart}`;

  for (let attempt = 0; attempt < retries; attempt++) {
    await page.goto(inboxUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });

    try {
      await page.waitForSelector("tr[id^='row_']", { timeout: 10_000 });
    } catch {
      // Inbox might be empty — no rows is valid
    }

    const rows = page.locator("tr[id^='row_']");
    const count = await rows.count();
    if (count > 0 || attempt === retries - 1) {
      const messageIds: string[] = [];
      for (let i = 0; i < count; i++) {
        const id = await rows.nth(i).getAttribute("id");
        if (id) messageIds.push(id);
      }
      return { messageIds };
    }

    // Retry: inbox might not have loaded yet
    await page.waitForTimeout(2_000);
  }

  return { messageIds: [] };
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
    await page.goto(inboxUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });

    // Wait for Angular to render — but don't fail if inbox is empty
    try {
      await page.waitForSelector("tr[id^='row_']", { timeout: 8_000 });
    } catch {
      // Inbox might be temporarily empty — retry
      await page.waitForTimeout(pollIntervalMs);
      continue;
    }

    const rows = page.locator("tr[id^='row_']");
    const count = await rows.count();

    // If 0 rows after previously having rows, Angular might still be loading
    if (count === 0) {
      await page.waitForTimeout(pollIntervalMs);
      continue;
    }

    const currentIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const id = await rows.nth(i).getAttribute("id");
      if (id) currentIds.push(id);
    }

    // Find new IDs not in snapshot
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
