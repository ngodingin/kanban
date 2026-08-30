import { describe, expect, it } from "vitest";
import { validateMagicLinkEmail, type ResendEmail } from "./resend.ts";

// TASK-7.16.1 — QA-CL-90 / QA-CL-89: helper Resend Receiving WAJIB memvalidasi
// sender secara eksak (noreply@kanban.ngodingin.xyz), bukan sekadar "mengandung
// domain". Test positif + negatif sesuai kaidah [AGENTS.md §8] (invariant →
// positif + negatif).

const SENDER = "noreply@kanban.ngodingin.xyz";

function email(overrides: Partial<ResendEmail> = {}): ResendEmail {
  return {
    id: "e1",
    to: ["e2e-harness@ulkiipbi.resend.app"],
    from: `NGodingin Kanban <${SENDER}>`,
    subject: "Your magic link to login",
    created_at: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("TASK-7.16.1 — validateMagicLinkEmail", () => {
  it("menerima email Magic Link dengan sender exact + penerima yang benar", () => {
    const e = email();
    expect(() => validateMagicLinkEmail(e, "e2e-harness@ulkiipbi.resend.app")).not.toThrow();
  });

  it("menerima sender polos (tanpa format 'Name <email>') saat exact cocok", () => {
    const e = email({ from: SENDER });
    expect(() => validateMagicLinkEmail(e, "e2e-harness@ulkiipbi.resend.app")).not.toThrow();
  });

  it("[negatif] menolak sender berbeda pada domain yang sama (bukan exact match)", () => {
    const e = email({ from: `Attacker <no-reply@kanban.ngodingin.xyz>` });
    expect(() => validateMagicLinkEmail(e, "e2e-harness@ulkiipbi.resend.app")).toThrow(/sender tidak cocok/i);
  });

  it("[negatif] menolak sender dari domain lain", () => {
    const e = email({ from: `Phisher <admin@example.com>` });
    expect(() => validateMagicLinkEmail(e, "e2e-harness@ulkiipbi.resend.app")).toThrow(/sender tidak cocok/i);
  });

  it("[negatif] menolak sender yang hanya meng-embed domain di tengah (bukan exact)", () => {
    const e = email({ from: `kanban.ngodingin.xyz <attacker@evil.test>` });
    expect(() => validateMagicLinkEmail(e, "e2e-harness@ulkiipbi.resend.app")).toThrow(/sender tidak cocok/i);
  });

  it("[negatif] menolak penerima yang tidak cocok", () => {
    const e = email();
    expect(() => validateMagicLinkEmail(e, "e2e-other@ulkiipbi.resend.app")).toThrow(/penerima salah/i);
  });
});
