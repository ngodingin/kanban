import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/database/global-schema.ts",
  out: "./drizzle/migrations",
});