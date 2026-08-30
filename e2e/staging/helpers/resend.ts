const RESEND_API_BASE = "https://api.resend.com";

function getApiKey(): string {
  const key = process.env.E2E_RESEND_API_KEY;
  if (!key) throw new Error("E2E_RESEND_API_KEY harus tersedia di environment");
  return key;
}

function getDomain(): string {
  const domain = process.env.E2E_RESEND_RECEIVING_DOMAIN;
  if (!domain) throw new Error("E2E_RESEND_RECEIVING_DOMAIN harus tersedia di environment");
  return domain;
}

export function buildRecipientAddress(testNamespace: string): string {
  return `e2e-${testNamespace}@${getDomain()}`;
}

export interface ResendEmail {
  id: string;
  to: string[];
  from: string;
  subject: string;
  created_at: string;
}

interface ResendListResponse {
  object: string;
  has_more: boolean;
  data: ResendEmail[];
}

interface ResendGetResponse {
  id: string;
  to: string[];
  from: string;
  subject: string;
  html: string | null;
  text: string | null;
}

async function listReceivedEmails(since: Date): Promise<ResendEmail[]> {
  const apiKey = getApiKey();
  const url = `${RESEND_API_BASE}/emails/receiving?limit=50`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`Resend list failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as ResendListResponse;
  const sinceTime = since.getTime();

  return (body.data ?? []).filter((email) => {
    const emailTime = new Date(email.created_at).getTime();
    return emailTime >= sinceTime;
  });
}

async function getReceivedEmail(emailId: string): Promise<ResendGetResponse> {
  const apiKey = getApiKey();
  const url = `${RESEND_API_BASE}/emails/receiving/${emailId}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`Resend get failed: ${res.status} ${await res.text()}`);
  }

  return (await res.json()) as ResendGetResponse;
}

export function filterEmailsByRecipient(
  emails: ResendEmail[],
  recipient: string,
): ResendEmail[] {
  return emails.filter((e) => e.to.includes(recipient));
}

const EXPECTED_SENDER = "noreply@kanban.ngodingin.xyz";

export function validateMagicLinkEmail(
  email: ResendEmail,
  expectedRecipient: string,
): void {
  if (!email.to.includes(expectedRecipient)) {
    throw new Error(
      `Email penerima salah: diharapkan ${expectedRecipient}, diperoleh ${email.to.join(", ")}`,
    );
  }
  // Extract email from "Name <email>" or plain "email"
  const senderMatch = email.from.match(/<([^>]+)>/) ?? [null, email.from];
  const senderEmail = (senderMatch[1] ?? "").trim().toLowerCase();
  if (senderEmail !== EXPECTED_SENDER) {
    throw new Error(
      `Email sender tidak cocok: "${email.from}" — diharapkan ${EXPECTED_SENDER}`,
    );
  }
  if (!email.subject.toLowerCase().includes("magic") &&
      !email.subject.toLowerCase().includes("tautan") &&
      !email.subject.toLowerCase().includes("link") &&
      !email.subject.toLowerCase().includes("login") &&
      !email.subject.toLowerCase().includes("kanban")) {
    throw new Error(
      `Subject email tidak cocok: "${email.subject}" — diharapkan magic link email`,
    );
  }
}

export function extractMagicLinkFromHtml(html: string, stagingOrigin: string): string | null {
  const patterns = [
    new RegExp(`href="(${escapeRegExp(stagingOrigin)}/login/verify\\?[^"]+)"`, "i"),
    new RegExp(`href='(${escapeRegExp(stagingOrigin)}/login/verify\\?[^']+)'`, "i"),
    new RegExp(`(${escapeRegExp(stagingOrigin)}/login/verify\\?[\\w=&%-]+)`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }

  return null;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function waitForResendEmail(
  recipient: string,
  receivedAfter: Date,
  stagingOrigin: string,
  timeoutMs: number = 90_000,
  pollIntervalMs: number = 5_000,
): Promise<{ email: ResendEmail; link: string }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const allEmails = await listReceivedEmails(receivedAfter);
    const matched = filterEmailsByRecipient(allEmails, recipient);

    if (matched.length > 0) {
      const latest = matched[0];
      validateMagicLinkEmail(latest, recipient);

      const full = await getReceivedEmail(latest.id);
      const html = full.html ?? full.text ?? "";
      const link = extractMagicLinkFromHtml(html, stagingOrigin);

      if (!link) {
        throw new Error(
          `Magic link tidak ditemukan di email HTML. ` +
          `Subject: "${latest.subject}". ` +
          `HTML snippet: ${html.substring(0, 200)}`,
        );
      }

      return { email: latest, link };
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error(
    `Email Resend untuk ${recipient} tidak ditemukan setelah ${timeoutMs}ms ` +
    `(sejak ${receivedAfter.toISOString()}).`,
  );
}

export function extractTokenFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("token");
  } catch {
    return null;
  }
}
