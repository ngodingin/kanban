import { createClient, type Client } from "@libsql/client";
import { z } from "zod";

const GlobalDbEnvSchema = z.object({
  GLOBAL_DB_URL: z.string().url(),
  GLOBAL_DB_TOKEN: z.string().default(""),
});

export type GlobalDbEnv = z.infer<typeof GlobalDbEnvSchema>;

export function parseGlobalDbEnv(env: NodeJS.ProcessEnv = process.env): GlobalDbEnv {
  const parsed = GlobalDbEnvSchema.safeParse(env);
  if (!parsed.success) {
    const missing = Object.keys(GlobalDbEnvSchema.shape).filter((k) => env[k] === undefined);
    throw new Error(`Global DB env tidak lengkap (GLOBAL_DB_URL, GLOBAL_DB_TOKEN; kurang: ${missing.join(", ") || "tidak valid"})`);
  }
  return parsed.data;
}

export function createGlobalClient(env: NodeJS.ProcessEnv = process.env): Client {
  const { GLOBAL_DB_URL, GLOBAL_DB_TOKEN } = parseGlobalDbEnv(env);
  return createClient({ url: GLOBAL_DB_URL, authToken: GLOBAL_DB_TOKEN });
}
export function createProjectClient(opts: { url: string; authToken: string }): Client {
  if (!opts.url.startsWith("libsql://")) {
    throw new Error("Project DB url wajib memakai skema libsql:// (remote Turso)");
  }
  if (opts.authToken.length === 0) {
    throw new Error("Project DB authToken wajib diisi (JWT per-DB)");
  }
  return createClient({ url: opts.url, authToken: opts.authToken });
}