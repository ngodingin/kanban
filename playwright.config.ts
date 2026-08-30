import { defineConfig } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "**/staging/**",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm tsx --env-file-if-exists=.env scripts/playwright-server.ts",
    url: `http://localhost:${port}/api/v1/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "e2e-test-secret-at-least-32-characters-long!",
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? `http://localhost:${port}`,
      MAIL_FROM: process.env.MAIL_FROM ?? "noreply@kanban.ngodingin.xyz",
    },
  },
});
