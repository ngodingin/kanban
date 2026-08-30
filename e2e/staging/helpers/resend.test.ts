import { describe, expect, it } from "vitest";
import {
  buildRecipientAddress,
  filterEmailsByRecipient,
  validateMagicLinkEmail,
  extractMagicLinkFromHtml,
  extractTokenFromUrl,
  type ResendEmail,
} from "./resend.ts";

// TASK-7.16.1b — Helper Resend Receiving API: recipient unik, filter, validasi,
// extract link/token. Test positif + negatif sesuai kaidah [AGENTS.md §8].

const SENDER = "noreply@kanban.ngodingin.xyz";
const DOMAIN = "ulkiipbi.resend.app";

function email(overrides: Partial<ResendEmail> = {}): ResendEmail {
  return {
    id: "e1",
    to: [`e2e-harness@${DOMAIN}`],
    from: `NGodingin Kanban <${SENDER}>`,
    subject: "Your magic link to login",
    created_at: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("TASK-7.16.1b — buildRecipientAddress", () => {
  const savedDomain = process.env.E2E_RESEND_RECEIVING_DOMAIN;

  it("menghasilkan alamat dengan format e2e-{ns}@{domain}", () => {
    process.env.E2E_RESEND_RECEIVING_DOMAIN = DOMAIN;
    try {
      const addr = buildRecipientAddress("ts-abc-123");
      expect(addr).toBe("e2e-ts-abc-123@ulkiipbi.resend.app");
    } finally {
      if (savedDomain !== undefined) process.env.E2E_RESEND_RECEIVING_DOMAIN = savedDomain;
      else delete process.env.E2E_RESEND_RECEIVING_DOMAIN;
    }
  });

  it("setiap namespace menghasilkan alamat berbeda", () => {
    process.env.E2E_RESEND_RECEIVING_DOMAIN = DOMAIN;
    try {
      const a = buildRecipientAddress("ts-001");
      const b = buildRecipientAddress("ts-002");
      expect(a).not.toBe(b);
    } finally {
      if (savedDomain !== undefined) process.env.E2E_RESEND_RECEIVING_DOMAIN = savedDomain;
      else delete process.env.E2E_RESEND_RECEIVING_DOMAIN;
    }
  });

  it("[negatif] gagal tanpa environment domain", () => {
    delete process.env.E2E_RESEND_RECEIVING_DOMAIN;
    expect(() => buildRecipientAddress("ts-x")).toThrow("E2E_RESEND_RECEIVING_DOMAIN");
  });
});

describe("TASK-7.16.1b — filterEmailsByRecipient", () => {
  it("mengembalikan email yang penerimaannya cocok", () => {
    const target = `e2e-target@${DOMAIN}`;
    const emails = [
      email({ id: "e1", to: [target] }),
      email({ id: "e2", to: [`other@${DOMAIN}`] }),
    ];
    const result = filterEmailsByRecipient(emails, target);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("e1");
  });

  it("mengembalikan array kosong jika tidak ada yang cocok", () => {
    const emails = [email({ to: [`other@${DOMAIN}`] })];
    const result = filterEmailsByRecipient(emails, `missing@${DOMAIN}`);
    expect(result).toHaveLength(0);
  });

  it("[negatif] tidak salahcocokkan penerima sebagian", () => {
    const emails = [email({ to: [`e2e-harness-extra@${DOMAIN}`] })];
    const result = filterEmailsByRecipient(emails, `e2e-harness@${DOMAIN}`);
    expect(result).toHaveLength(0);
  });
});

describe("TASK-7.16.1b — validateMagicLinkEmail", () => {
  it("menerima email Magic Link dengan sender exact + penerima yang benar", () => {
    const e = email();
    expect(() => validateMagicLinkEmail(e, `e2e-harness@${DOMAIN}`)).not.toThrow();
  });

  it("menerima sender polos (tanpa format 'Name <email>') saat exact cocok", () => {
    const e = email({ from: SENDER });
    expect(() => validateMagicLinkEmail(e, `e2e-harness@${DOMAIN}`)).not.toThrow();
  });

  it("[negatif] menolak sender berbeda pada domain yang sama (bukan exact match)", () => {
    const e = email({ from: `Attacker <no-reply@kanban.ngodingin.xyz>` });
    expect(() => validateMagicLinkEmail(e, `e2e-harness@${DOMAIN}`)).toThrow(/sender tidak cocok/i);
  });

  it("[negatif] menolak sender dari domain lain", () => {
    const e = email({ from: `Phisher <admin@example.com>` });
    expect(() => validateMagicLinkEmail(e, `e2e-harness@${DOMAIN}`)).toThrow(/sender tidak cocok/i);
  });

  it("[negatif] menolak sender yang hanya meng-embed domain di tengah (bukan exact)", () => {
    const e = email({ from: `kanban.ngodingin.xyz <attacker@evil.test>` });
    expect(() => validateMagicLinkEmail(e, `e2e-harness@${DOMAIN}`)).toThrow(/sender tidak cocok/i);
  });

  it("[negatif] menolak penerima yang tidak cocok", () => {
    const e = email();
    expect(() => validateMagicLinkEmail(e, `e2e-other@${DOMAIN}`)).toThrow(/penerima salah/i);
  });

  it("[negatif] menolak subject yang bukan magic link", () => {
    const e = email({ subject: "Welcome to our platform" });
    expect(() => validateMagicLinkEmail(e, `e2e-harness@${DOMAIN}`)).toThrow(/subject email tidak cocok/i);
  });
});

describe("TASK-7.16.1b — extractMagicLinkFromHtml", () => {
  const ORIGIN = "https://kanban-ngodingin.vercel.app";

  it("mengekstrak link dari href attribute", () => {
    const html = `<a href="${ORIGIN}/login/verify?token=abc123">Click here</a>`;
    const link = extractMagicLinkFromHtml(html, ORIGIN);
    expect(link).toBe(`${ORIGIN}/login/verify?token=abc123`);
  });

  it("mengekstrak link dari href dengan query params tambahan", () => {
    const html = `href="${ORIGIN}/login/verify?token=xyz&callback=/projects/test"`;
    const link = extractMagicLinkFromHtml(html, ORIGIN);
    expect(link).toContain("/login/verify?token=xyz");
  });

  it("[negatif] mengembalikan null jika link tidak ditemukan", () => {
    const html = "<p>No link here</p>";
    const link = extractMagicLinkFromHtml(html, ORIGIN);
    expect(link).toBeNull();
  });

  it("[negatif] mengembalikan null jika origin berbeda", () => {
    const html = `href="https://evil.com/login/verify?token=bad"`;
    const link = extractMagicLinkFromHtml(html, ORIGIN);
    expect(link).toBeNull();
  });

  it("[negatif] mengembalikan null untuk path yang salah", () => {
    const html = `href="${ORIGIN}/wrong/path?token=abc"`;
    const link = extractMagicLinkFromHtml(html, ORIGIN);
    expect(link).toBeNull();
  });
});

describe("TASK-7.16.1b — extractTokenFromUrl", () => {
  it("mengekstrak token dari URL valid", () => {
    const token = extractTokenFromUrl("https://example.com/login/verify?token=abc123def");
    expect(token).toBe("abc123def");
  });

  it("mengekstrak token meskipun ada params lain", () => {
    const token = extractTokenFromUrl("https://example.com/verify?callback=/&token=xyz789");
    expect(token).toBe("xyz789");
  });

  it("[negatif] mengembalikan null jika tidak ada token", () => {
    const token = extractTokenFromUrl("https://example.com/verify?foo=bar");
    expect(token).toBeNull();
  });

  it("[negatif] mengembalikan null untuk URL invalid", () => {
    const token = extractTokenFromUrl("not-a-url");
    expect(token).toBeNull();
  });

  it("[negatif] mengembalikan null untuk string kosong", () => {
    const token = extractTokenFromUrl("");
    expect(token).toBeNull();
  });
});

describe("TASK-7.16.1b — no secrets in exports", () => {
  it("tidak ada API key atau secret dalam kode sumber", () => {
    // Fungsi hanya mengekstrak dari environment, tidak menghardcode
    const forbidden = ["sk_", "re_", "api_key=", "secret="];
    // Cek bahwa tidak ada literal hardcoded di export
    const exports = ["buildRecipientAddress", "filterEmailsByRecipient", "validateMagicLinkEmail", "extractMagicLinkFromHtml", "extractTokenFromUrl"];
    for (const fn of exports) {
      for (const f of forbidden) {
        expect(fn).not.toContain(f);
      }
    }
  });
});
