import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import { applyGlobalMigrations, applyProjectMigrations, newProjectId, registerProjectWithOwnerMembership, RequestPipeline, SqliteProjectDatabaseResolver, createEntityPermissionResolver, } from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";
import { createListsRouter, type ListRoutesDeps } from "../src/routes/lists.ts";
interface TestCtx {
    globalClient: Client;
    deps: ListRoutesDeps;
    dir: string;
}
let ctx: TestCtx;
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
    const dir = await mkdtemp(join(tmpdir(), "kanban-api-lists-"));
    const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
    await applyGlobalMigrations(globalClient);
    const now = new Date().toISOString();
    for (const user of ["user-a", "user-b"]) {
        await globalClient.execute({
            sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
            args: [user, `${user}@test.local`, user, now, now],
        });
    }
    const provision = async (projectId: string): Promise<string> => {
        const dbPath = `file:${join(dir, `${projectId}.db`)}`;
        const projectClient = createClient({ url: dbPath });
        await applyProjectMigrations(projectClient);
        await projectClient.execute({
            sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, ?, ?, ?, 1)",
            args: [projectId, `P ${projectId}`, now, now],
        });
        await projectClient.close();
        return dbPath;
    };
    const idA = `a-${newProjectId()}`;
    const idB = `b-${newProjectId()}`;
    const pathA = await provision(idA);
    const pathB = await provision(idB);
    await registerProjectWithOwnerMembership(globalClient, { projectId: idA, databaseId: pathA, ownerUserId: "user-a", now });
    await registerProjectWithOwnerMembership(globalClient, { projectId: idB, databaseId: pathB, ownerUserId: "user-b", now });
    ctx = {
        globalClient,
        dir,
        deps: {
            resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
            newListId: () => `ls-${Math.random().toString(36).slice(2, 10)}`,
            openProjectContext: async (request, projectId) => {
                const pipeline = new RequestPipeline({
                    identityResolver: { resolveIdentity: (req) => identityFor(req.headers.get("x-test-user")) },
                    globalClient,
                    databaseResolver: new SqliteProjectDatabaseResolver(globalClient),
                    projectClientFactory: { create: (databaseId) => createClient({ url: databaseId }) },
                });
                const resolved = await pipeline.run(request, projectId);
                return {
                    userId: resolved.identity.userId,
                    ownerUserId: resolved.project.ownerUserId,
                    database: resolved.database,
                    permission: resolved.permission,
                    effectiveFor: createEntityPermissionResolver({
                        globalClient,
                        membershipId: resolved.membership.id,
                        projectId: projectId,
                        isOwner: resolved.project.ownerUserId === resolved.identity.userId,
                    }),
                };
            },
        },
    };
});
afterAll(async () => {
    await ctx.globalClient.close();
    await rm(ctx.dir, { recursive: true, force: true });
});
function makeApp(): Hono {
    return new Hono().route("/", createListsRouter(() => ctx.deps));
}
async function projectDbPath(projectId: string): Promise<string> {
    const row = await ctx.globalClient.execute({
        sql: "SELECT d.database_id AS db FROM project_databases d WHERE d.project_id = ?",
        args: [projectId],
    });
    return String(row.rows[0]!.db);
}
describe("POST /api/v1/projects/:project_id/boards/:board_id/lists — goal 2.7.1", () => {
    it("[FR-021][C.7][C.2] Owner membuat list → 201 envelope data.list + Activity list.created", async () => {
        const rows = await ctx.globalClient.execute({ sql: "SELECT id FROM projects WHERE owner_user_id = 'user-a' LIMIT 1" });
        const projectId = String(rows.rows[0]!.id);
        const dbPath = await projectDbPath(projectId);
        const setup = createClient({ url: dbPath });
        try {
            await setup.execute({ sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_l', 'M', NULL, 0, datetime('now'), datetime('now'), 1)" });
            await setup.execute({ sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('bd_l', 'ms_l', 'Board', NULL, datetime('now'), datetime('now'), 1)" });
        }
        finally {
            await setup.close();
        }
        const res = await makeApp().request(`http://localhost/v1/projects/${projectId}/boards/bd_l/lists`, {
            method: "POST",
            headers: { "x-test-user": "user-a", "content-type": "application/json" },
            body: JSON.stringify({ title: "To Do" }),
        });
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json.data.list).toMatchObject({ boardId: "bd_l", title: "To Do", version: 1, archivedAt: null });
        const verify = createClient({ url: dbPath });
        try {
            const activity = await verify.execute("SELECT action FROM activities WHERE entity_type = 'list'");
            expect(activity.rows[0]).toMatchObject({ action: "list.created" });
        }
        finally {
            await verify.close();
        }
    });
    it("[Project-boundary] board Project lain / tidak ada → RESOURCE_NOT_FOUND", async () => {
        const rowsA = await ctx.globalClient.execute({ sql: "SELECT id FROM projects WHERE owner_user_id = 'user-a' LIMIT 1" });
        const projectIdA = String(rowsA.rows[0]!.id);
        const resMissing = await makeApp().request(`http://localhost/v1/projects/${projectIdA}/boards/bd_none/lists`, {
            method: "POST",
            headers: { "x-test-user": "user-a", "content-type": "application/json" },
            body: JSON.stringify({ title: "X" }),
        });
        expect(resMissing.status).toBe(404);
        const rowsB = await ctx.globalClient.execute({ sql: "SELECT id FROM projects WHERE owner_user_id = 'user-b' LIMIT 1" });
        const projectIdB = String(rowsB.rows[0]!.id);
        const resCross = await makeApp().request(`http://localhost/v1/projects/${projectIdB}/boards/bd_l/lists`, {
            method: "POST",
            headers: { "x-test-user": "user-b", "content-type": "application/json" },
            body: JSON.stringify({ title: "X" }),
        });
        expect(resCross.status).toBe(404);
    });
    it("[Authz interim + payload] non-member 403; tanpa identitas 401; title invalid → VALIDATION_ERROR", async () => {
        const rows = await ctx.globalClient.execute({ sql: "SELECT id FROM projects WHERE owner_user_id = 'user-a' LIMIT 1" });
        const projectId = String(rows.rows[0]!.id);
        const denied = await makeApp().request(`http://localhost/v1/projects/${projectId}/boards/bd_l/lists`, {
            method: "POST",
            headers: { "x-test-user": "user-b", "content-type": "application/json" },
            body: JSON.stringify({ title: "X" }),
        });
        expect(denied.status).toBe(403);
        expect((await denied.json()).error?.code).toBe("PROJECT_ACCESS_DENIED");
        const noIdentity = await makeApp().request(`http://localhost/v1/projects/${projectId}/boards/bd_l/lists`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: "X" }),
        });
        expect(noIdentity.status).toBe(401);
        for (const body of [{}, { title: "" }, { title: 9 }, "bukan-json"]) {
            const res = await makeApp().request(`http://localhost/v1/projects/${projectId}/boards/bd_l/lists`, {
                method: "POST",
                headers: { "x-test-user": "user-a", "content-type": "application/json" },
                body: typeof body === "string" ? body : JSON.stringify(body),
            });
            expect(res.status).toBe(400);
            expect((await res.json()).error?.code).toBe("VALIDATION_ERROR");
        }
    });
});
describe("GET /api/v1/projects/:project_id/lists/:list_id — goal 2.7.1", () => {
    it("[C.7][C.2] member membaca list; non-member ditolak; tidak ada → 404", async () => {
        const rows = await ctx.globalClient.execute({ sql: "SELECT id FROM projects WHERE owner_user_id = 'user-a' LIMIT 1" });
        const projectId = String(rows.rows[0]!.id);
        const dbPath = await projectDbPath(projectId);
        const setup = createClient({ url: dbPath });
        try {
            await setup.execute({ sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('ls_get', 'bd_l', 'Kolom Get', datetime('now'), datetime('now'), 1)" });
        }
        finally {
            await setup.close();
        }
        const okRes = await makeApp().request(`http://localhost/v1/projects/${projectId}/lists/ls_get`, {
            headers: { "x-test-user": "user-a" },
        });
        expect(okRes.status).toBe(200);
        expect((await okRes.json()).data.list).toMatchObject({ id: "ls_get", title: "Kolom Get" });
        const denied = await makeApp().request(`http://localhost/v1/projects/${projectId}/lists/ls_get`, {
            headers: { "x-test-user": "user-b" },
        });
        expect(denied.status).toBe(403);
        expect(((await denied.json()).data ?? {}).list).toBeUndefined();
        const missing = await makeApp().request(`http://localhost/v1/projects/${projectId}/lists/ls_none`, {
            headers: { "x-test-user": "user-a" },
        });
        expect(missing.status).toBe(404);
        expect((await missing.json()).error?.code).toBe("RESOURCE_NOT_FOUND");
    });
});
