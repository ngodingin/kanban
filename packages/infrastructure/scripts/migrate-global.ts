import { applyGlobalMigrations } from "../src/database/migrate.ts";
import { seedPermissionCatalog } from "../src/database/permission-catalog.ts";
import { createGlobalClient } from "../src/database/factory.ts";
export async function migrateGlobal(): Promise<number> {
    const client = createGlobalClient();
    try {
        await applyGlobalMigrations(client);
        const { inserted } = await seedPermissionCatalog(client);
        console.log(`[migrate:global] permission catalog: ${inserted} key baru di-seed`);
        return 1;
    }
    finally {
        await client.close();
    }
}
const migrated = await migrateGlobal();
console.log(`[migrate:global] ${migrated} database Global termigrasi`);
