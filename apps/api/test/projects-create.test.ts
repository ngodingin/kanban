import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import { applyGlobalMigrations, applyProjectMigrations, newProjectId, registerProjectWithOwnerMembership, } from "@kanban/infrastructure";
import { createProjectsRouter, type ProjectRoutesDeps } from "../src/routes/projects.ts";
interface TestCtx {
    globalClient: Client;
    deps: ProjectRoutesDeps;
    dir: string;
}
let ctx: TestCtx;
beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), "kanban-api-projects-"));
    const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
    await applyGlobalMigrations(globalClient);
    const now = new Date().toISOString();
    await globalClient.execute({
        sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES ('user-owner', 'owner@test.local', 1, 'Test Owner', ?, ?)",
        args: [now, now],
    });
    const fakeProvision = async (input: {
        projectId: string;
        projectName: string;
        creatorUserId: string;
    }) => {
        const dbPath = `file:${join(dir, `${input.projectId}.db`)}`;
        const projectClient = createClient({ url: dbPath });
        await applyProjectMigrations(projectClient);
        const ts = new Date().toISOString();
        await projectClient.execute({
            sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, ?, ?, ?, 1)",
            args: [input.projectId, input.projectName, ts, ts],
        });
        await projectClient.execute({
            sql: "INSERT INTO activities (id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at) VALUES (?, 'project', ?, 1, ?, 'project.created', ?, ?)",
            args: [newProjectId(), input.projectId, input.creatorUserId, JSON.stringify({ snapshot: { name: input.projectName } }), ts],
        });
        await projectClient.close();
        await registerProjectWithOwnerMembership(globalClient, {
            projectId: input.projectId,
            databaseId: dbPath,
            ownerUserId: input.creatorUserId,
            now: ts,
        });
    };
    ctx = {
        globalClient,
        dir,
        deps: {
            resolveIdentity: async (request) => {
                const userId = request.headers.get("x-test-user");
                if (userId === null)
                    return null;
                return {
                    type: "session",
                    userId,
                    email: "owner@test.local",
                    name: "Test Owner",
                    emailVerified: true,
                    image: null,
                };
            },
            newProjectId,
            createProject: fakeProvision,
        },
    };
});
afterAll(async () => {
    await ctx.globalClient.close();
    await rm(ctx.dir, { recursive: true, force: true });
});
function makeApp(deps: ProjectRoutesDeps = ctx.deps): Hono {
    return new Hono().route("/", createProjectsRouter(() => deps));
}
async function post(app: Hono, body?: unknown, headers: Record<string, string> = {}) {
    return app.request("http://localhost/v1/projects", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}
describe("POST /api/v1/projects — endpoint provisioning (goal 1.3.1)", () => {
    it("[C.4][F.2] POST valid oleh user teridentifikasi menghasilkan registry READY + Owner Membership + Project DB ACTIVE + Activity project.created", async () => {
        const res = await post(makeApp(), { name: "  Proyek Uji Endpoint  " }, { "x-test-user": "user-owner" });
        if (res.status !== 201)
            throw new Error(`status ${res.status}: ${await res.text()}`);
        const json = await res.json();
        const data = json.data;
        if (typeof data.id !== "string" || data.id.length !== 26)
            throw new Error(`project_id bukan ULID: ${data.id}`);
        if (data.name !== "Proyek Uji Endpoint")
            throw new Error(`name tidak di-trim: ${data.name}`);
        if (data.status !== "ACTIVE" || data.version !== 1)
            throw new Error(`status/version salah: ${JSON.stringify(data)}`);
        const reg = await ctx.globalClient.execute({
            sql: "SELECT owner_user_id, provisioning_state FROM projects WHERE id = ?",
            args: [data.id],
        });
        if (reg.rows.length !== 1)
            throw new Error("registry tidak tercatat");
        if (reg.rows[0]!.provisioning_state !== "READY" || reg.rows[0]!.owner_user_id !== "user-owner") {
            throw new Error(`registry salah: ${JSON.stringify(reg.rows[0])}`);
        }
        const member = await ctx.globalClient.execute({
            sql: "SELECT user_id, revoked_at FROM project_memberships WHERE project_id = ?",
            args: [data.id],
        });
        if (member.rows.length !== 1 || member.rows[0]!.user_id !== "user-owner" || member.rows[0]!.revoked_at !== null) {
            throw new Error(`membership tidak sesuai Owner: ${JSON.stringify(member.rows)}`);
        }
        const mapping = await ctx.globalClient.execute({
            sql: "SELECT database_id FROM project_databases WHERE project_id = ?",
            args: [data.id],
        });
        if (mapping.rows.length !== 1)
            throw new Error("mapping DB tidak tercatat");
        const projectDbUrl = String(mapping.rows[0]!.database_id);
        const proj = createClient({ url: projectDbUrl });
        try {
            const state = await proj.execute({
                sql: "SELECT name, version, archived_at, deleted_at FROM project_state WHERE project_id = ?",
                args: [data.id],
            });
            const row = state.rows[0];
            if (!row || row.name !== "Proyek Uji Endpoint" || row.version !== 1 || row.archived_at !== null || row.deleted_at !== null) {
                throw new Error(`project_state tidak ACTIVE v1: ${JSON.stringify(state.rows)}`);
            }
            const acts = await proj.execute({
                sql: "SELECT action, actor_user_id FROM activities WHERE entity_id = ?",
                args: [data.id],
            });
            if (acts.rows.length !== 1 || acts.rows[0]!.action !== "project.created" || acts.rows[0]!.actor_user_id !== "user-owner") {
                throw new Error(`Activity project.created tidak tercipta: ${JSON.stringify(acts.rows)}`);
            }
        }
        finally {
            await proj.close();
        }
    });
    it("[C.2][C.4] POST tanpa identitas ditolak TOKEN_EXPIRED 401 dengan envelope error kanonik", async () => {
        const res = await post(makeApp(), { name: "Tanpa Identitas" });
        if (res.status !== 401)
            throw new Error(`status ${res.status}`);
        const json = await res.json();
        if (json.error?.code !== "TOKEN_EXPIRED" || typeof json.error.message !== "string") {
            throw new Error(`envelope error tidak sesuai C.2: ${JSON.stringify(json)}`);
        }
        if (typeof json.data !== "undefined")
            throw new Error("error envelope tidak boleh punya data");
    });
    it("[C.2][C.5] POST payload invalid (bukan objek / name non-string / kosong / >255) ditolak VALIDATION_ERROR tanpa efek provisioning", async () => {
        let provisionCalls = 0;
        const app = makeApp({
            ...ctx.deps,
            createProject: async (input) => {
                provisionCalls++;
                return ctx.deps.createProject(input);
            },
        });
        for (const [label, body] of [
            ["body array", ["nama"]],
            ["body null", null],
            ["name number", { name: 123 }],
            ["name kosong", { name: "   " }],
            ["name >255", { name: "a".repeat(256) }],
        ] as const) {
            const res = await post(app, body as unknown, { "x-test-user": "user-owner" });
            if (res.status !== 400)
                throw new Error(`${label}: status ${res.status}, harusnya 400`);
            const json = await res.json();
            if (json.error?.code !== "VALIDATION_ERROR")
                throw new Error(`${label}: code ${json.error?.code}`);
        }
        if (provisionCalls !== 0)
            throw new Error(`provisioning terpanggil ${provisionCalls}x untuk payload invalid`);
    });
    it("[C.3] Idempotency-Key dibaca; perilaku minimal Phase 1: request ulang dengan key sama tetap diproses sebagai project baru", async () => {
        let calls = 0;
        const app = makeApp({
            ...ctx.deps,
            createProject: async (input) => {
                calls++;
                return ctx.deps.createProject(input);
            },
        });
        for (const _ of [0, 1]) {
            void _;
            const res = await post(app, { name: "Duplikat Key" }, { "Idempotency-Key": "key-sama", "x-test-user": "user-owner" });
            if (res.status !== 201)
                throw new Error(`status ${res.status}`);
        }
        if (calls !== 2)
            throw new Error(`createProject dipanggil ${calls}x, harusnya 2 (belum ada dedupe store di Phase 1)`);
    });
    it("[F.2][C.2 amandemen 2.12.0] kegagalan provisioning mengembalikan envelope error (fallback 500 INTERNAL_ERROR — INVALID_STATE terkunci 409, MUST NOT dipasangkan 500), bukan crash handler", async () => {
        const app = makeApp({
            ...ctx.deps,
            createProject: async () => {
                throw new Error("simulasi Turso down");
            },
        });
        const res = await post(app, { name: "Gagal Provision" }, { "x-test-user": "user-owner" });
        if (res.status !== 500)
            throw new Error(`status ${res.status}`);
        const json = await res.json();
        if (json.error?.code !== "INTERNAL_ERROR")
            throw new Error(`code ${json.error?.code}`);
    });
});
