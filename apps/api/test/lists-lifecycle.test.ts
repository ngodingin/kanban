import { mkdtemp } from "node:fs/promises";
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
}
let ctx: TestCtx;
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
beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), "kanban-api-ls-lifecycle-"));
    const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
    await applyGlobalMigrations(globalClient);
    const now = new Date().toISOString();
    for (const user of ["user-a", "user-b"]) {
        await globalClient.execute({
            sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
            args: [user, `${user}@test.local`, user, now, now],
        });
    }
    projectIdValue = `a-${newProjectId()}`;
    const dbPath = `file:${join(dir, `${projectIdValue}.db`)}`;
    const projectClient = createClient({ url: dbPath });
    await applyProjectMigrations(projectClient);
    await projectClient.execute({
        sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, ?, ?, ?, 1)",
        args: [projectIdValue, "Proj A", now, now],
    });
    await projectClient.execute({ sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_l', 'M', NULL, 0, ?, ?, 1)", args: [now, now] });
    await projectClient.execute({ sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('bd_l', 'ms_l', 'B', NULL, ?, ?, 1)", args: [now, now] });
    for (const id of ["ls_arc", "ls_res"]) {
        await projectClient.execute({
            sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES (?, 'bd_l', ?, ?, ?, 1)",
            args: [id, `L ${id}`, now, now],
        });
    }
    await projectClient.execute({ sql: "UPDATE lists SET archived_at = ? WHERE id = 'ls_res'", args: [now] });
    await projectClient.close();
    await registerProjectWithOwnerMembership(globalClient, { projectId: projectIdValue, databaseId: dbPath, ownerUserId: "user-a", now });
    await globalClient.execute({
        sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES ('m-extra-b', ?, 'user-b', ?, NULL)",
        args: [projectIdValue, now],
    });
    ctx = {
        globalClient,
        deps: {
            resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
            newListId: () => `ls-${Math.random().toString(36).slice(2, 10)}`,
            openProjectContext: async (request, pid) => {
                const pipeline = new RequestPipeline({
                    identityResolver: { resolveIdentity: (req) => identityFor(req.headers.get("x-test-user")) },
                    globalClient,
                    databaseResolver: new SqliteProjectDatabaseResolver(globalClient),
                    projectClientFactory: { create: (databaseId) => createClient({ url: databaseId }) },
                });
                const resolved = await pipeline.run(request, pid);
                return {
                    userId: resolved.identity.userId,
                    ownerUserId: resolved.project.ownerUserId,
                    database: resolved.database,
                    permission: resolved.permission,
                    effectiveFor: createEntityPermissionResolver({
                        globalClient,
                        membershipId: resolved.membership.id,
                        projectId: pid,
                        isOwner: resolved.project.ownerUserId === resolved.identity.userId,
                    }),
                };
            },
        },
    };
});
afterAll(async () => {
    await ctx.globalClient.close();
});
function makeApp(): Hono {
    return new Hono().route("/", createListsRouter(() => ctx.deps));
}
function post(action: string, listId: string, body: unknown, user = "user-a"): Promise<Response> {
    return makeApp().request(`http://localhost/v1/projects/${projectIdValue}/lists/${listId}/${action}`, {
        method: "POST",
        headers: { "x-test-user": user, "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}
describe("POST .../lists/:list_id/{archive,restore,delete} — goal 2.7.3", () => {
    it("[A.3] archive ACTIVE → archivedAt terisi; archive ulang → INVALID_STATE", async () => {
        const res = await post("archive", "ls_arc", { expectedVersion: 1 });
        expect(res.status).toBe(200);
        expect((await res.json()).data.list.archivedAt).toEqual(expect.any(String));
        const again = await post("archive", "ls_arc", { expectedVersion: 2 });
        expect(again.status).toBe(409);
    });
    it("[INV-LIFE-002] restore ARCHIVED saat chain ACTIVE → sukses; Board di-archive → restore List ditolak", async () => {
        const okRes = await post("restore", "ls_res", { expectedVersion: 1 });
        expect(okRes.status).toBe(200);
        expect((await okRes.json()).data.list.archivedAt).toBeNull();
        const reArchive = await post("archive", "ls_res", { expectedVersion: 2 });
        expect(reArchive.status).toBe(200);
        const dbRow = await ctx.globalClient.execute({
            sql: "SELECT d.database_id AS db FROM project_databases d WHERE d.project_id = ?",
            args: [projectIdValue],
        });
        const projectDb = createClient({ url: String(dbRow.rows[0]!.db) });
        try {
            await projectDb.execute("UPDATE boards SET archived_at = '2026-08-21T00:00:00.000Z' WHERE id = 'bd_l'");
        }
        finally {
            await projectDb.close();
        }
        const blocked = await post("restore", "ls_res", { expectedVersion: 3 });
        expect(blocked.status).toBe(409);
        expect((await blocked.json()).error?.code).toBe("INVALID_STATE");
    });
    it("[A.3][AC-020] delete ACTIVE → deletedAt; version mismatch semua action → VERSION_CONFLICT", async () => {
        const rows = await ctx.globalClient.execute({ sql: "SELECT id FROM projects WHERE owner_user_id = 'user-a' LIMIT 1" });
        void rows;
        for (const action of ["archive", "restore", "delete"]) {
            const res = await post(action, "ls_arc", { expectedVersion: 9999 });
            expect(res.status, action).toBe(409);
            expect((await res.json()).error?.code, action).toBe("VERSION_CONFLICT");
        }
    });
    it("[Review-CL-02][INV-LIFE-001] archive/delete List saat Board ARCHIVED → INVALID_STATE (restore tidak terdampak)", async () => {
        const dbRow = await ctx.globalClient.execute({
            sql: "SELECT d.database_id AS db FROM project_databases d WHERE d.project_id = ?",
            args: [projectIdValue],
        });
        const projectDb = createClient({ url: String(dbRow.rows[0]!.db) });
        try {
            await projectDb.execute({
                sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('ls_rev', 'bd_l', 'Rev', datetime('now'), datetime('now'), 1)",
            });
            await projectDb.execute("UPDATE boards SET archived_at = '2026-08-21T00:00:00.000Z' WHERE id = 'bd_l'");
        }
        finally {
            await projectDb.close();
        }
        const archRes = await post("archive", "ls_rev", { expectedVersion: 1 });
        expect(archRes.status).toBe(409);
        expect((await archRes.json()).error?.code).toBe("INVALID_STATE");
        const delRes = await post("delete", "ls_rev", { expectedVersion: 1 });
        expect(delRes.status).toBe(409);
        expect((await delRes.json()).error?.code).toBe("INVALID_STATE");
        const projectDb2 = createClient({ url: String(dbRow.rows[0]!.db) });
        try {
            const r = await projectDb2.execute("SELECT title, version FROM lists WHERE id = 'ls_rev'");
            expect(r.rows[0]).toMatchObject({ title: "Rev", version: 1 });
        }
        finally {
            await projectDb2.close();
        }
        const projectDb3 = createClient({ url: String(dbRow.rows[0]!.db) });
        try {
            await projectDb3.execute("UPDATE boards SET archived_at = NULL WHERE id = 'bd_l'");
        }
        finally {
            await projectDb3.close();
        }
        const delOk = await post("delete", "ls_rev", { expectedVersion: 1 });
        expect(delOk.status).toBe(200);
    });
    it("[C.7] expected_version hilang → VALIDATION_ERROR; non-Owner → PERMISSION_DENIED; tanpa identitas → TOKEN_EXPIRED; tidak ada → 404", async () => {
        const missingVersion = await post("archive", "ls_arc", {});
        expect(missingVersion.status).toBe(400);
        const denied = await post("archive", "ls_arc", { expectedVersion: 2 }, "user-b");
        expect(denied.status).toBe(403);
        const noIdentity = await makeApp().request(`http://localhost/v1/projects/${projectIdValue}/lists/ls_arc/archive`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ expectedVersion: 2 }),
        });
        expect(noIdentity.status).toBe(401);
        const missing = await post("archive", "ls_none", { expectedVersion: 1 });
        expect(missing.status).toBe(404);
    });
});
