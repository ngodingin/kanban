import dotenv from 'dotenv'
import { z } from 'zod'

// Load .env into process.env but do not override existing vars
dotenv.config({ override: false })

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform((s) => Number(s)).refine((n) => Number.isInteger(n) && n > 0, { message: 'PORT must be a positive integer' }),
  DATABASE_URL: z.string().url(),
  TURSO_API_KEY: z.string().optional(),
  NEXT_PUBLIC_API_BASE: z.string().url()
})

export type Env = z.infer<typeof EnvSchema>

// parse given env object (useful for tests)
export function parseEnv(env: Record<string, string | undefined>) {
  const result = EnvSchema.safeParse({
    NODE_ENV: env.NODE_ENV ?? process.env.NODE_ENV,
    PORT: env.PORT ?? process.env.PORT,
    DATABASE_URL: env.DATABASE_URL ?? process.env.DATABASE_URL,
    TURSO_API_KEY: env.TURSO_API_KEY ?? process.env.TURSO_API_KEY,
    NEXT_PUBLIC_API_BASE: env.NEXT_PUBLIC_API_BASE ?? process.env.NEXT_PUBLIC_API_BASE
  })
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid environment variables: ${issues}`)
  }
  return result.data
}

// loader to parse current process.env at runtime
export function loadConfig() {
  return parseEnv({})
}

export default loadConfig
