import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { Client } from "@libsql/client";
import { resolve } from "node:path";

const migrationsDir = resolve(import.meta.dirname, "../../drizzle/migrations");
const projectMigrationsDir = resolve(import.meta.dirname, "../../drizzle/migrations-project");

export async function applyGlobalMigrations(client: Client): Promise<void> {
  await migrate(drizzle(client), { migrationsFolder: migrationsDir });
}

export async function applyProjectMigrations(client: Client): Promise<void> {
  await migrate(drizzle(client), { migrationsFolder: projectMigrationsDir });
}