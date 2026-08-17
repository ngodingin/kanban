import { loadAppConfig } from "../src/config/env.ts";

const BASE = {
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:5173",
  AUTH_RESEND_KEY: "re_test_key",
  NODE_ENV: "development",
} as const;

function expectThrow(env: NodeJS.ProcessEnv, label: string): void {
  try {
    loadAppConfig(env);
    console.error(`FAIL ${label}: seharusnya throw`);
    process.exitCode = 1;
  } catch {
    console.log(`PASS ${label}`);
  }
}

expectThrow({ ...BASE, BETTER_AUTH_SECRET: "pendek" } as NodeJS.ProcessEnv, "negatif: secret < 32 -> throw");
expectThrow({ ...BASE, AUTH_RESEND_KEY: "" } as NodeJS.ProcessEnv, "negatif: resend key kosong -> throw");
expectThrow({ ...BASE, BETTER_AUTH_URL: "https://kanban.ngodingin.xyz" } as NodeJS.ProcessEnv, "negatif: dev + origin produksi -> throw");
expectThrow(
  { ...BASE, BETTER_AUTH_URL: "http://localhost:5173", VERCEL_ENV: "preview" } as NodeJS.ProcessEnv,
  "negatif: staging + BETTER_AUTH_URL bukan stag-kanban -> throw",
);

const prod = loadAppConfig({
  ...BASE,
  NODE_ENV: "production",
  BETTER_AUTH_URL: "https://kanban.ngodingin.xyz",
  VERCEL_ENV: "production",
} as NodeJS.ProcessEnv);
if (prod.env !== "production" || prod.canonicalOrigin !== "https://kanban.ngodingin.xyz") throw new Error("production config salah");
console.log("PASS positif: production (VERCEL_ENV=production) -> origin kanban.ngodingin.xyz");

const stag = loadAppConfig({
  ...BASE,
  BETTER_AUTH_URL: "https://stag-kanban.ngodingin.xyz",
  VERCEL_ENV: "preview",
} as NodeJS.ProcessEnv);
if (stag.env !== "staging" || stag.canonicalOrigin !== "https://stag-kanban.ngodingin.xyz") throw new Error("staging config salah");
console.log("PASS positif: staging (VERCEL_ENV=preview) -> origin stag-kanban.ngodingin.xyz");

const dev = loadAppConfig({ ...BASE } as NodeJS.ProcessEnv);
if (dev.env !== "development" || dev.MAIL_FROM !== "noreply@kanban.ngodingin.xyz") throw new Error("dev config salah");
console.log("PASS positif: development + MAIL_FROM default sender");

console.log("smoke config selesai");