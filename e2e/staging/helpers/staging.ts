import { test, expect } from "@playwright/test";
import { CANONICAL_ORIGIN, assertStagingOrigin, testNamespace } from "./staging-core.ts";

export { CANONICAL_ORIGIN, assertStagingOrigin, testNamespace };

export const STAGING_ORIGIN = CANONICAL_ORIGIN;

type CleanupAction = { label: string; fn: () => Promise<void>; assertSuccess: boolean };
const cleanupActions: CleanupAction[] = [];

export function registerCleanup(label: string, fn: () => Promise<void>, assertSuccess: boolean = true): void {
  cleanupActions.push({ label, fn, assertSuccess });
}

export async function runCleanup(): Promise<void> {
  const errors: Error[] = [];
  while (cleanupActions.length > 0) {
    const action = cleanupActions.pop()!;
    try {
      await action.fn();
    } catch (err) {
      if (action.assertSuccess) {
        errors.push(new Error(`Cleanup gagal [${action.label}]: ${err instanceof Error ? err.message : String(err)}`));
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(`Cleanup errors:\n${errors.map((e) => e.message).join("\n")}`);
  }
}

test.afterAll(async () => {
  await runCleanup();
});

test.beforeAll(async () => {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  expect(bypass, "VERCEL_AUTOMATION_BYPASS_SECRET harus tersedia di environment").toBeTruthy();
  const resendKey = process.env.E2E_RESEND_API_KEY;
  expect(resendKey, "E2E_RESEND_API_KEY harus tersedia di environment").toBeTruthy();
  const resendDomain = process.env.E2E_RESEND_RECEIVING_DOMAIN;
  expect(resendDomain, "E2E_RESEND_RECEIVING_DOMAIN harus tersedia di environment").toBeTruthy();
});
