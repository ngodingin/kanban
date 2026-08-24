import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import { applyGlobalMigrations, applyProjectMigrations, newProjectId, registerProjectWithOwnerMembership, RequestPipeline, SqliteProjectDatabaseResolver, createEntityPermissionResolver, } from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";
import { createMilestonesRouter, type MilestoneRoutesDeps } from "../src/routes/milestones.ts";
interface TestCtx {
    globalClient: Client;
    deps: MilestoneRoutesDeps;
    dir: string;
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
    const dir = await mkdtemp(join(tmpdir(), "kanban-api-ms-lifecycle-"));
    const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
    await applyGlobalMigrations(globalClient);
    const now = new Date().toISOString();
    for (const user of ["user-a", "user-b"]) {
        await globalClient.execute({
            sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
            args: [user, `${user}@test.local`, user, now, now],
        });
    }
    projectIdValue = `a1-${newProjectId()}`;
    const dbPath = `file:${join(dir, `${projectIdValue}.db`)}`;
    const projectClient = createClient({ url: dbPath });
    await applyProjectMigrations(projectClient);
    await projectClient.execute({
        sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, ?, ?, ?, 1)",
        args: [projectIdValue, "Proj A1", now, now],
    });
    for (const id of ["ms_arc", "ms_res", "ms_del", "ms_term"]) {
        await projectClient.execute({
            sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES (?, ?, NULL, 0, ?, ?, 1)",
            args: [id, `T ${id}`, now, now],
        });
    }
    await projectClient.execute({
        sql: "UPDATE milestones SET archived_at = ? WHERE id = 'ms_res'",
        args: [now],
    });
    await projectClient.execute({
        sql: "UPDATE milestones SET deleted_at = ? WHERE id = 'ms_term'",
        args: [now],
    });
    await projectClient.close();
    await registerProjectWithOwnerMembership(globalClient, {
        projectId: projectIdValue,
        databaseId: dbPath,
        ownerUserId: "user-a",
        now,
    });
    ctx = {
        globalClient,
        dir,
        deps: {
            resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
            newMilestoneId: () => `ms-${Math.random().toString(36).slice(2, 10)}`,
            openProjectContext: async (request, pid) => {
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
    await rm(ctx.dir, { recursive: true, force: true });
});
function makeApp(): Hono {
    return new Hono().route("/", createMilestonesRouter(() => ctx.deps));
}
function post(action: string, milestoneId: string, body: unknown, user = "user-a"): Promise<Response> {
    return makeApp().request(`http://localhost/v1/projects/${projectIdValue}/milestones/${milestoneId}/${action}`, {
        method: "POST",
        headers: { "x-test-user": user, "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}
describe("POST .../milestones/:milestone_id/{archive,restore,delete} — goal 2.3.3", () => {
    it("[A.3][B.5] archive dari ACTIVE → archivedAt terisi + Activity previous_state ACTIVE", async () => {
        const res = await post("archive", "ms_arc", { expectedVersion: 1 });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data.milestone).toMatchObject({ archivedAt: expect.any(String), deletedAt: null, version: 2 });
    });
    it("[A.3] archive ulang dari ARCHIVED → INVALID_STATE 409", async () => {
        const res = await post("archive", "ms_arc", { expectedVersion: 2 });
        expect(res.status).toBe(409);
        expect((await res.json()).error?.code).toBe("INVALID_STATE");
    });
    it("[INV-LIFE-002] restore ARCHIVED saat Project ACTIVE → sukses + Activity previous_state ARCHIVED", async () => {
        const res = await post("restore", "ms_res", { expectedVersion: 1 });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data.milestone.archivedAt).toBeNull();
    });
    it("[INV-LIFE-004] restore milestone DELETED → ditolak (terminal)", async () => {
        const res = await post("restore", "ms_term", { expectedVersion: 1 });
        expect(res.status).toBe(409);
        expect((await res.json()).error?.code).toBe("INVALID_STATE");
    });
    it("[A.3] delete dari ACTIVE → deletedAt terisi + previous_state ACTIVE; delete ulang → INVALID_STATE", async () => {
        const res = await post("delete", "ms_del", { expectedVersion: 1 });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data.milestone.deletedAt).toEqual(expect.any(String));
        const again = await post("delete", "ms_del", { expectedVersion: 2 });
        expect(again.status).toBe(409);
        expect((await again.json()).error?.code).toBe("INVALID_STATE");
    });
    it("[AC-020] version mismatch pada semua action → VERSION_CONFLICT 409", async () => {
        for (const action of ["archive", "restore", "delete"]) {
            const res = await post(action, "ms_arc", { expectedVersion: 9999 });
            expect(res.status, action).toBe(409);
            expect((await res.json()).error?.code, action).toBe("VERSION_CONFLICT");
        }
    });
    it("[C.5] expected_version hilang/salah bentuk → VALIDATION_ERROR 400", async () => {
        for (const body of [{}, { expectedVersion: 0 }, { expectedVersion: "satu" }, null]) {
            const res = await post("archive", "ms_arc", body);
            expect(res.status).toBe(400);
            expect((await res.json()).error?.code).toBe("VALIDATION_ERROR");
        }
    });
    it("[Authz interim] non-Owner member → PERMISSION_DENIED; tanpa identitas → TOKEN_EXPIRED", async () => {
        const dbRow = await ctx.globalClient.execute({
            sql: "SELECT d.database_id AS db FROM project_databases d WHERE d.project_id = ?",
            args: [projectIdValue],
        });
        void dbRow;
        const resDenied = await post("archive", "ms_arc", { expectedVersion: 2 }, "user-b");
        expect(resDenied.status).toBe(403);
        const noIdentity = await makeApp().request(`http://localhost/v1/projects/${projectIdValue}/milestones/ms_arc/archive`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ expectedVersion: 2 }),
        });
        expect(noIdentity.status).toBe(401);
        expect((await noIdentity.json()).error?.code).toBe("TOKEN_EXPIRED");
    });
    it("[C.2] milestone tidak ada → RESOURCE_NOT_FOUND 404", async () => {
        const res = await post("archive", "ms_none", { expectedVersion: 1 });
        expect(res.status).toBe(404);
        expect((await res.json()).error?.code).toBe("RESOURCE_NOT_FOUND");
    });
});
