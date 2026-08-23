import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import {
  applyGlobalMigrations,
  createPersonalAccessToken,
  hashPatToken,
  listPersonalAccessTokens,
  revokePersonalAccessToken,
  PersonalAccessTokenIdentityResolver,
  CompositeIdentityResolver,
} from "../src/index.ts";

const NOW = "2026-08-01T00:00:00.000Z";
const USER_A = "user_pa";
const USER_B = "user_pb";
let dir: string;
let globalClient: Client;
let rawToken = "";
let tokenId = "";

const fakeRequest = (token?: string): Request =>
  new Request("http://localhost/x", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }) as unknown as Request;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kanban-pat-"));
  globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  for (const user of [USER_A, USER_B]) {
    await globalClient.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
      args: [user, `${user}@t.local`, user, NOW, NOW],
    });
  }
});

afterAll(async () => {
  await globalClient.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("PAT domain commands — goal 4.8.1", () => {
  it("[BR-057][positif] create → raw sekali (prefix pat_), storage hanya hash", async () => {
    const created = await createPersonalAccessToken(globalClient, { userId: USER_A, name: "CLI" });
    expect(created.token.startsWith("pat_")).toBe(true);
    rawToken = created.token;
    tokenId = created.id;

    const row = await globalClient.execute({
      sql: "SELECT token_hash FROM personal_access_tokens WHERE id = ?",
      args: [tokenId],
    });
    expect(String(row.rows[0]!.token_hash)).toBe(hashPatToken(rawToken));
  });

  it("[negatif] expiresAt masa lalu → VALIDATION_ERROR", async () => {
    await expect(
      createPersonalAccessToken(globalClient, {
        userId: USER_A,
        name: "Lama",
        expiresAt: "2020-01-01T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("[self-managed] list hanya milik sendiri; TIDAK PERNAH tokenHash di response", async () => {
    await createPersonalAccessToken(globalClient, { userId: USER_B, name: "B-token" });
    const ownA = await listPersonalAccessTokens(globalClient, USER_A);
    expect(ownA).toHaveLength(1);
    expect(ownA[0]).toMatchObject({ id: tokenId, name: "CLI" });
    expect(Object.keys(ownA[0]!)).not.toContain("tokenHash");
    const ownB = await listPersonalAccessTokens(globalClient, USER_B);
    expect(ownB.map((t) => t.name)).toEqual(["B-token"]);
  });

  it("[self-managed] User A TIDAK bisa revoke PAT milik User B → 404", async () => {
    const b = await createPersonalAccessToken(globalClient, { userId: USER_B, name: "B2" });
    await expect(
      revokePersonalAccessToken(globalClient, { userId: USER_A, tokenId: b.id }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });

    // Pemilik revoke tanpa syarat apa pun
    const revoked = await revokePersonalAccessToken(globalClient, { userId: USER_B, tokenId: b.id });
    expect(revoked.revokedAt).not.toBeNull();
  });
});

describe("PersonalAccessTokenIdentityResolver — goal 4.8.2", () => {
  it("[AC-022] PAT valid lintas Project-konteks → identity = User tsb; lastUsedAt ter-update", async () => {
    const resolver = new PersonalAccessTokenIdentityResolver(globalClient);
    const identity = await resolver.resolveIdentity(fakeRequest(rawToken));
    expect(identity).toMatchObject({ type: "session", userId: USER_A });
    const row = await globalClient.execute({
      sql: "SELECT last_used_at FROM personal_access_tokens WHERE id = ?",
      args: [tokenId],
    });
    expect(row.rows[0]!.last_used_at).not.toBeNull();
  });

  it("[AC-023/AC-024] expired / revoked / unknown → null", async () => {
    const expiring = await createPersonalAccessToken(globalClient, { userId: USER_A, name: "Exp" });
    await globalClient.execute({
      sql: "UPDATE personal_access_tokens SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?",
      args: [expiring.id],
    });
    const resolver = new PersonalAccessTokenIdentityResolver(globalClient);
    expect(await resolver.resolveIdentity(fakeRequest(expiring.token))).toBeNull();
    await revokePersonalAccessToken(globalClient, { userId: USER_A, tokenId }); // revoke rawToken sekarang
    expect(await resolver.resolveIdentity(fakeRequest(rawToken))).toBeNull(); // AC-024
    expect(await resolver.resolveIdentity(fakeRequest("pat_unknown"))).toBeNull();
    expect(await resolver.resolveIdentity(fakeRequest())).toBeNull();
  });

  it("[Prinsip #9] Composite mem-routekan prefix pat_ ke PAT resolver", async () => {
    const fresh = await createPersonalAccessToken(globalClient, { userId: USER_B, name: "ViaComposite" });
    const composite = new CompositeIdentityResolver({
      globalClient,
      fallback: { resolveIdentity: async () => null },
    });
    const identity = await composite.resolveIdentity(fakeRequest(fresh.token));
    expect(identity).toMatchObject({ type: "session", userId: USER_B });
  });
});
