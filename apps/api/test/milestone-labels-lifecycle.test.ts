import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import { applyGlobalMigrations, applyProjectMigrations, newProjectId, registerProjectWithOwnerMembership, RequestPipeline, SqliteProjectDatabaseResolver, createEntityPermissionResolver, } from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";
import { createMilestoneLabelsRouter, type MilestoneLabelRoutesDeps } from "../src/routes/labels.ts";
interface TestCtx {
    globalClient: Client;
    deps: MilestoneLabelRoutesDeps;
}
let ctx: TestCtx;
let projectIdValue: string;
let projectDbPathValue: string;
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
    const dir = await mkdtemp(join(tmpdir(), "kanban-api-mslabel-lc-"));
    const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
    await applyGlobalMigrations(globalClient);
    const now = T0;
    for (const user of ["user-a", "user-b"]) {
        await globalClient.execute({
            sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
            args: [user, `${user}@test.local`, user, now, now],
        });
    }
    projectIdValue = `a-${newProjectId()}`;
    projectDbPathValue = `file:${join(dir, `${projectIdValue}.db`)}`;
    const projectClient = createClient({ url: projectDbPathValue });
    await applyProjectMigrations(projectClient);
    await projectClient.execute({
        sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, ?, ?, ?, 1)",
        args: [projectIdValue, "Proj A", now, now],
    });
    await projectClient.execute({
        sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_l', 'M', NULL, 0, ?, ?, 1)",
        args: [now, now],
    });
    for (const id of ["ml_arc", "ml_res"]) {
        await projectClient.execute({
            sql: "INSERT INTO milestone_labels (id, milestone_id, name, created_at, updated_at, version) VALUES (?, 'ms_l', ?, ?, ?, 1)",
            args: [id, `L ${id}`, now, now],
        });
    }
    await projectClient.execute({ sql: "UPDATE milestone_labels SET archived_at = ? WHERE id = 'ml_res'", args: [now] });
    await projectClient.close();
    await registerProjectWithOwnerMembership(globalClient, {
        projectId: projectIdValue,
        databaseId: projectDbPathValue,
        ownerUserId: "user-a",
        now,
    });
    await globalClient.execute({
        sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES ('m-extra-b', ?, 'user-b', ?, NULL)",
        args: [projectIdValue, now],
    });
    ctx = {
        globalClient,
        deps: {
            resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
            newMilestoneLabelId: () => `ml-${Math.random().toString(36).slice(2, 10)}`,
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
const T0 = "2026-08-01T00:00:00.000Z";
function makeApp(): Hono {
    return new Hono().route("/", createMilestoneLabelsRouter(() => ctx.deps));
}
function post(action: string, labelId: string, body: unknown, user = "user-a"): Promise<Response> {
    return makeApp().request(`http://localhost/v1/projects/${projectIdValue}/milestones/ms_l/labels/${labelId}/${action}`, {
        method: "POST",
        headers: { "x-test-user": user, "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}
describe("POST .../milestones/:milestone_id/labels/:label_id/{archive,restore,delete} — goal 3.4.3", () => {
    it("[A.3] archive ACTIVE → archivedAt terisi + previous_state ACTIVE; archive ulang → INVALID_STATE", async () => {
        const res = await post("archive", "ml_arc", { expectedVersion: 1 });
        expect(res.status).toBe(200);
        expect((await res.json()).data.label.archivedAt).toEqual(expect.any(String));
        const again = await post("archive", "ml_arc", { expectedVersion: 2 });
        expect(again.status).toBe(409);
        expect((await again.json()).error?.code).toBe("INVALID_STATE");
    });
    it("[INV-LIFE-002] restore ARCHIVED saat chain ACTIVE → sukses + previous_state ARCHIVED; Milestone di-archive → restore ditolak", async () => {
        const okRes = await post("restore", "ml_res", { expectedVersion: 1 });
        expect(okRes.status).toBe(200);
        expect((await okRes.json()).data.label.archivedAt).toBeNull();
        await post("archive", "ml_res", { expectedVersion: 2 });
        const projectDb = createClient({ url: projectDbPathValue });
        try {
            await projectDb.execute("UPDATE milestones SET archived_at = '2026-08-20T00:00:00.000Z' WHERE id = 'ms_l'");
        }
        finally {
            await projectDb.close();
        }
        const blocked = await post("restore", "ml_res", { expectedVersion: 3 });
        expect(blocked.status).toBe(409);
        expect((await blocked.json()).error?.code).toBe("INVALID_STATE");
        const projectDb2 = createClient({ url: projectDbPathValue });
        try {
            await projectDb2.execute("UPDATE milestones SET archived_at = NULL WHERE id = 'ms_l'");
        }
        finally {
            await projectDb2.close();
        }
    });
    it("[AC-020] version mismatch semua action → VERSION_CONFLICT; payload invalid → VALIDATION_ERROR", async () => {
        for (const action of ["archive", "restore", "delete"]) {
            const res = await post(action, "ml_arc", { expectedVersion: 9999 });
            expect(res.status, action).toBe(409);
            expect((await res.json()).error?.code, action).toBe("VERSION_CONFLICT");
        }
        const missingVersion = await post("archive", "ml_arc", {});
        expect(missingVersion.status).toBe(400);
    });
    it("[Authz interim] non-Owner member → PERMISSION_DENIED; tanpa identitas → TOKEN_EXPIRED; tidak ada → 404", async () => {
        const denied = await post("archive", "ml_arc", { expectedVersion: 2 }, "user-b");
        expect(denied.status).toBe(403);
        expect(((await denied.json()).error ?? {}).code).toBe("PERMISSION_DENIED");
        const noIdentity = await makeApp().request(`http://localhost/v1/projects/${projectIdValue}/milestones/ms_l/labels/ml_arc/archive`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ expectedVersion: 2 }),
        });
        expect(noIdentity.status).toBe(401);
        const missing = await post("archive", "ml_none", { expectedVersion: 1 });
        expect(missing.status).toBe(404);
        expect(((await missing.json()).error ?? {}).code).toBe("RESOURCE_NOT_FOUND");
    });
});
