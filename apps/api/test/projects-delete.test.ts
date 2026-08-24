import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import { applyGlobalMigrations, applyProjectMigrations, newProjectId, registerProjectWithOwnerMembership, RequestPipeline, SqliteProjectDatabaseResolver, createEntityPermissionResolver, } from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";
import { createProjectsRouter, type ProjectRoutesDeps } from "../src/routes/projects.ts";
interface TestCtx {
    globalClient: Client;
    deps: ProjectRoutesDeps;
    dir: string;
}
let ctx: TestCtx;
let idA1: string;
beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), "kanban-api-delete-"));
    const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
    await applyGlobalMigrations(globalClient);
    const now = new Date().toISOString();
    for (const user of ["user-a", "user-b"]) {
        await globalClient.execute({
            sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
            args: [user, `${user}@test.local`, user, now, now],
        });
    }
    idA1 = `a1-${newProjectId()}`;
    const dbPathA1 = `file:${join(dir, `${idA1}.db`)}`;
    const projectClient = createClient({ url: dbPathA1 });
    await applyProjectMigrations(projectClient);
    await projectClient.execute({
        sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, 'Proj A1', ?, ?, 1)",
        args: [idA1, now, now],
    });
    await projectClient.close();
    await registerProjectWithOwnerMembership(globalClient, {
        projectId: idA1,
        databaseId: dbPathA1,
        ownerUserId: "user-a",
        now,
    });
    await globalClient.execute({
        sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES ('m-extra-b', ?, 'user-b', ?, NULL)",
        args: [idA1, now],
    });
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
    ctx = {
        globalClient,
        dir,
        deps: {
            resolveIdentity: async (request) => identityFor(request.headers.get("x-test-user")),
            newProjectId,
            createProject: async () => {
                throw new Error("tidak dipakai di test delete");
            },
            listProjects: async () => [],
            openProjectContext: async (request, projectId) => {
                const pipeline = new RequestPipeline({
                    identityResolver: {
                        resolveIdentity: (req) => identityFor(req.headers.get("x-test-user")),
                    },
                    globalClient,
                    databaseResolver: new SqliteProjectDatabaseResolver(globalClient),
                    projectClientFactory: {
                        create: (databaseId) => createClient({ url: databaseId }),
                    },
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
    return new Hono().route("/", createProjectsRouter(() => ctx.deps));
}
function del(body: unknown, user?: string) {
    return makeApp().request(`http://localhost/v1/projects/${idA1}/delete`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...(user ? { "x-test-user": user } : {}),
        },
        body: JSON.stringify(body),
    });
}
describe("POST /api/v1/projects/:project_id/delete — terminal lifecycle (goal 1.4.3)", () => {
    it("[A.3][C.4] owner delete dari ACTIVE → 200, deleted_at terisi + Activity project.deleted", async () => {
        const res = await del({ expectedVersion: 1 }, "user-a");
        if (res.status !== 200)
            throw new Error(`status ${res.status}: ${await res.text()}`);
        const json = await res.json();
        const p = json.data.project;
        if (p.deletedAt === null || p.version !== 2)
            throw new Error(`state salah: ${JSON.stringify(p)}`);
        const mapping = await ctx.globalClient.execute({
            sql: "SELECT database_id FROM project_databases WHERE project_id = ?",
            args: [idA1],
        });
        const proj = createClient({ url: String(mapping.rows[0]!.database_id) });
        try {
            const acts = await proj.execute("SELECT action FROM activities WHERE action = 'project.deleted'");
            if (acts.rows.length !== 1)
                throw new Error(`Activity project.deleted tidak tercipta: ${JSON.stringify(acts.rows)}`);
        }
        finally {
            await proj.close();
        }
    });
    it("[INV-LIFE-004] restore setelah DELETED ditolak INVALID_STATE (terminal)", async () => {
        const res = await makeApp().request(`http://localhost/v1/projects/${idA1}/restore`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-test-user": "user-a" },
            body: JSON.stringify({ expectedVersion: 2 }),
        });
        if (res.status !== 409)
            throw new Error(`status ${res.status}, harusnya 409`);
        const json = await res.json();
        if (json.error?.code !== "INVALID_STATE")
            throw new Error(`code ${json.error?.code}`);
    });
    it("[AC-020][INV-07] delete dengan expected_version stale → VERSION_CONFLICT 409 tanpa perubahan state", async () => {
        const res = await del({ expectedVersion: 1 }, "user-a");
        if (res.status !== 409)
            throw new Error(`status ${res.status}, harusnya 409`);
        const json = await res.json();
        if (json.error?.code !== "VERSION_CONFLICT")
            throw new Error(`code ${json.error?.code}`);
        const check = await makeApp().request(`http://localhost/v1/projects/${idA1}`, {
            headers: { "x-test-user": "user-a" },
        });
        const p = (await check.json()).data.project;
        if (p.version !== 2 || p.deletedAt === null)
            throw new Error(`state berubah diam-diam: ${JSON.stringify(p)}`);
    });
    it("[C.4][interim-authz][C.2] non-owner → PERMISSION_DENIED; anonim → TOKEN_EXPIRED; delete ulang → INVALID_STATE", async () => {
        const forbidden = await del({ expectedVersion: 2 }, "user-b");
        if (forbidden.status !== 403)
            throw new Error(`status ${forbidden.status}, harusnya 403`);
        const anon = await del({ expectedVersion: 2 });
        if (anon.status !== 401)
            throw new Error(`status ${anon.status}, harusnya 401`);
        const again = await del({ expectedVersion: 2 }, "user-a");
        if (again.status !== 409)
            throw new Error(`status ${again.status}, harusnya 409 (sudah DELETED)`);
        const json = await again.json();
        if (json.error?.code !== "INVALID_STATE")
            throw new Error(`code ${json.error?.code}`);
    });
});
