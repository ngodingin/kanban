import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  "negatif: staging + BETTER_AUTH_URL bukan kanban-ngodingin.vercel.app -> throw",
);

const previewOverride = loadAppConfig({
  ...BASE,
  BETTER_AUTH_URL: "https://kanban-ngodingin-xyz.vercel.app",
  VERCEL_ENV: "preview",
  AUTH_ALLOW_NON_CANONICAL: "1",
} as NodeJS.ProcessEnv);
if (previewOverride.env !== "staging" || previewOverride.BETTER_AUTH_URL !== "https://kanban-ngodingin-xyz.vercel.app") {
  throw new Error("preview override salah");
}
console.log("PASS positif: preview (VERCEL_ENV=preview) + AUTH_ALLOW_NON_CANONICAL=1 -> origin deployment preview dipakai");

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
  BETTER_AUTH_URL: "https://kanban-ngodingin.vercel.app",
  VERCEL_ENV: "preview",
} as NodeJS.ProcessEnv);
if (stag.env !== "staging" || stag.canonicalOrigin !== "https://kanban-ngodingin.vercel.app") throw new Error("staging config salah");
console.log("PASS positif: staging (VERCEL_ENV=preview) -> origin kanban-ngodingin.vercel.app");

const dev = loadAppConfig({ ...BASE } as NodeJS.ProcessEnv);
if (dev.env !== "development" || dev.MAIL_FROM !== "noreply@kanban.ngodingin.xyz") throw new Error("dev config salah");
console.log("PASS positif: development + MAIL_FROM default sender");

const repoRoot = resolve(import.meta.dirname, "../../..");
const templates = [
  ["development", "http://localhost:5173"],
  ["staging", "https://kanban-ngodingin.vercel.app"],
  ["production", "https://kanban.ngodingin.xyz"],
] as const;
const origins: string[] = [];
for (const [envName, expectedOrigin] of templates) {
  const content = readFileSync(resolve(repoRoot, `.env.${envName}.example`), "utf8");
  if (!content.includes(`BETTER_AUTH_URL=${expectedOrigin}`)) {
    throw new Error(`.env.${envName}.example tidak memuat canonical origin ${expectedOrigin}`);
  }
  if (!content.includes("AUTH_RESEND_KEY=")) {
    throw new Error(`.env.${envName}.example tidak memuat AUTH_RESEND_KEY (secret Resend terpisah per env, D.7)`);
  }
  if (content.includes("<minimal-32-karakter-acak-dev>") && expectedOrigin !== "http://localhost:5173") {
    throw new Error(`.env.${envName}.example memakai secret dev (bocor antar env)`);
  }
  origins.push(expectedOrigin);
}
if (new Set(origins).size !== origins.length) throw new Error("canonical origin antar env tidak unik");
console.log("PASS positif: template env dev/staging/prod terpisah — origin kanonik unik + secret Resend per env (D.7)");

console.log("smoke config selesai");