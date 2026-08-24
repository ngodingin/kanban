import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import { applyGlobalMigrations, applyProjectMigrations, newProjectId, registerProjectWithOwnerMembership, RequestPipeline, SqliteProjectDatabaseResolver, createEntityPermissionResolver, } from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";
import { createCommentsRouter, type CommentRoutesDeps } from "../src/routes/comments.ts";
const T0 = "2026-08-01T00:00:00.000Z";
interface TestCtx {
    globalClient: Client;
    deps: CommentRoutesDeps;
    projectDbPathValue: string;
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
    const dir = await mkdtemp(join(tmpdir(), "kanban-api-comments-edit-"));
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
    const projectDbPathValue = `file:${join(dir, `${projectIdValue}.db`)}`;
    const projectClient = createClient({ url: projectDbPathValue });
    await applyProjectMigrations(projectClient);
    await projectClient.execute({
        sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, ?, ?, ?, 1)",
        args: [projectIdValue, "Proj A", now, now],
    });
    await projectClient.execute({
        sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_1', 'M1', NULL, 0, ?, ?, 1)",
        args: [now, now],
    });
    await projectClient.execute({
        sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('b_1', 'ms_1', 'B1', NULL, ?, ?, 1)",
        args: [now, now],
    });
    await projectClient.execute({
        sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('l_1', 'b_1', 'L1', ?, ?, 1)",
        args: [now, now],
    });
    await projectClient.execute({
        sql: "INSERT INTO cards (id, list_id, creator_user_id, title, created_at, updated_at, version) VALUES ('c_1', 'l_1', 'user-a', 'C1', ?, ?, 2)",
        args: [now, now],
    });
    await projectClient.execute({
        sql: "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES ('act_orig', 'card', 'c_1', 2, 'user-a', 'comment.added', ?, ?)",
        args: [JSON.stringify({ body: "Versi pertama" }), now],
    });
    await projectClient.execute({
        sql: "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES ('act_other_owner', 'card', 'c_1', 2, 'user-b', 'comment.added', ?, ?)",
        args: [JSON.stringify({ body: "Milik user-b" }), now],
    });
    await projectClient.execute({
        sql: "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES ('act_noncomment', 'card', 'c_1', 2, 'user-a', 'card.updated', '{}', ?)",
        args: [now],
    });
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
        projectDbPathValue,
        deps: {
            resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
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
    return new Hono().route("/", createCommentsRouter(() => ctx.deps));
}
async function patchComment(activityId: string, body: string, user = "user-a") {
    return makeApp().request(`http://localhost/v1/projects/${projectIdValue}/cards/c_1/comments/${activityId}`, {
        method: "PATCH",
        headers: { "x-test-user": user, "content-type": "application/json" },
        body: JSON.stringify({ body }),
    });
}
describe("PATCH .../comments/:activity_id — goal 3.12.1", () => {
    it("[BR-031/032] edit comment milik sendiri → 200, Activity BARU comment.edited, Activity comment.added lama TIDAK berubah", async () => {
        const res = await patchComment("act_orig", "Versi kedua");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data.comment).toMatchObject({
            cardId: "c_1",
            before: "Versi pertama",
            after: "Versi kedua",
            commentActivityId: "act_orig",
        });
        expect(json.data.comment.id).not.toBe("act_orig");
        const projectDb = createClient({ url: ctx.projectDbPathValue });
        try {
            const original = (await projectDb.execute("SELECT action, data FROM activities WHERE id = 'act_orig'")).rows[0];
            expect(original).toMatchObject({ action: "comment.added" });
            expect(JSON.parse(String(original!.data))).toEqual({ body: "Versi pertama" });
            const edited = (await projectDb.execute("SELECT action, entity_type, data FROM activities WHERE id = ?", [json.data.comment.id])).rows[0];
            expect(edited).toMatchObject({ action: "comment.edited", entity_type: "card" });
            expect(JSON.parse(String(edited!.data))).toEqual({
                before: "Versi pertama",
                after: "Versi kedua",
                commentActivityId: "act_orig",
            });
        }
        finally {
            await projectDb.close();
        }
    });
    it("[Prinsip #7] edit KEDUA lewat :activity_id original yang sama tetap resolve comment_activity_id original (bukan id edit pertama)", async () => {
        const res = await patchComment("act_orig", "Versi ketiga");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data.comment).toMatchObject({ before: "Versi kedua", after: "Versi ketiga", commentActivityId: "act_orig" });
    });
    it("[Toleran] :activity_id merujuk id comment.edited (bukan original) tetap resolve ke original yang benar + state terkini", async () => {
        const editedIdRes = await patchComment("act_orig", "Versi keempat");
        const editedId = (await editedIdRes.json()).data.comment.id as string;
        const res = await patchComment(editedId, "Versi kelima");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data.comment).toMatchObject({ before: "Versi keempat", after: "Versi kelima", commentActivityId: "act_orig" });
    });
    it("[BR-034A] edit comment milik user lain ditolak — PERMISSION_DENIED 403 (termasuk simulasi Owner edit comment bukan miliknya, dokumentasi invariant Phase 4)", async () => {
        const res = await patchComment("act_other_owner", "coba ubah", "user-a");
        expect(res.status).toBe(403);
        expect((await res.json()).error?.code).toBe("PERMISSION_DENIED");
    });
    it("[Validasi target] activity_id bukan comment.*/bukan milik Card ini → RESOURCE_NOT_FOUND", async () => {
        const nonComment = await patchComment("act_noncomment", "x");
        expect(nonComment.status).toBe(404);
        expect((await nonComment.json()).error?.code).toBe("RESOURCE_NOT_FOUND");
        const missing = await patchComment("act_missing", "x");
        expect(missing.status).toBe(404);
        expect((await missing.json()).error?.code).toBe("RESOURCE_NOT_FOUND");
    });
    it("[D.4 card.is_effectively_active] edit comment pada Card yang sudah ARCHIVED sejak comment dibuat ditolak", async () => {
        const projectDb = createClient({ url: ctx.projectDbPathValue });
        try {
            await projectDb.execute("UPDATE cards SET archived_at = ? WHERE id = 'c_1'", [T0]);
        }
        finally {
            await projectDb.close();
        }
        const res = await patchComment("act_orig", "coba edit setelah archive");
        expect(res.status).toBe(409);
        expect((await res.json()).error?.code).toBe("INVALID_STATE");
        const projectDb2 = createClient({ url: ctx.projectDbPathValue });
        try {
            await projectDb2.execute("UPDATE cards SET archived_at = NULL WHERE id = 'c_1'");
        }
        finally {
            await projectDb2.close();
        }
    });
    it("[Authz + validasi] non-Owner member 403; tanpa identitas 401; body kosong 400", async () => {
        const denied = await patchComment("act_orig", "x", "user-b");
        expect(denied.status).toBe(403);
        expect((await denied.json()).error?.code).toBe("PERMISSION_DENIED");
        const noIdentity = await makeApp().request(`http://localhost/v1/projects/${projectIdValue}/cards/c_1/comments/act_orig`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: "x" }) });
        expect(noIdentity.status).toBe(401);
        const emptyBody = await patchComment("act_orig", "");
        expect(emptyBody.status).toBe(400);
        expect((await emptyBody.json()).error?.code).toBe("VALIDATION_ERROR");
    });
});
