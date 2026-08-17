import { z } from "zod";

export const AppEnv = z.enum(["development", "staging", "production"]);
export type AppEnv = z.infer<typeof AppEnv>;

const CANONICAL_ORIGINS: Record<AppEnv, string | null> = {
  production: "https://kanban.ngodingin.xyz",
  staging: "https://stag-kanban.ngodingin.xyz",
  development: null,
};

const AppConfigSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET minimal 32 karakter"),
  BETTER_AUTH_URL: z.string().url(),
  AUTH_RESEND_KEY: z.string().min(1, "AUTH_RESEND_KEY wajib diisi"),
  MAIL_FROM: z.string().default("noreply@kanban.ngodingin.xyz"),
});

export type AppConfig = z.infer<typeof AppConfigSchema> & {
  env: AppEnv;
  canonicalOrigin: string | null;
};

function detectEnv(env: NodeJS.ProcessEnv): AppEnv {
  if (env.VERCEL_ENV === "production") return "production";
  if (env.VERCEL_ENV === "preview") return "staging";
  return env.NODE_ENV === "production" ? "production" : "development";
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const appEnv = detectEnv(env);
  const parsed = AppConfigSchema.safeParse(env);
  if (!parsed.success) {
    const missing = Object.keys(AppConfigSchema.shape).filter((k) => env[k] === undefined);
    throw new Error(
      `App config tidak lengkap (kurang: ${missing.join(", ") || "nilai tidak valid"})`,
    );
  }
  const canonical = CANONICAL_ORIGINS[appEnv];
  if (canonical !== null && parsed.data.BETTER_AUTH_URL !== canonical) {
    throw new Error(
      `BETTER_AUTH_URL untuk env ${appEnv} wajib ${canonical} (D.7), dapat: ${parsed.data.BETTER_AUTH_URL}`,
    );
  }
  if (appEnv === "development" && !parsed.data.BETTER_AUTH_URL.startsWith("http://localhost")) {
    throw new Error(`Env development: BETTER_AUTH_URL wajib localhost, dapat: ${parsed.data.BETTER_AUTH_URL}`);
  }
  return { ...parsed.data, env: appEnv, canonicalOrigin: canonical };
}