import { BetterSQLite3Adapter } from 'drizzle-kit/better-sqlite3'
import { join } from 'path'

// NOTE: This is a scaffold config. Install `drizzle-kit` and adjust adapter/urls per environment.
export default {
  out: './drizzle',
  schema: './src/db/schema.ts',
  driver: new BetterSQLite3Adapter({ database: join(process.cwd(), 'dev.db') })
}
