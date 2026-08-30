import { defineConfig } from "@playwright/test";

const STAGING_ORIGIN = "https://kanban-ngodingin.vercel.app";

export default defineConfig({
  testDir: "./e2e/staging",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  timeout: 120_000,
  use: {
    baseURL: STAGING_ORIGIN,
    trace: "on-first-retry",
    extraHTTPHeaders: {
      "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "",
    },
  },
});
