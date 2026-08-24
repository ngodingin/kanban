import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // Dev saja: API Hono lokal (apps/api, default PORT 3100) di-origin yang
    // sama agar cookie/session dan base URL client konsisten dengan produksi.
    proxy: {
      "/api": "http://localhost:3100",
    },
  },
});
