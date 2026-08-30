import type { Page } from "@playwright/test";

const MAILINATOR_ORIGIN = "https://www.mailinator.com";

export interface InboxSnapshot {
  rowCount: number;
}

export async function snapshotInbox(
  page: Page,
  email: string,
  timeoutMs: number = 15_000,
): Promise<InboxSnapshot> {
  const localPart = email.split("@")[0];
  const inboxUrl = `${MAILINATOR_ORIGIN}/v4/public/inboxes.jsp?to=${localPart}`;
  await page.goto(inboxUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });

  // Wait for Angular to render rows — selector: table rows with id starting with "row_"
  try {
    await page.waitForSelector("tr[id^='row_']", { timeout: 10_000 });
  } catch {
    // Inbox might be empty — no rows is valid
  }

  const rows = page.locator("tr[id^='row_']");
  const rowCount = await rows.count();
  return { rowCount };
}

export async function waitForNewEmail(
  page: Page,
  email: string,
  snapshot: InboxSnapshot,
  timeoutMs: number = 90_000,
  pollIntervalMs: number = 3_000,
): Promise<{ rowId: string }> {
  const localPart = email.split("@")[0];
  const inboxUrl = `${MAILINATOR_ORIGIN}/v4/public/inboxes.jsp?to=${localPart}`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await page.goto(inboxUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });

    try {
      await page.waitForSelector("tr[id^='row_']", { timeout: 8_000 });
    } catch {
      await page.waitForTimeout(pollIntervalMs);
      continue;
    }

    const rows = page.locator("tr[id^='row_']");
    const count = await rows.count();

    // If we have more rows than snapshot, we found a new email
    if (count > snapshot.rowCount) {
      // First row is the newest email
      const firstRow = rows.first();
      const rowId = await firstRow.getAttribute("id");
      if (rowId) {
        return { rowId };
      }
    }

    await page.waitForTimeout(pollIntervalMs);
  }

  throw new Error(
    `Email baru tidak ditemukan di ${email} setelah ${timeoutMs}ms. ` +
    `Inbox memiliki ${await rows(page, email).catch(() => "?")} baris (snapshot: ${snapshot.rowCount}). ` +
    `Kemungkinan: (a) email tidak terkirim, atau (b) selector Mailinator berubah.`,
  );
}

async function rows(page: Page, email: string): Promise<number> {
  const localPart = email.split("@")[0];
  const inboxUrl = `${MAILINATOR_ORIGIN}/v4/public/inboxes.jsp?to=${localPart}`;
  await page.goto(inboxUrl, { waitUntil: "domcontentloaded", timeout: 10_000 });
  try {
    await page.waitForSelector("tr[id^='row_']", { timeout: 5_000 });
  } catch {
    // empty
  }
  return page.locator("tr[id^='row_']").count();
}

export async function openEmailAndExtractLink(
  page: Page,
  rowId: string,
  stagingOrigin: string,
): Promise<string> {
  // Click the row to open the email
  const row = page.locator(`tr[id="${rowId}"]`);
  await row.click();

  // Wait for email view to load
  await page.waitForSelector("#email_pane", { state: "visible", timeout: 10_000 });

  // The HTML email body is in an iframe with name="html_msg_body"
  const iframe = page.frameLocator("iframe[name='html_msg_body']");
  const linkSelector = `a[href*="${stagingOrigin}/login/verify"]`;

  try {
    const link = iframe.locator(linkSelector).first();
    await link.waitFor({ state: "attached", timeout: 15_000 });
    const href = await link.getAttribute("href");
    if (!href) throw new Error("Magic link href null");
    return href;
  } catch {
    // Fallback: try to find the link in the page itself (some emails embed directly)
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
