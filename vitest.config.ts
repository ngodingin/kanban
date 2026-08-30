import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Alias sama dengan apps/web/vite.config.ts agar test dapat meng-import
    // komponen web yang memakai "@/...".
    alias: {
      "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
    },
  },
  test: {
    include: [
      "packages/*/test/**/*.test.ts",
      "apps/*/test/**/*.test.ts",
      "apps/*/test/**/*.test.tsx",
      "e2e/**/*.test.ts",
    ],
    environment: "node",
  },
});