const MAILINATOR_API_BASE = "https://www.mailinator.com/api/v2";

export interface MailinatorMessage {
  id: string;
  from: string;
  subject: string;
  created_at: string;
}

export interface MailinatorEmail {
  data: {
    id: string;
    from: string;
    subject: string;
    html_body: string;
    text_body: string;
  };
}

export async function listInboxMessages(
  request: import("@playwright/test").APIRequestContext,
  email: string,
): Promise<MailinatorMessage[]> {
  const localPart = email.split("@")[0];
  const res = await request.get(`${MAILINATOR_API_BASE}/domains/public/inboxes/${localPart}`);
  if (!res.ok()) {
    throw new Error(`Mailinator inbox fetch gagal: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  return (body as { data?: MailinatorMessage[] }).data ?? [];
}

export async function getMessage(
  request: import("@playwright/test").APIRequestContext,
  email: string,
  messageId: string,
): Promise<MailinatorEmail["data"]> {
  const localPart = email.split("@")[0];
  const res = await request.get(`${MAILINATOR_API_BASE}/domains/public/inboxes/${localPart}/messages/${messageId}`);
  if (!res.ok()) {
    throw new Error(`Mailinator message fetch gagal: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  const data = (body as MailinatorEmail).data;
  if (!data) throw new Error("Mailinator response tidak memiliki field data");
  return data;
}

export function extractMagicLinkUrl(htmlBody: string, stagingOrigin: string): string | null {
  const originEscaped = stagingOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`href="(${originEscaped}/login/verify\\?[^"]+)"`, "i");
  const match = htmlBody.match(regex);
  return match?.[1] ?? null;
}

export function extractTokenFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("token");
  } catch {
    return null;
  }
}

export async function waitForMagicLinkEmail(
  request: import("@playwright/test").APIRequestContext,
  email: string,
  stagingOrigin: string,
  timeoutMs: number = 60_000,
  pollIntervalMs: number = 3_000,
): Promise<{ token: string; emailUrl: string }> {
  const deadline = Date.now() + timeoutMs;
  let lastCount = 0;

  while (Date.now() < deadline) {
    const messages = await listInboxMessages(request, email);
    if (messages.length > lastCount) {
      const newest = messages[0];
      const full = await getMessage(request, email, newest.id);
      const linkUrl = extractMagicLinkUrl(full.html_body, stagingOrigin);
      if (linkUrl) {
        const token = extractTokenFromUrl(linkUrl);
        if (token) {
          return { token, emailUrl: linkUrl };
        }
      }
      lastCount = messages.length;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error(`Magic link email tidak ditemukan di ${email} setelah ${timeoutMs}ms`);
}
