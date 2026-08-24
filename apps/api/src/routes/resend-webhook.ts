/**
 * TASK-6.6.3 — Resend webhook receiver (F.4, amandemen 2.5.2).
 *
 * Non-pipeline (bukan user-facing API): verifikasi signature Resend
 * (svix-style) memakai RESEND_WEBHOOK_SECRET — BUKAN CRON_SECRET.
 * Event ditangani: email.bounced / email.complained (WAJIB),
 * email.delivered / email.delivery_delayed (opsional). Semua event
 * dicatat ke structured logging (6.6.1), BUKAN Activity domain.
 *
 * Open/click tracking Resend MUST NOT diaktifkan (SOT 2.5.2/F.4).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { emitStructuredLog } from "../request-logging.ts";

const MAX_TIMESTAMP_AGE_SECONDS = 5 * 60;

function verifyResendSignature(secret: string, id: string, timestamp: string, payload: string, signaturesHeader: string): boolean {
  if (!id || !timestamp || !signaturesHeader) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > MAX_TIMESTAMP_AGE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${id}.${timestamp}.${payload}`).digest("base64");
  for (const part of signaturesHeader.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const a = Buffer.from(sig, "base64");
    const b = Buffer.from(expected, "base64");
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

export interface ResendWebhookRoutesDeps {
  resendWebhookSecret: string | undefined;
}

export function createResendWebhookRouter(getDeps: () => ResendWebhookRoutesDeps): Hono {
  const router = new Hono();

  router.post("/internal/resend-webhook", async (c) => {
    const deps = getDeps();
    const secret = deps.resendWebhookSecret ?? "";
    const id = c.req.header("svix-id") ?? "";
    const timestamp = c.req.header("svix-timestamp") ?? "";
    const signatures = c.req.header("svix-signature") ?? "";
    const payload = await c.req.text();

    if (
      secret.length === 0 ||
      !verifyResendSignature(secret, id, timestamp, payload, signatures)
    ) {
      return c.json({ error: { code: "PERMISSION_DENIED", message: "Signature tidak valid." } }, 403);
    }

    let event: { type?: string; data?: { email?: string; message_id?: string } };
    try {
      event = JSON.parse(payload);
    } catch {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Payload bukan JSON valid." } }, 400);
    }

    const type = typeof event.type === "string" ? event.type : "(unknown)";
    const handled = ["email.bounced", "email.complained", "email.delivered", "email.delivery_delayed"];
    if (!handled.includes(type)) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: `Event type '${type}' tidak didukung.` } }, 400);
    }

    // F.4 — log teknis terpisah dari Activity domain, SATU mekanisme
    // structured logging (6.6.1). Alamat email TIDAK dicetak penuh;
    // message_id Resend dicatat untuk traceability.
    emitStructuredLog({
      request_id: id,
      action: `resend-webhook ${type}`,
      outcome: "logged",
      duration_ms: 0,
      message_id: event.data?.message_id ?? null,
    });

    return c.json({ ok: true }, 200);
  });

  return router;
}
