import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import { applyGlobalMigrations, applyProjectMigrations, assertPermissionKey, createApiKey, listApiKeys, newProjectId, registerProjectWithOwnerMembership, revokeApiKey, } from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";
import { buildMilestoneLabelRoutesDeps, buildProjectAdminDeps } from "../src/project-deps.ts";
import { createMilestoneLabelsRouter } from "../src/routes/labels.ts";
import { createProjectAdminRouter } from "../src/routes/project-admin.ts";
import { createApiKeysRouter, type ApiKeysRoutesDeps } from "../src/routes/api-keys.ts";
const NOW = "2026-08-01T00:00:00.000Z";
let dir: string;
let globalClient: Client;
let projectIdValue: string;
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
const fakeIdentityResolver = { resolveIdentity: (req: Request) => identityFor(req.headers.get("x-test-user")) };
beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kanban-validation-collect-all-0176-"));
    globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
    await applyGlobalMigrations(globalClient);
    await globalClient.execute({
        sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES ('user-a', 'a@t.local', 1, 'a', ?, ?)",
        args: [NOW, NOW],
    });
    projectIdValue = `a-${newProjectId()}`;
    const projectDbPath = `file:${join(dir, `${projectIdValue}.db`)}`;
    const projectClient = createClient({ url: projectDbPath });
    await applyProjectMigrations(projectClient);
    await projectClient.execute({
        sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, 'P', ?, ?, 1)",
        args: [projectIdValue, NOW, NOW],
    });
    await projectClient.execute({
        sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms1', 'M', NULL, 0, ?, ?, 1)",
        args: [NOW, NOW],
    });
    await projectClient.execute({
        sql: "INSERT INTO milestone_labels (id, milestone_id, name, created_at, updated_at, version) VALUES ('lb1', 'ms1', 'L', ?, ?, 1)",
        args: [NOW, NOW],
    });
    await projectClient.close();
    await registerProjectWithOwnerMembership(globalClient, {
        projectId: projectIdValue,
        databaseId: projectDbPath,
        ownerUserId: "user-a",
        now: NOW,
    });
});
afterAll(async () => {
    await globalClient.close();
});
const req = (app: Hono, path: string, method: string, body: unknown): Promise<Response> => app.request(`http://localhost${path}`, {
    method,
    headers: { "x-test-user": "user-a", "content-type": "application/json" },
    body: JSON.stringify(body),
});
const fields = (json: {
    error?: {
        details?: Array<{
            field: string;
        }>;
    };
}): string[] => (json.error?.details ?? []).map((d) => d.field).sort();
describe("[TASK-0.17.6] VALIDATION_ERROR collect-all — Label", () => {
    const labelApp = (): Hono => new Hono().route("/", createMilestoneLabelsRouter(() => buildMilestoneLabelRoutesDeps({ identityResolver: fakeIdentityResolver, globalClient, turso: null })));
    it("[PATCH Milestone Label] name kosong + expectedVersion bukan integer -> KEDUA field muncul sekaligus", async () => {
        const res = await req(labelApp(), `/v1/projects/${projectIdValue}/milestones/ms1/labels/lb1`, "PATCH", {
            name: "",
            expectedVersion: "x",
        });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(fields(json)).toEqual(["expectedVersion", "name"]);
    });
});
describe("[TASK-0.17.6] VALIDATION_ERROR collect-all — Permission Group/Membership/Invitation", () => {
    const adminApp = (): Hono => new Hono().route("/", createProjectAdminRouter(() => buildProjectAdminDeps({ identityResolver: fakeIdentityResolver, globalClient, turso: null })));
    it("[CREATE Permission Group] name kosong + description bukan string -> KEDUA field muncul sekaligus", async () => {
        const res = await req(adminApp(), `/v1/projects/${projectIdValue}/permission-groups`, "POST", {
            name: "",
            description: 42,
        });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(fields(json)).toEqual(["description", "name"]);
    });
    it("[POST group-assignments] groupId + scopeType + scopeId kosong semua -> KETIGA field muncul sekaligus", async () => {
        const res = await req(adminApp(), `/v1/projects/${projectIdValue}/members/m-nonexistent/group-assignments`, "POST", {
            groupId: "",
            scopeType: "",
            scopeId: "",
        });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(fields(json)).toEqual(["groupId", "scopeId", "scopeType"]);
    });
    it("[POST permission-assignments] permissionId + scopeType kosong -> KEDUA field muncul sekaligus", async () => {
        const res = await req(adminApp(), `/v1/projects/${projectIdValue}/members/m-nonexistent/permission-assignments`, "POST", {
            permissionId: "",
            scopeType: "",
            scopeId: "valid",
        });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(fields(json)).toEqual(["permissionId", "scopeType"]);
    });
    it("[POST invitations] expiresAt bukan string + assignments bukan array -> KEDUA field muncul sekaligus", async () => {
        const res = await req(adminApp(), `/v1/projects/${projectIdValue}/invitations`, "POST", {
            email: "x@y.co",
            expiresAt: 123,
            assignments: "bukan-array",
        });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(fields(json)).toEqual(["assignments", "expiresAt"]);
    });
});
describe("[TASK-0.17.6] VALIDATION_ERROR collect-all — API Key", () => {
    let keyDeps: ApiKeysRoutesDeps;
    const PROJECT = "proj_collect_all_ak";
    beforeAll(async () => {
        await globalClient.execute({
            sql: "INSERT INTO projects (id, owner_user_id, provisioning_state, created_at) VALUES (?, ?, 'READY', ?)",
            args: [PROJECT, "user-a", NOW],
        });
        keyDeps = {
            resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
            assertPermissionKey: (projectId, requesterUserId, key) => assertPermissionKey(globalClient, projectId, requesterUserId, key),
            createApiKey: (input) => createApiKey(globalClient, input),
            revokeApiKey: (projectId, keyId) => revokeApiKey(globalClient, { projectId, keyId }),
            listApiKeys: (projectId) => listApiKeys(globalClient, projectId),
        };
    });
    const keyApp = (): Hono => new Hono().route("/", createApiKeysRouter(() => keyDeps));
    it("[CREATE API Key] name kosong + expiresAt bukan string -> KEDUA field muncul sekaligus", async () => {
        const res = await req(keyApp(), `/v1/projects/${PROJECT}/api-keys`, "POST", {
            name: "",
            expiresAt: 123,
            unknownFieldX: 1,
        });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(fields(json)).toEqual(["expiresAt", "name", "unknownField:unknownFieldX"]);
    });
});
