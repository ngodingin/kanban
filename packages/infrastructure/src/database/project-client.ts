import { createClient, type Client } from "@libsql/client";
import type { ProjectClientFactory } from "../pipeline/database-step.ts";
import { getDatabase, mintDatabaseToken, type TursoEnv } from "../provisioning/turso.ts";

// `project_databases.database_id` menyimpan NAMA database Turso (mis. "proj-xxx",
// lihat provision.ts), bukan URL koneksi — resolusi hostname + JWT per-DB (A.4,
// pola sama dengan provisioning 0.6.1) wajib dilakukan, satu token org-level
// TIDAK bisa dipakai langsung sebagai authToken libsql (temuan CL-06).
// Prefiks `file:` adalah jalur eksplisit untuk lokal/test — BUKAN fallback
// diam-diam di produksi (QA-CL-04).
export async function resolveProjectDbClient(databaseId: string, turso: TursoEnv | null): Promise<Client> {
  if (databaseId.startsWith("file:")) return createClient({ url: databaseId });
  if (!turso) {
    throw new Error(
      "TURSO_API_TOKEN/TURSO_GROUP wajib diisi untuk resolusi database Turso nyata " +
        "(TURSO_GROUP berbeda per environment — production vs staging — tidak boleh diasumsikan)",
    );
  }
  const { hostname } = await getDatabase(turso, databaseId);
  const authToken = await mintDatabaseToken(turso, databaseId);
  return createClient({ url: `https://${hostname}`, authToken });
}

export interface ProjectClientFactoryDeps {
  turso: TursoEnv | null;
}

// Cache Promise<Client> per databaseId: tanpa cache, setiap request membayar
// 2x Turso API call (getDatabase + mintDatabaseToken). Kegagalan di-evict agar
// request berikutnya bisa retry, tidak terjebak Promise rejected selamanya.
export function createCachedProjectDbClientFactory(deps: ProjectClientFactoryDeps): ProjectClientFactory {
  const cache = new Map<string, Promise<Client>>();
  return {
    create(databaseId) {
      const cached = cache.get(databaseId);
      if (cached) return cached;
      const created = resolveProjectDbClient(databaseId, deps.turso);
      cache.set(databaseId, created);
      created.catch(() => {
        if (cache.get(databaseId) === created) cache.delete(databaseId);
      });
      return created;
    },
  };
}

// TURSO_GROUP wajib eksplisit per environment (production = ngodingin-kanban,
// staging = ngodingin-kanban-stag); tanpa kredensial cukup, hasil null membuat
// resolveProjectDbClient menolak databaseId non-`file:` dengan pesan jelas.
export function readTursoEnvFromProcess(env: NodeJS.ProcessEnv = process.env): TursoEnv | null {
  const apiToken = env.TURSO_API_TOKEN;
  const group = env.TURSO_GROUP;
  return apiToken && group ? { org: env.TURSO_ORG ?? "ngodingin-ai", group, apiToken } : null;
}
