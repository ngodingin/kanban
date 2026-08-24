import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import { applyGlobalMigrations, newProjectId, registerProjectWithOwnerMembership, } from "@kanban/infrastructure";
import { buildProjectAdminDeps } from "../src/project-deps.ts";
import { createProjectAdminRouter } from "../src/routes/project-admin.ts";
interface TestCtx {
    globalClient: Client;
    deps: ReturnType<typeof buildProjectAdminDeps>;
    dir: string;
    projectIdA: string;
}
let ctx: TestCtx;
beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), "kanban-api-invite-accept-"));
    const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
    await applyGlobalMigrations(globalClient);
    const now = new Date().toISOString();
    for (const user of ["user-a", "user-b", "user-c", "user-d"]) {
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
async function makeRouter() {
    return new Hono().route("/", createProjectAdminRouter(() => ctx.deps));
}
function accept(invitationId: string, user: string) {
    return makeRouter().then((router) => router.request(`http://localhost/v1/invitations/${invitationId}/accept`, {
        method: "POST",
        headers: { "x-test-user": user },
    }));
}
async function inviteUser(email: string): Promise<string> {
    const group = await ctx.deps.createPermissionGroup(ctx.projectIdA, { name: `G-${email}`, permissions: [] });
    const created = await ctx.deps.createInvitation(ctx.projectIdA, "user-a", {
        email,
        assignments: [{ groupId: group.id, scopeType: "project", scopeId: ctx.projectIdA }],
    });
    return created.id;
}
describe("POST /invitations/:invitation_id/accept (goal 1.9.2)", () => {
    it("[FR-007][C.13] Positif: accept atomik — membership + group assignments + accepted_at", async () => {
        const invitationId = await inviteUser("user-b@test.local");
        const res = await accept(invitationId, "user-b");
        if (res.status !== 200)
            throw new Error(`status ${res.status}: ${await res.text()}`);
        const json = await res.json();
        const invitation = json.data.invitation;
        if (invitation.id !== invitationId || invitation.acceptedAt === null) {
            throw new Error(`payload salah (C.13 envelope): ${JSON.stringify(json.data)}`);
        }
        const membership = await ctx.globalClient.execute({
            sql: "SELECT id, revoked_at FROM project_memberships WHERE project_id = ? AND user_id = 'user-b'",
            args: [ctx.projectIdA],
        });
        if (membership.rows.length !== 1 || membership.rows[0]!.revoked_at !== null) {
            throw new Error("membership aktif tidak tercipta");
        }
        const membershipId = String(membership.rows[0]!.id);
        const assignments = await ctx.globalClient.execute({
            sql: "SELECT COUNT(*) AS n FROM membership_group_assignments WHERE membership_id = ? AND revoked_at IS NULL",
            args: [membershipId],
        });
        if (Number(assignments.rows[0]!.n) < 1)
            throw new Error("group assignment tidak di-copy ke membership");
        const accepted = await ctx.globalClient.execute({
            sql: "SELECT accepted_at FROM invitations WHERE id = ?",
            args: [invitationId],
        });
        if (accepted.rows[0]!.accepted_at === null)
            throw new Error("accepted_at tidak ter-set");
    });
    it("[C.13] negatif: accept kedua kali → INVITATION_ALREADY_USED", async () => {
        const invitationId = await inviteUser("user-c@test.local");
        const first = await accept(invitationId, "user-c");
        if (first.status !== 200)
            throw new Error(`setup pertama gagal: ${first.status}: ${await first.text()}`);
        const second = await accept(invitationId, "user-c");
        if (second.status !== 409 || (await second.json()).error.code !== "INVITATION_ALREADY_USED") {
            throw new Error(`harusnya 409 INVITATION_ALREADY_USED, dapat ${second.status}: ${await second.text()}`);
        }
    });
    it("[C.13] negatif: invitation expired → INVITATION_EXPIRED dan tidak ada efek samping", async () => {
        const group = await ctx.deps.createPermissionGroup(ctx.projectIdA, { name: "G-expired", permissions: [] });
        const invitationId = (await ctx.deps.createInvitation(ctx.projectIdA, "user-a", {
            email: "user-d@test.local",
            assignments: [{ groupId: group.id, scopeType: "project", scopeId: ctx.projectIdA }],
        })).id;
        await ctx.globalClient.execute({
            sql: "UPDATE invitations SET expires_at = ? WHERE id = ?",
            args: [new Date(Date.now() - 60000).toISOString(), invitationId],
        });
        const res = await accept(invitationId, "user-d");
        if (res.status !== 409 || (await res.json()).error.code !== "INVITATION_EXPIRED") {
            throw new Error(`harusnya 409 INVITATION_EXPIRED, dapat ${res.status}: ${await res.text()}`);
        }
        const memberships = await ctx.globalClient.execute({
            sql: "SELECT COUNT(*) AS n FROM project_memberships WHERE user_id = 'user-d'",
            args: [],
        });
        if (Number(memberships.rows[0]!.n) !== 0)
            throw new Error("accept expired membuat membership — efek samping!");
    });
    it("[C.13] negatif: revoked → INVALID_STATE; unknown id → RESOURCE_NOT_FOUND", async () => {
        const invitationId = await inviteUser("user-d@test.local");
        await ctx.globalClient.execute({
            sql: "UPDATE invitations SET revoked_at = ? WHERE id = ?",
            args: [new Date().toISOString(), invitationId],
        });
        const res = await accept(invitationId, "user-d");
        if (res.status !== 409 || (await res.json()).error.code !== "INVALID_STATE") {
            throw new Error(`revoked harusnya 409 INVALID_STATE, dapat ${res.status}`);
        }
        const missing = await accept("inv-tak-ada", "user-d");
        if (missing.status !== 404 || (await missing.json()).error.code !== "RESOURCE_NOT_FOUND") {
            throw new Error(`unknown harusnya 404, dapat ${missing.status}`);
        }
    });
    it("[INV-04][UNIQUE] negatif: pemanggil sudah member Project ini → INVALID_STATE tanpa duplikat", async () => {
        const invitationId = await inviteUser("user-a@test.local");
        const res = await accept(invitationId, "user-a");
        if (res.status !== 409 || (await res.json()).error.code !== "INVALID_STATE") {
            throw new Error(`harusnya 409 INVALID_STATE, dapat ${res.status}: ${await res.text()}`);
        }
        const memberships = await ctx.globalClient.execute({
            sql: "SELECT COUNT(*) AS n FROM project_memberships WHERE project_id = ? AND user_id = 'user-a'",
            args: [ctx.projectIdA],
        });
        if (Number(memberships.rows[0]!.n) !== 1)
            throw new Error("membership Owner terduplikasi");
    });
});
