import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import { applyGlobalMigrations, newProjectId, registerProjectWithOwnerMembership, } from "@kanban/infrastructure";
import { buildProjectAdminDeps } from "../src/project-deps.ts";
import { createProjectAdminRouter, type ProjectAdminRoutesDeps } from "../src/routes/project-admin.ts";
interface TestCtx {
    globalClient: Client;
    deps: ProjectAdminRoutesDeps;
    dir: string;
    projectIdA: string;
}
let ctx: TestCtx;
const projectIdB = `pg-b-${newProjectId()}`;
beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), "kanban-api-pgroup-delete-"));
    const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
    await applyGlobalMigrations(globalClient);
    const now = new Date().toISOString();
    for (const user of ["user-a", "user-b"]) {
        await globalClient.execute({
            sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
            args: [user, `${user}@test.local`, user, now, now],
        });
    }
    const projectIdA = `pg-a-${newProjectId()}`;
    await registerProjectWithOwnerMembership(globalClient, {
        projectId: projectIdA,
        databaseId: `file:${join(dir, "unused-a.db")}`,
        ownerUserId: "user-a",
        now,
    });
    await globalClient.execute({
        sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES (?, ?, 'user-b', ?, NULL)",
        args: [`m-b-${projectIdA}`, projectIdA, now],
    });
    await registerProjectWithOwnerMembership(globalClient, {
        projectId: projectIdB,
        databaseId: `file:${join(dir, "unused-b.db")}`,
        ownerUserId: "user-b",
        now,
    });
    ctx = {
        globalClient,
        dir,
        projectIdA,
        deps: buildProjectAdminDeps({
            identityResolver: {
                resolveIdentity: async (request) => {
                    const userId = request.headers.get("x-test-user");
                    if (userId === null)
                        return null;
                    return {
                        type: "session",
                        userId,
                        email: `${userId}@test.local`,
                        name: userId,
                        emailVerified: true,
                        image: null,
                    };
                },
            },
            globalClient,
        }),
    };
});
afterAll(async () => {
    await ctx.globalClient.close();
    await rm(ctx.dir, { recursive: true, force: true });
});
function makeApp(): Hono {
    return new Hono().route("/", createProjectAdminRouter(() => ctx.deps));
}
function deleteGroup(projectId: string, groupId: string, user: string) {
    return makeApp().request(`http://localhost/v1/projects/${projectId}/permission-groups/${groupId}/delete`, {
        method: "POST",
        headers: { "x-test-user": user },
    });
}
describe("POST /api/v1/projects/:project_id/permission-groups/:group_id/delete (goal 1.7.4)", () => {
    let groupId = "";
    let groupIdB = "";
    beforeAll(async () => {
        const created = await ctx.deps.createPermissionGroup(ctx.projectIdA, {
            name: "Dihapus Nanti",
            permissions: [],
        });
        groupId = created.id;
        await ctx.globalClient.execute({
            sql: "INSERT INTO membership_group_assignments (id, membership_id, group_id, scope_type, scope_id, created_at, revoked_at) VALUES (?, ?, ?, 'project', ?, ?, NULL)",
            args: [`asg-${groupId}`, `m-b-${ctx.projectIdA}`, groupId, ctx.projectIdA, new Date().toISOString()],
        });
        const createdB = await ctx.deps.createPermissionGroup(projectIdB, {
            name: "Group Milik B",
            permissions: [],
        });
        groupIdB = createdB.id;
    });
    it("[BR-041][C.12] Owner soft-delete: deleted_at ter-set, hilang dari default list, riwayat assignment utuh", async () => {
        const res = await deleteGroup(ctx.projectIdA, groupId, "user-a");
        if (res.status !== 200)
            throw new Error(`status ${res.status}: ${await res.text()}`);
        const json = await res.json();
        if (json.data.group.deletedAt === null)
            throw new Error("deleted_at tidak ter-set");
        const active = await ctx.deps.listPermissionGroups(ctx.projectIdA, "user-a", { includeDeleted: false });
        if (active.some((g) => g.id === groupId))
            throw new Error("group terhapus masih di default list");
        const all = await ctx.deps.listPermissionGroups(ctx.projectIdA, "user-a", { includeDeleted: true });
        const deleted = all.find((g) => g.id === groupId);
        if (!deleted || deleted.deletedAt === null)
            throw new Error("group tidak muncul di include_deleted");
        const assignments = await ctx.globalClient.execute({
            sql: "SELECT COUNT(*) AS n FROM membership_group_assignments WHERE group_id = ? AND revoked_at IS NULL",
            args: [groupId],
        });
        if (Number(assignments.rows[0]!.n) !== 1) {
            throw new Error(`riwayat assignment harusnya utuh 1 row: ${Number(assignments.rows[0]!.n)}`);
        }
    });
    it("[Rule-3] negatif: non-Owner ditolak 403 PERMISSION_DENIED", async () => {
        const victim = await ctx.deps.createPermissionGroup(ctx.projectIdA, {
            name: "Cuma Owner",
            permissions: [],
        });
        const res = await deleteGroup(ctx.projectIdA, victim.id, "user-b");
        if (res.status !== 403)
            throw new Error(`harusnya 403, dapat ${res.status}: ${await res.text()}`);
        const json = await res.json();
        if (json.error.code !== "PERMISSION_DENIED")
            throw new Error(`kode salah: ${JSON.stringify(json)}`);
        const check = await ctx.globalClient.execute({
            sql: "SELECT deleted_at FROM permission_groups WHERE id = ?",
            args: [victim.id],
        });
        if (check.rows[0]!.deleted_at !== null)
            throw new Error("group ikut terhapus pada percobaan non-Owner");
    });
    it("[C.12] negatif: group sudah ter-delete → RESOURCE_NOT_FOUND 404", async () => {
        const res = await deleteGroup(ctx.projectIdA, groupId, "user-a");
        if (res.status !== 404)
            throw new Error(`harusnya 404, dapat ${res.status}`);
        const json = await res.json();
        if (json.error.code !== "RESOURCE_NOT_FOUND")
            throw new Error(`kode salah: ${JSON.stringify(json)}`);
    });
    it("[INV-04] negatif: group milik Project lain lewat path Project ini → 404, group B utuh", async () => {
        const res = await deleteGroup(ctx.projectIdA, groupIdB, "user-a");
        if (res.status !== 404)
            throw new Error(`harusnya 404, dapat ${res.status}`);
        const check = await ctx.globalClient.execute({
            sql: "SELECT deleted_at FROM permission_groups WHERE id = ?",
            args: [groupIdB],
        });
        if (check.rows[0]!.deleted_at !== null)
            throw new Error("group Project B ikut terhapus — boundary bocor");
    });
    it("[C.12] negatif: group tidak dikenal → 404", async () => {
        const res = await deleteGroup(ctx.projectIdA, "grp-tidak-ada", "user-a");
        if (res.status !== 404)
            throw new Error(`harusnya 404, dapat ${res.status}`);
    });
});
