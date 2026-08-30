import { test, expect } from "@playwright/test";

const ALLOWED_ORIGINS = ["https://kanban-ngodingin.vercel.app"] as const;

export const STAGING_ORIGIN = ALLOWED_ORIGINS[0];

export function assertStagingOrigin(url: string): void {
  const parsed = new URL(url);
  if (!ALLOWED_ORIGINS.includes(parsed.origin as (typeof ALLOWED_ORIGINS)[number])) {
    throw new Error(`Origin tidak diizinkan: ${parsed.origin}. Hanya boleh: ${ALLOWED_ORIGINS.join(", ")}`);
  }
}

let testRunId: string | null = null;

export function getTestRunId(): string {
  if (!testRunId) {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 6);
    testRunId = `ts-${ts}-${rand}`;
  }
  return testRunId;
}

export function testNamespace(): string {
  return `e2e-${getTestRunId()}`;
}

type CleanupAction = { label: string; fn: () => Promise<void> };
const cleanupActions: CleanupAction[] = [];

export function registerCleanup(label: string, fn: () => Promise<void>): void {
  cleanupActions.push({ label, fn });
}

export async function runCleanup(): Promise<void> {
  const errors: Error[] = [];
  while (cleanupActions.length > 0) {
    const action = cleanupActions.pop()!;
    try {
      await action.fn();
    } catch (err) {
      errors.push(new Error(`Cleanup gagal [${action.label}]: ${err instanceof Error ? err.message : String(err)}`));
    }
  }
  if (errors.length > 0) {
    throw new Error(`Cleanup errors:\n${errors.map((e) => e.message).join("\n")}`);
  }
}

export function stagingTest(name: string, fn: (args: { request: import("@playwright/test").APIRequestContext }) => Promise<void>) {
  test(name, async ({ request }) => {
    assertStagingOrigin(STAGING_ORIGIN);
    await fn({ request });
  });
}

test.afterAll(async () => {
  await runCleanup();
});

test.beforeAll(async () => {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  expect(bypass, "VERCEL_AUTOMATION_BYPASS_SECRET harus tersedia di environment").toBeTruthy();
});
