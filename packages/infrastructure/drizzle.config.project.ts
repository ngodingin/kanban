import { defineConfig } from "drizzle-kit";
export default defineConfig({
    dialect: "sqlite",
    schema: "./src/database/project-schema.ts",
    out: "./drizzle/migrations-project",
});
