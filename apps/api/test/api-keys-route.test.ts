import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import { applyGlobalMigrations, assertPermissionKey, createApiKey, listApiKeys, revokeApiKey, } from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";
import { createApiKeysRouter, type ApiKeysRoutesDeps } from "../src/routes/api-keys.ts";
const NOW = "2026-08-01T00:00:00.000Z";
const PROJECT = "proj_ak_route";
let dir: string;
let globalClient: Client;
let deps: ApiKeysRoutesDeps;
const identityFor = (userId: string | null): Promise<ResolvedIdentity | null> => userId === null
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
    dir = mkdtempSync(join(tmpdir(), "kanban-api-keys-route-"));
    globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
    await applyGlobalMigrations(globalClient);
    for (const user of ["user-owner", "user-plain"]) {
        await globalClient.execute({
            sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
            args: [user, `${user}@t.local`, user, NOW, NOW],
        });
    }
    await globalClient.execute({
        sql: "INSERT INTO projects (id, owner_user_id, provisioning_state, created_at) VALUES (?, ?, 'READY', ?)",
        args: [PROJECT, "user-owner", NOW],
    });
    await globalClient.execute({
        sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES ('m-plain', ?, 'user-plain', ?, NULL)",
        args: [PROJECT, NOW],
    });
    deps = {
        resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
        assertPermissionKey: (projectId, requesterUserId, key) => assertPermissionKey(globalClient, projectId, requesterUserId, key),
        createApiKey: (input) => createApiKey(globalClient, input),
        revokeApiKey: (projectId, keyId) => revokeApiKey(globalClient, { projectId, keyId }),
        listApiKeys: (projectId) => listApiKeys(globalClient, projectId),
    };
});
afterAll(async () => {
    await globalClient.close();
    rmSync(dir, { recursive: true, force: true });
});
const app = (): Hono => new Hono().route("/", createApiKeysRouter(() => deps));
describe("POST/GET/revoke /api-keys — goal 4.7.1 (route-level authz)", () => {
    it("[positif] Owner (BR-037) create → 201, secret RAW hanya sekali, key_hash tidak pernah keluar", async () => {
        const res = await app().request(`http://localhost/v1/projects/${PROJECT}/api-keys`, {
            method: "POST",
            headers: { "x-test-user": "user-owner", "content-type": "application/json" },
            body: JSON.stringify({ name: "CI Key" }),
        });
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json.data.apiKey.secret.startsWith("ak_")).toBe(true);
        expect(json.data.apiKey.key_hash).toBeUndefined();
    });
    it("[negatif] Membership tanpa api_key.create → 403 PERMISSION_DENIED", async () => {
        const res = await app().request(`http://localhost/v1/projects/${PROJECT}/api-keys`, {
            method: "POST",
            headers: { "x-test-user": "user-plain", "content-type": "application/json" },
            body: JSON.stringify({ name: "Denied" }),
        });
        expect(res.status).toBe(403);
        expect((await res.json()).error?.code).toBe("PERMISSION_DENIED");
    });
    it("[positif] Owner list → 200, metadata saja", async () => {
        const res = await app().request(`http://localhost/v1/projects/${PROJECT}/api-keys`, {
            headers: { "x-test-user": "user-owner" },
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data.apiKeys.length).toBeGreaterThanOrEqual(1);
        expect(json.data.apiKeys[0].secret).toBeUndefined();
    });
    it("[negatif] Membership tanpa api_key.read → 403", async () => {
        const res = await app().request(`http://localhost/v1/projects/${PROJECT}/api-keys`, {
            headers: { "x-test-user": "user-plain" },
        });
        expect(res.status).toBe(403);
    });
    it("[positif+negatif] Owner revoke berhasil; non-member 403", async () => {
        const created = await app().request(`http://localhost/v1/projects/${PROJECT}/api-keys`, {
            method: "POST",
            headers: { "x-test-user": "user-owner", "content-type": "application/json" },
            body: JSON.stringify({ name: "ToRevoke" }),
        });
        const keyId = (await created.json()).data.apiKey.id as string;
        const denied = await app().request(`http://localhost/v1/projects/${PROJECT}/api-keys/${keyId}/revoke`, {
            method: "POST",
            headers: { "x-test-user": "user-plain" },
        });
        expect(denied.status).toBe(403);
        const ok = await app().request(`http://localhost/v1/projects/${PROJECT}/api-keys/${keyId}/revoke`, {
            method: "POST",
            headers: { "x-test-user": "user-owner" },
        });
        expect(ok.status).toBe(200);
        expect((await ok.json()).data.apiKey.revokedAt).not.toBeNull();
    });
    it("[validation] field tak dikenal di body create → 400", async () => {
        const res = await app().request(`http://localhost/v1/projects/${PROJECT}/api-keys`, {
            method: "POST",
            headers: { "x-test-user": "user-owner", "content-type": "application/json" },
            body: JSON.stringify({ name: "X", bogus: true }),
        });
        expect(res.status).toBe(400);
        expect((await res.json()).error?.code).toBe("VALIDATION_ERROR");
    });
});
