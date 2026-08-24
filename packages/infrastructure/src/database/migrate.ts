import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { Client } from "@libsql/client";
import { resolve } from "node:path";
function migrationsRoot(): string {
    const metaDirname = (import.meta as {
        dirname?: string;
    }).dirname;
    if (metaDirname)
        return resolve(metaDirname, "../..", "drizzle");
    return resolve(__dirname, "drizzle");
}
const migrationsDir = resolve(migrationsRoot(), "migrations");
const projectMigrationsDir = resolve(migrationsRoot(), "migrations-project");
export async function applyGlobalMigrations(client: Client): Promise<void> {
    await migrate(drizzle(client), { migrationsFolder: migrationsDir });
}
export async function applyProjectMigrations(client: Client): Promise<void> {
    await migrate(drizzle(client), { migrationsFolder: projectMigrationsDir });
}
