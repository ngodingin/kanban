export const CANONICAL_ORIGIN = "https://kanban-ngodingin.vercel.app" as const;

const ALLOWED_ORIGINS = [CANONICAL_ORIGIN] as const;

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
