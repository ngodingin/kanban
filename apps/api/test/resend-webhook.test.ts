import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { Hono } from "hono";
import { createResendWebhookRouter } from "../src/routes/resend-webhook.ts";

const SECRET = "whsec_test_rahasia";
const APP = new Hono().route("/", createResendWebhookRouter(() => ({ resendWebhookSecret: SECRET })));

function signedHeaders(payload: string, secret = SECRET, timestamp?: string): Record<string, string> {
  const ts = timestamp ?? String(Math.floor(Date.now() / 1000));
  const id = `msg_${ts}`;
  const sig = createHmac("sha256", secret).update(`${id}.${ts}.${payload}`).digest("base64");
  return {
    "svix-id": id,
    "svix-timestamp": ts,
    "svix-signature": `v1,${sig}`,
    "content-type": "application/json",
  };
}

const bouncedPayload = JSON.stringify({
  type: "email.bounced",
  data: { email: "user@t.local", message_id: "mid-1" },
});

describe("POST /internal/resend-webhook — goal 6.6.3", () => {
  it("[F.4] signature valid + email.bounced → 200 dan event terlog ke stdout", async () => {
    let logged = "";
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: unknown) => {
      const t = typeof chunk === "string" ? chunk : String(chunk);
      if (t.includes("resend-webhook")) logged = t;
      return true;
    }) as typeof process.stdout.write;

    const res = await APP.request("/internal/resend-webhook", {
      method: "POST",
      headers: signedHeaders(bouncedPayload),
      body: bouncedPayload,
    });
    process.stdout.write = orig;
    expect(res.status).toBe(200);
    expect(logged).toContain("email.bounced");
    expect(logged).toContain('"message_id":"mid-1"');
  });

  it("[negatif] tanpa header / signature salah / timestamp kadaluarsa → 403", async () => {
    const noHeader = await APP.request("/internal/resend-webhook", { method: "POST", body: bouncedPayload });
    expect(noHeader.status).toBe(403);

    const badSig = await APP.request("/internal/resend-webhook", {
      method: "POST",
      headers: signedHeaders(bouncedPayload, "wrong-secret"),
      body: bouncedPayload,
    });
    expect(badSig.status).toBe(403);

    const oldTs = String(Math.floor(Date.now() / 1000) - 600);
    const stale = await APP.request("/internal/resend-webhook", {
      method: "POST",
      headers: signedHeaders(bouncedPayload, SECRET, oldTs),
      body: bouncedPayload,
    });
    expect(stale.status).toBe(403);
  });

  it("[opsional] email.complained & delivered → 200; type tak dikenal → 400", async () => {
    for (const type of ["email.complained", "email.delivered", "email.delivery_delayed"]) {
      const payload = JSON.stringify({ type, data: {} });
      const res = await APP.request("/internal/resend-webhook", {
        method: "POST",
        headers: signedHeaders(payload),
        body: payload,
      });
      expect(res.status, type).toBe(200);
    }
    const unknown = JSON.stringify({ type: "email.opened" });
    const res = await APP.request("/internal/resend-webhook", {
      method: "POST",
      headers: signedHeaders(unknown),
      body: unknown,
    });
    expect(res.status).toBe(400);
  });
});
