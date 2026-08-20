export { createAuth, type Auth, type AuthConfigInput, type SendMagicLinkData } from "./auth/auth.ts";
export { loadAppConfig, type AppConfig, type AppEnv } from "./config/env.ts";
export { createGlobalClient } from "./database/factory.ts";
export type { Client } from "@libsql/client";
