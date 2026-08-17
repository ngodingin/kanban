Drizzle migrations scaffold

This folder contains guidance and templates for database migrations.

Usage (once `drizzle-kit` is installed):

1. Generate SQL/migration files from schema:
   - `npx drizzle-kit generate --out migrations --schema src/db/schema.ts`

2. Apply migrations depending on your environment/adapter:
   - For SQLite example in `drizzle.config.ts`: use the configured adapter/commands.

Notes:
- The repo currently includes `drizzle-orm` schema scaffolds but does not install `drizzle-kit` (tooling). Decide on drizzle-kit version and adapter (SQLite/Turso/Postgres) before running generation.
- Mark `[NEEDS-DECISION]` in PHASE-0 if you want to choose adapter/provider.
