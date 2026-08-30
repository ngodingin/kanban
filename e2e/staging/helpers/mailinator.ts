import type { Page } from "@playwright/test";

const MAILINATOR_ORIGIN = "https://www.mailinator.com";

export interface InboxSnapshot {
  messageIds: string[];
}

export async function snapshotInbox(
  page: Page,
  email: string,
  timeoutMs: number = 10_000,
): Promise<InboxSnapshot> {
  const localPart = email.split("@")[0];
  const inboxUrl = `${MAILINATOR_ORIGIN}/v4/public/inboxes.jsp?to=${localPart}`;
  await page.goto(inboxUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });

  const messageRows = page.locator("table tbody tr");
  const count = await messageRows.count();
  const messageIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = await messageRows.nth(i).getAttribute("id");
    if (id) messageIds.push(id);
  }
  return { messageIds };
}

export async function waitForNewEmail(
  page: Page,
  email: string,
  snapshot: InboxSnapshot,
  timeoutMs: number = 90_000,
  pollIntervalMs: number = 3_000,
): Promise<{ subject: string; rowLocator: ReturnType<Page["locator"]> }> {
  const localPart = email.split("@")[0];
  const inboxUrl = `${MAILINATOR_ORIGIN}/v4/public/inboxes.jsp?to=${localPart}`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await page.goto(inboxUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });

    const messageRows = page.locator("table tbody tr");
    const count = await messageRows.count();
    for (let i = 0; i < count; i++) {
      const row = messageRows.nth(i);
      const id = await row.getAttribute("id");
      if (id && !snapshot.messageIds.includes(id)) {
        const subject = (await row.locator("td").nth(1).textContent()) ?? "";
        return { subject, rowLocator: row };
      }
    }
    await page.waitForTimeout(pollIntervalMs);
  }
  throw new Error(`Email baru tidak ditemukan di ${email} setelah ${timeoutMs}ms`);
}

export async function openEmailAndExtractLink(
  page: Page,
  rowLocator: ReturnType<Page["locator"]>,
  stagingOrigin: string,
): Promise<string> {
  await rowLocator.click();
  await page.waitForLoadState("domcontentloaded");

  const iframe = page.frameLocator("iframe#html_message, iframe[name='html_message']");
  const linkSelector = `a[href*="${stagingOrigin}/login/verify"]`;

  const link = iframe.locator(linkSelector).first();
  await link.waitFor({ timeout: 10_000 });
  const href = await link.getAttribute("href");
  if (!href) throw new Error("Magic link href tidak ditemukan di email body");
  return href;
}

export function extractTokenFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("token");
  } catch {
    return null;
  }
}
