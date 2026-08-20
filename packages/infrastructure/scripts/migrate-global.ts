import { applyGlobalMigrations } from "../src/database/migrate.ts";
import { createGlobalClient } from "../src/database/factory.ts";

export async function migrateGlobal(): Promise<number> {
  const client = createGlobalClient();
  try {
    await applyGlobalMigrations(client);
    return 1;
  } finally {
    await client.close();
  }
}

const migrated = await migrateGlobal();
console.log(`[migrate:global] ${migrated} database Global termigrasi`);
