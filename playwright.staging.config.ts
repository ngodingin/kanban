import { defineConfig } from "@playwright/test";
import { CANONICAL_ORIGIN } from "./e2e/staging/helpers/staging-core.ts";

export default defineConfig({
  testDir: "./e2e/staging",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  timeout: 120_000,
  use: {
    baseURL: CANONICAL_ORIGIN,
    trace: "on-first-retry",
    extraHTTPHeaders: {
      "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "",
    },
  },
});
