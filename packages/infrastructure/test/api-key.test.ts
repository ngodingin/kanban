import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import {
  applyGlobalMigrations,
  createApiKey,
  hashApiKeySecret,
  listApiKeys,
  revokeApiKey,
  ApiKeyIdentityResolver,
  CompositeIdentityResolver,
  RequestPipeline,
  SqliteProjectDatabaseResolver,
  PipelineError,
} from "../src/index.ts";

const NOW = "2026-08-01T00:00:00.000Z";
const PROJ_A = "proj_aaa";
const PROJ_B = "proj_bbb";
const USER = "user_kk";

let dir: string;
let globalClient: Client;
let rawSecret = "";
let keyId = "";

const fakeRequest = (token?: string): Request =>
  new Request("http://localhost/x", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }) as unknown as Request;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kanban-api-key-"));
  globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  await globalClient.execute({
    sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
    args: [USER, `${USER}@t.local`, USER, NOW, NOW],
  });
  for (const [pid] of [[PROJ_A], [PROJ_B]] as const) {
    await globalClient.execute({
      sql: "INSERT INTO projects (id, owner_user_id, provisioning_state, created_at) VALUES (?, ?, 'READY', ?)",
      args: [pid, USER, NOW],
    });
    await globalClient.execute({
      sql: "INSERT INTO project_databases (project_id, database_id, created_at) VALUES (?, 'file::memory:', ?)",
      args: [pid, NOW],
    });
    await globalClient.execute({
      sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES (?, ?, ?, ?, NULL)",
      args: [`m-${pid}`, pid, USER, NOW],
    });
  }
});

afterAll(async () => {
  await globalClient.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("API Key domain commands — goal 4.7.1", () => {
  it("[BR-057][positif] create → raw secret sekali (prefix ak_), storage HANYA hash", async () => {
    const created = await createApiKey(globalClient, {
      projectId: PROJ_A,
      createdByUserId: USER,
      name: "CI",
    });
    expect(created.secret.startsWith("ak_")).toBe(true);
    expect(created.id.startsWith("ak-")).toBe(true);
    rawSecret = created.secret;
    keyId = created.id;

    const row = await globalClient.execute({ sql: "SELECT key_hash FROM api_keys WHERE id = ?", args: [keyId] });
    expect(String(row.rows[0]!.key_hash)).not.toContain(rawSecret);
    expect(String(row.rows[0]!.key_hash)).toBe(hashApiKeySecret(rawSecret));
  });

  it("[negatif] expiresAt masa lalu → VALIDATION_ERROR", async () => {
    await expect(
      createApiKey(globalClient, {
        projectId: PROJ_A,
        createdByUserId: USER,
        name: "Lama",
        expiresAt: "2020-01-01T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("[C.2 03-ENG] list → metadata saja, TIDAK PERNAH keyHash", async () => {
    const keys = await listApiKeys(globalClient, PROJ_A);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ id: keyId, name: "CI" });
    expect(Object.keys(keys[0]!)).not.toContain("keyHash");
    // Project-scoped: tidak bocor lintas Project
    const otherProjectKeys = await listApiKeys(globalClient, PROJ_B);
    expect(otherProjectKeys).toEqual([]);
  });

  it("[AC-024] revoke → revokedAt terisi", async () => {
    const revoked = await revokeApiKey(globalClient, { projectId: PROJ_A, keyId });
    expect(revoked.revokedAt).not.toBeNull();
  });

  it("[boundary] revoke key milik Project lain → RESOURCE_NOT_FOUND", async () => {
    const second = await createApiKey(globalClient, { projectId: PROJ_B, createdByUserId: USER, name: "B" });
    await expect(
      revokeApiKey(globalClient, { projectId: PROJ_A, keyId: second.id }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });
});

describe("ApiKeyIdentityResolver + Composite — goal 4.7.2", () => {
  it("[BR-055] token valid → identity sukses + lastUsedAt ter-update", async () => {
    const fresh = await createApiKey(globalClient, { projectId: PROJ_A, createdByUserId: USER, name: "Fresh" });
    const resolver = new ApiKeyIdentityResolver(globalClient);
    const identity = await resolver.resolveIdentity(fakeRequest(fresh.secret));
    expect(identity).toMatchObject({ type: "api_key", userId: USER, apiKeyProjectId: PROJ_A });
    const row = await globalClient.execute({ sql: "SELECT last_used_at FROM api_keys WHERE id = ?", args: [fresh.id] });
    expect(row.rows[0]!.last_used_at).not.toBeNull();
  });

  it("[AC-023/AC-024] revoked / expired / token tak dikenal → null", async () => {
    const resolver = new ApiKeyIdentityResolver(globalClient);
    expect(await resolver.resolveIdentity(fakeRequest(rawSecret))).toBeNull(); // rawSecret milik key yang sudah direvoke di test sebelumnya

    const expiring = await createApiKey(globalClient, {
      projectId: PROJ_A,
      createdByUserId: USER,
      name: "Expiring",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    await globalClient.execute({
      sql: "UPDATE api_keys SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?",
      args: [expiring.id],
    });
    expect(await resolver.resolveIdentity(fakeRequest(expiring.secret))).toBeNull();
    expect(await resolver.resolveIdentity(fakeRequest("ak_totally_unknown"))).toBeNull();
    expect(await resolver.resolveIdentity(fakeRequest())).toBeNull(); // tanpa header
  });

  it("[AC-021 KRITIS] key Project A dipakai ke request Project B → ditolak walau User member di B", async () => {
    const fresh = await createApiKey(globalClient, { projectId: PROJ_A, createdByUserId: USER, name: "XProj" });
    const composite = new CompositeIdentityResolver({
      globalClient,
      fallback: { resolveIdentity: async () => null },
    });
    const pipeline = new RequestPipeline({
      identityResolver: composite,
      globalClient,
      databaseResolver: new SqliteProjectDatabaseResolver(globalClient),
      projectClientFactory: { create: () => createClient({ url: ":memory:" }) },
    });

    await expect(pipeline.run(fakeRequest(fresh.secret), PROJ_B)).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });

    // Jalur benar: identitas lolos AC-021 (lanjut ke step berikutnya)
    const okPipeline = new RequestPipeline({
      identityResolver: composite,
      globalClient,
      databaseResolver: new SqliteProjectDatabaseResolver(globalClient),
      projectClientFactory: { create: () => createClient({ url: ":memory:" }) },
      permissionResolver: {
        resolve: async () => ({
          permission: { grantedKeys: new Set<string>(), cardReadVisibility: "CREATED_BY_ME" },
          inputs: { groupAssignments: [], directAssignments: [] },
        }),
      },
    });
    const ctx = await okPipeline.run(fakeRequest(fresh.secret), PROJ_A);
    expect(ctx.identity.type).toBe("api_key");
    expect(ctx.membership.id).toBe(`m-${PROJ_A}`);
  });

  it("[Prinsip #9] Composite fallback session saat tanpa Authorization header", async () => {
    let called = false;
    const composite = new CompositeIdentityResolver({
      globalClient,
      fallback: { resolveIdentity: async () => { called = true; return null; } },
    });
    expect(await composite.resolveIdentity(fakeRequest())).toBeNull();
    expect(called).toBe(true);

    // Prefix pat_ kini di-route ke PAT resolver (TASK-4.8) — fallback TIDAK dipanggil
    called = false;
    expect(await composite.resolveIdentity(fakeRequest("pat_something"))).toBeNull();
    expect(called).toBe(false);
  });

  it("[PipelineError instance] penolakan AC-021 adalah error domain terpetakan", async () => {
    const fresh = await createApiKey(globalClient, { projectId: PROJ_B, createdByUserId: USER, name: "B2" });
    const pipeline = new RequestPipeline({
      identityResolver: new ApiKeyIdentityResolver(globalClient),
      globalClient,
      databaseResolver: new SqliteProjectDatabaseResolver(globalClient),
      projectClientFactory: { create: () => createClient({ url: ":memory:" }) },
    });
    await expect(pipeline.run(fakeRequest(fresh.secret), PROJ_A)).rejects.toBeInstanceOf(PipelineError);
  });
});
