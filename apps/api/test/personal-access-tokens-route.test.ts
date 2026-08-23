import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import {
  applyGlobalMigrations,
  createPersonalAccessToken,
  listPersonalAccessTokens,
  revokePersonalAccessToken,
} from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";
import {
  createPersonalAccessTokensRouter,
  type PersonalAccessTokensRoutesDeps,
} from "../src/routes/personal-access-tokens.ts";

const NOW = "2026-08-01T00:00:00.000Z";

let dir: string;
let globalClient: Client;
let deps: PersonalAccessTokensRoutesDeps;

const identityFor = (userId: string | null): Promise<ResolvedIdentity | null> =>
  userId === null
    ? Promise.resolve(null)
    : Promise.resolve({
        type: "session",
        userId,
        email: `${userId}@test.local`,
        name: userId,
        emailVerified: true,
        image: null,
      });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kanban-pat-route-"));
  globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  for (const user of ["user-a", "user-b"]) {
    await globalClient.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
      args: [user, `${user}@t.local`, user, NOW, NOW],
    });
  }

  deps = {
    resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
    createPersonalAccessToken: (input) => createPersonalAccessToken(globalClient, input),
    revokePersonalAccessToken: (userId, tokenId) => revokePersonalAccessToken(globalClient, { userId, tokenId }),
    listPersonalAccessTokens: (userId) => listPersonalAccessTokens(globalClient, userId),
  };
});

afterAll(async () => {
  await globalClient.close();
  rmSync(dir, { recursive: true, force: true });
});

const app = (): Hono => new Hono().route("/", createPersonalAccessTokensRouter(() => deps));

describe("POST/GET/revoke /me/personal-access-tokens — goal 4.8.1/4.8.2 (self-managed, tanpa permission key)", () => {
  it("[positif] User mana pun create tanpa grant apa pun (self-managed, FR-052) → 201, token RAW sekali", async () => {
    const res = await app().request("http://localhost/api/v1/me/personal-access-tokens", {
      method: "POST",
      headers: { "x-test-user": "user-a", "content-type": "application/json" },
      body: JSON.stringify({ name: "CLI" }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.personal_access_token.token.startsWith("pat_")).toBe(true);
    expect(json.data.personal_access_token.token_hash).toBeUndefined();
  });

  it("[isolasi] list hanya milik identity yang resolve, bukan seluruh User", async () => {
    await app().request("http://localhost/api/v1/me/personal-access-tokens", {
      method: "POST",
      headers: { "x-test-user": "user-b", "content-type": "application/json" },
      body: JSON.stringify({ name: "B token" }),
    });
    const resA = await app().request("http://localhost/api/v1/me/personal-access-tokens", {
      headers: { "x-test-user": "user-a" },
    });
    const jsonA = await resA.json();
    expect(jsonA.data.personal_access_tokens.map((t: { name: string }) => t.name)).toEqual(["CLI"]);

    const resB = await app().request("http://localhost/api/v1/me/personal-access-tokens", {
      headers: { "x-test-user": "user-b" },
    });
    const jsonB = await resB.json();
    expect(jsonB.data.personal_access_tokens.map((t: { name: string }) => t.name)).toEqual(["B token"]);
  });

  it("[boundary] User A revoke token milik User B → RESOURCE_NOT_FOUND (bukan 403 — analog BR-034A)", async () => {
    const created = await app().request("http://localhost/api/v1/me/personal-access-tokens", {
      method: "POST",
      headers: { "x-test-user": "user-b", "content-type": "application/json" },
      body: JSON.stringify({ name: "ToRevoke" }),
    });
    const tokenId = (await created.json()).data.personal_access_token.id as string;

    const denied = await app().request(
      `http://localhost/api/v1/me/personal-access-tokens/${tokenId}/revoke`,
      { method: "POST", headers: { "x-test-user": "user-a" } },
    );
    expect(denied.status).toBe(404);
    expect((await denied.json()).error?.code).toBe("RESOURCE_NOT_FOUND");

    const ok = await app().request(
      `http://localhost/api/v1/me/personal-access-tokens/${tokenId}/revoke`,
      { method: "POST", headers: { "x-test-user": "user-b" } },
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).data.personal_access_token.revokedAt).not.toBeNull();
  });

  it("[validation] field tak dikenal di body create → 400", async () => {
    const res = await app().request("http://localhost/api/v1/me/personal-access-tokens", {
      method: "POST",
      headers: { "x-test-user": "user-a", "content-type": "application/json" },
      body: JSON.stringify({ name: "X", bogus: true }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error?.code).toBe("VALIDATION_ERROR");
  });
});
