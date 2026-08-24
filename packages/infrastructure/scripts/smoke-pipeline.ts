import { createClient } from "@libsql/client";
import { applyGlobalMigrations, applyProjectMigrations } from "../src/database/migrate.ts";
import { createAuth } from "../src/auth/auth.ts";
import { BetterAuthIdentityResolver } from "../src/auth/resolve-identity.ts";
import { registerProject, recordProjectDatabaseMapping } from "./smoke-global-store-helpers.ts";
import { SqliteProjectDatabaseResolver, type ProjectDatabaseResolver } from "../src/database/project-resolver.ts";
import { RequestPipeline } from "../src/pipeline/pipeline.ts";
import { PipelineError } from "../src/pipeline/errors.ts";
const gUrl = process.env.GLOBAL_DB_URL;
const gToken = process.env.GLOBAL_DB_TOKEN;
if (!gUrl || !gToken) {
    console.log("SKIP: GLOBAL_DB_URL/GLOBAL_DB_TOKEN tidak ada");
    process.exit(0);
}
const globalClient = createClient({ url: gUrl, authToken: gToken });
let failed = 0;
const fail = (name: string, msg: string): void => {
    failed++;
    console.log(`FAIL ${name}: ${msg}`);
};
const pass = (name: string, msg: string): void => {
    console.log(`PASS: ${name} — ${msg}`);
};
const assert = (cond: boolean, name: string, msg: string): void => cond ? pass(name, msg) : fail(name, msg);
async function signCookieValue(value: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
    return `${value}.${Buffer.from(new Uint8Array(sig)).toString("base64")}`;
}
const ts = Date.now();
const suffix = `pipe-${ts}`;
const projectA = `pa-${suffix}`;
const projectB = `pb-${suffix}`;
const projectUnknown = `pz-${suffix}`;
const userA = `ua-${suffix}`;
const userB = `ub-${suffix}`;
const userX = `ux-${suffix}`;
const dbA = `file:/tmp/kanban-pipeline-a-${ts}.db`;
const dbB = `file:/tmp/kanban-pipeline-b-${ts}.db`;
try {
    await applyGlobalMigrations(globalClient);
    const auth = createAuth({
        globalClient,
        baseUrl: "http://localhost:3000",
        secret: "x".repeat(32),
    });
    const ctx = await auth.$context;
    const now = new Date();
    const nowIso = now.toISOString();
    const makeUser = async (id: string, name: string) => {
        await ctx.internalAdapter.createUser({
            id,
            name,
            email: `${id}@smoke.local`,
            emailVerified: true,
            image: null,
            createdAt: now,
            updatedAt: now,
        });
        const session = await ctx.internalAdapter.createSession(id, false);
        return `kanban.session_token=${encodeURIComponent(await signCookieValue(session.token, "x".repeat(32)))}`;
    };
    const cookieA = await makeUser(userA, "User A");
    const cookieB = await makeUser(userB, "User B");
    const cookieX = await makeUser(userX, "User X");
    await registerProject(globalClient, { projectId: projectA, ownerUserId: userA, now: nowIso });
    await registerProject(globalClient, { projectId: projectB, ownerUserId: userB, now: nowIso });
    await recordProjectDatabaseMapping(globalClient, { projectId: projectA, databaseId: dbA, now: nowIso });
    await recordProjectDatabaseMapping(globalClient, { projectId: projectB, databaseId: dbB, now: nowIso });
    const insertMembership = async (projectId: string, userId: string, revokedAt: string | null) => {
        await globalClient.execute({
            sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES (?, ?, ?, ?, ?)",
            args: [`m-${projectId}-${userId}`, projectId, userId, nowIso, revokedAt],
        });
    };
    await insertMembership(projectA, userA, null);
    await insertMembership(projectB, userB, null);
    await insertMembership(projectA, userX, nowIso);
    for (const db of [dbA, dbB]) {
        const proj = createClient({ url: db });
        await applyProjectMigrations(proj);
        await proj.close();
    }
    const baseResolver = new SqliteProjectDatabaseResolver(globalClient);
    const resolveCalls: string[] = [];
    const spyResolver: ProjectDatabaseResolver = {
        async resolve(projectId: string) {
            resolveCalls.push(projectId);
            return baseResolver.resolve(projectId);
        },
    };
    const pipeline = new RequestPipeline({
        identityResolver: new BetterAuthIdentityResolver(auth),
        globalClient,
        databaseResolver: spyResolver,
        projectClientFactory: {
            create(databaseId: string) {
                return createClient({ url: databaseId });
            },
        },
    });
    const ctxA = await pipeline.run(new Request("http://localhost:3000/api/v1/projects/x", { headers: { cookie: cookieA } }), projectA);
    assert(ctxA.identity.userId === userA, "pipe-identity", "identity ter-resolve dari session");
    assert(ctxA.project.id === projectA && ctxA.membership.userId === userA, "pipe-project-membership", "project + membership valid dimuat");
    const ping = await ctxA.database.execute("SELECT 1");
    assert(ping.rows.length === 1, "pipe-db", "DB Project ter-resolve hanya setelah membership (A.4) dan siap query");
    assert(ctxA.permission === null, "pipe-permission-seam", "permission seam kosong (Phase 4)");
    await expectReject(pipeline.run(new Request("http://localhost:3000/api/v1/projects/x"), projectA), "TOKEN_EXPIRED", 401, "pipe-anonymous", "tanpa identitas -> TOKEN_EXPIRED 401");
    await expectReject(pipeline.run(new Request("http://localhost:3000/api/v1/projects/x", { headers: { cookie: "kanban.session_token=bad" } }), projectA), "TOKEN_EXPIRED", 401, "pipe-invalid-cookie", "cookie invalid -> TOKEN_EXPIRED 401");
    await expectReject(pipeline.run(new Request("http://localhost:3000/api/v1/projects/x", { headers: { cookie: cookieB } }), projectA), "PROJECT_ACCESS_DENIED", 403, "pipe-no-membership", "user B ke Project A tanpa membership -> PROJECT_ACCESS_DENIED 403");
    await expectReject(pipeline.run(new Request("http://localhost:3000/api/v1/projects/x", { headers: { cookie: cookieA } }), projectB), "PROJECT_ACCESS_DENIED", 403, "pipe-cross-project", "user A ke Project B (bukan anggota) -> PROJECT_ACCESS_DENIED 403");
    assert(!resolveCalls.includes(projectB), "pipe-cross-project-no-db", "DB Project B TIDAK pernah di-resolve untuk user A (tidak ada bypass A.4)");
    await expectReject(pipeline.run(new Request("http://localhost:3000/api/v1/projects/x", { headers: { cookie: cookieA } }), projectUnknown), "RESOURCE_NOT_FOUND", 404, "pipe-unknown-project", "project tidak dikenal -> RESOURCE_NOT_FOUND 404");
    await expectReject(pipeline.run(new Request("http://localhost:3000/api/v1/projects/x", { headers: { cookie: cookieX } }), projectA), "PROJECT_ACCESS_DENIED", 403, "pipe-revoked-membership", "membership revoked -> PROJECT_ACCESS_DENIED 403");
    async function expectReject(promise: Promise<unknown>, code: string, status: number, name: string, msg: string) {
        try {
            await promise;
            fail(name, msg);
        }
        catch (e) {
            if (e instanceof PipelineError && e.code === code && e.httpStatus === status)
                pass(name, msg);
            else
                fail(name, `${msg} (dapat: ${String(e)})`);
        }
    }
}
catch (e) {
    fail("exception", String(e));
}
finally {
    for (const id of [projectA, projectB, projectUnknown]) {
        await globalClient.execute({ sql: "DELETE FROM project_memberships WHERE project_id = ?", args: [id] });
        await globalClient.execute({ sql: "DELETE FROM project_databases WHERE project_id = ?", args: [id] });
        await globalClient.execute({ sql: "DELETE FROM projects WHERE id = ?", args: [id] });
    }
    for (const id of [userA, userB, userX]) {
        await globalClient.execute({ sql: "DELETE FROM auth_sessions WHERE user_id = ?", args: [id] });
        await globalClient.execute({ sql: "DELETE FROM users WHERE id = ?", args: [id] });
    }
    await globalClient.close();
}
if (failed > 0) {
    console.log(`smoke pipeline GAGAL (${failed} kegagalan)`);
    process.exit(1);
}
console.log("smoke pipeline selesai");
