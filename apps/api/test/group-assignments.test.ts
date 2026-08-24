import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import { applyGlobalMigrations, newProjectId, registerProjectWithOwnerMembership, } from "@kanban/infrastructure";
import { buildProjectAdminDeps, type ProjectAdminDepsInput } from "../src/project-deps.ts";
import { createProjectAdminRouter } from "../src/routes/project-admin.ts";
interface TestCtx {
    globalClient: Client;
    deps: ReturnType<typeof buildProjectAdminDeps>;
    dir: string;
    projectIdA: string;
}
let ctx: TestCtx;
let membershipIdB = "";
const projectIdB = `pg-b-${newProjectId()}`;
function makeIdentityResolver(): ProjectAdminDepsInput["identityResolver"] {
    return {
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
    };
}
beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), "kanban-api-gassign-"));
    const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
    await applyGlobalMigrations(globalClient);
    const now = new Date().toISOString();
    for (const user of ["user-a", "user-b", "user-c"]) {
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
    membershipIdB = `m-b-${projectIdA}`;
    await globalClient.execute({
        sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES (?, ?, 'user-b', ?, NULL)",
        args: [membershipIdB, projectIdA, now],
    });
    await registerProjectWithOwnerMembership(globalClient, {
        projectId: projectIdB,
        databaseId: `file:${join(dir, "unused-b.db")}`,
        ownerUserId: "user-c",
        now,
    });
    ctx = { globalClient, dir, projectIdA, deps: buildProjectAdminDeps({ identityResolver: makeIdentityResolver(), globalClient }) };
});
afterAll(async () => {
    await ctx.globalClient.close();
    await rm(ctx.dir, { recursive: true, force: true });
});
async function makeRouter() {
    return new Hono().route("/", createProjectAdminRouter(() => ctx.deps));
}
async function assign(projectId: string, membershipId: string, body: unknown, user: string) {
    return (await makeRouter()).request(`http://localhost/v1/projects/${projectId}/members/${membershipId}/group-assignments`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": user },
        body: JSON.stringify(body),
    });
}
async function revoke(projectId: string, membershipId: string, assignmentId: string, user: string) {
    return (await makeRouter()).request(`http://localhost/v1/projects/${projectId}/members/${membershipId}/group-assignments/${assignmentId}/revoke`, {
        method: "POST",
        headers: { "x-test-user": user },
    });
}
describe("group-assignments endpoints (goal 1.8.1)", () => {
    let groupId = "";
    let groupIdDeleted = "";
    let groupIdB = "";
    beforeAll(async () => {
        groupId = (await ctx.deps.createPermissionGroup(ctx.projectIdA, { name: "G-A1", permissions: [] })).id;
        groupIdB = (await ctx.deps.createPermissionGroup(projectIdB, { name: "G-B", permissions: [] })).id;
        groupIdDeleted = (await ctx.deps.createPermissionGroup(ctx.projectIdA, { name: "G-Del", permissions: [] })).id;
        await ctx.globalClient.execute({
            sql: "UPDATE permission_groups SET deleted_at = ? WHERE id = ?",
            args: [new Date().toISOString(), groupIdDeleted],
        });
    });
    it("[BR-042][C.12] Positif: assign project-scope ke membership → 201, row tercatat", async () => {
        const res = await assign(ctx.projectIdA, membershipIdB, { groupId: groupId, scopeType: "project", scopeId: ctx.projectIdA }, "user-a");
        if (res.status !== 201)
            throw new Error(`status ${res.status}: ${await res.text()}`);
        const json = await res.json();
        if (json.data.assignment.groupId !== groupId || json.data.assignment.revokedAt !== null) {
            throw new Error(`payload salah: ${JSON.stringify(json.data)}`);
        }
        const rows = await ctx.globalClient.execute({
            sql: "SELECT COUNT(*) AS n FROM membership_group_assignments WHERE membership_id = ? AND group_id = ? AND revoked_at IS NULL",
            args: [membershipIdB, groupId],
        });
        if (Number(rows.rows[0]!.n) !== 1)
            throw new Error("row assignment tidak tersimpan");
    });
    it("[C.12][UNIQUE] negatif: duplikat aktif → INVALID_STATE 409", async () => {
        const res = await assign(ctx.projectIdA, membershipIdB, { groupId: groupId, scopeType: "project", scopeId: ctx.projectIdA }, "user-a");
        if (res.status !== 409)
            throw new Error(`harusnya 409, dapat ${res.status}: ${await res.text()}`);
        const json = await res.json();
        if (json.error.code !== "INVALID_STATE")
            throw new Error(`kode salah: ${JSON.stringify(json)}`);
    });
    it("[INV-04] negatif: membership Project lain lewat path Project ini → RESOURCE_NOT_FOUND", async () => {
        const ownerBMembership = `m-owner-${projectIdB}`;
        const res = await assign(ctx.projectIdA, ownerBMembership, { groupId: groupIdB, scopeType: "project", scopeId: ctx.projectIdA }, "user-a");
        if (res.status !== 404)
            throw new Error(`harusnya 404, dapat ${res.status}`);
        const json = await res.json();
        if (json.error.code !== "RESOURCE_NOT_FOUND")
            throw new Error(`kode salah: ${JSON.stringify(json)}`);
    });
    it("[BR-042B] negatif: scope_type non-project dan scope_id != project_id → INVALID_STATE", async () => {
        const g2 = (await ctx.deps.createPermissionGroup(ctx.projectIdA, { name: "G-A2", permissions: [] })).id;
        for (const body of [
            { groupId: g2, scopeType: "board", scopeId: ctx.projectIdA },
            { groupId: g2, scopeType: "project", scopeId: "proj-lain" },
        ]) {
            const res = await assign(ctx.projectIdA, membershipIdB, body, "user-a");
            if (res.status !== 409)
                throw new Error(`body ${JSON.stringify(body)} harusnya 409, dapat ${res.status}`);
        }
    });
    it("[BR-042B] negatif: group lintas-Project atau soft-deleted → RESOURCE_NOT_FOUND", async () => {
        for (const gid of [groupIdB, groupIdDeleted]) {
            const res = await assign(ctx.projectIdA, membershipIdB, { groupId: gid, scopeType: "project", scopeId: ctx.projectIdA }, "user-a");
            if (res.status !== 404)
                throw new Error(`group ${gid} harusnya 404, dapat ${res.status}`);
        }
    });
    it("[C.12] revoke: revoked_at ter-set, row tetap ada; re-revoke idempotent", async () => {
        const g3 = (await ctx.deps.createPermissionGroup(ctx.projectIdA, { name: "G-Revoke", permissions: [] })).id;
        const created = await assign(ctx.projectIdA, membershipIdB, { groupId: g3, scopeType: "project", scopeId: ctx.projectIdA }, "user-a");
        const assignmentId = (await created.json()).data.assignment.id;
        const first = await revoke(ctx.projectIdA, membershipIdB, assignmentId, "user-a");
        if (first.status !== 200)
            throw new Error(`revoke status ${first.status}: ${await first.text()}`);
        const revokedAt = (await first.json()).data.assignment.revokedAt;
        if (revokedAt === null)
            throw new Error("revoked_at tidak ter-set");
        const rows = await ctx.globalClient.execute({
            sql: "SELECT revoked_at FROM membership_group_assignments WHERE id = ?",
            args: [assignmentId],
        });
        if (rows.rows[0]!.revoked_at !== revokedAt)
            throw new Error("revoked_at di DB tidak cocok");
        const second = await revoke(ctx.projectIdA, membershipIdB, assignmentId, "user-a");
        if (second.status !== 200)
            throw new Error(`re-revoke status ${second.status}`);
        const againAt = (await second.json()).data.assignment.revokedAt;
        if (againAt !== revokedAt)
            throw new Error(`timestamp berubah pada re-revoke: ${againAt} vs ${revokedAt}`);
        const reassign = await assign(ctx.projectIdA, membershipIdB, { groupId: g3, scopeType: "project", scopeId: ctx.projectIdA }, "user-a");
        if (reassign.status !== 201)
            throw new Error(`re-assign setelah revoke gagal: ${reassign.status}: ${await reassign.text()}`);
    });
    it("[Rule-3] negatif: non-Owner assign/revoke → PERMISSION_DENIED 403", async () => {
        const res = await assign(ctx.projectIdA, membershipIdB, { groupId: groupId, scopeType: "project", scopeId: ctx.projectIdA }, "user-b");
        if (res.status !== 403)
            throw new Error(`harusnya 403, dapat ${res.status}: ${await res.text()}`);
        const json = await res.json();
        if (json.error.code !== "PERMISSION_DENIED")
            throw new Error(`kode salah: ${JSON.stringify(json)}`);
        const anyAssignment = await ctx.globalClient.execute({
            sql: "SELECT id FROM membership_group_assignments WHERE group_id = ? LIMIT 1",
            args: [groupId],
        });
        if (anyAssignment.rows.length > 0) {
            const rev = await revoke(ctx.projectIdA, membershipIdB, String(anyAssignment.rows[0]!.id), "user-b");
            if (rev.status !== 403)
                throw new Error(`revoke non-owner harusnya 403, dapat ${rev.status}`);
        }
    });
});
