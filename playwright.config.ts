import { defineConfig } from "@playwright/test";
const port = 3100;
export default defineConfig({
    testDir: "./e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: "list",
    use: {
        baseURL: `http://localhost:${port}`,
        trace: "on-first-retry",
    },
    webServer: {
        command: "pnpm --filter @kanban/api build && pnpm --filter @kanban/api start",
        url: `http://localhost:${port}/api/v1/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
    },
});
