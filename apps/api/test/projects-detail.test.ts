import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import { applyGlobalMigrations, applyProjectMigrations, newProjectId, registerProjectWithOwnerMembership, RequestPipeline, SqliteProjectDatabaseResolver, } from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";
import { createProjectsRouter, type ProjectRoutesDeps } from "../src/routes/projects.ts";
interface TestCtx {
    globalClient: Client;
    deps: ProjectRoutesDeps;
    dir: string;
}
let ctx: TestCtx;
beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), "kanban-api-detail-"));
    const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
    await applyGlobalMigrations(globalClient);
    const now = new Date().toISOString();
    for (const user of ["user-a", "user-b"]) {
        await globalClient.execute({
            sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
            args: [user, `${user}@test.local`, user, now, now],
        });
    }
    const provision = async (projectId: string, projectName: string, ownerUserId: string): Promise<void> => {
        const dbPath = `file:${join(dir, `${projectId}.db`)}`;
        const projectClient = createClient({ url: dbPath });
        await applyProjectMigrations(projectClient);
        await projectClient.execute({
            sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, ?, ?, ?, 1)",
            args: [projectId, projectName, now, now],
        });
        await projectClient.close();
        await registerProjectWithOwnerMembership(globalClient, {
            projectId,
            databaseId: dbPath,
            ownerUserId,
            now,
        });
    };
    const idA1 = `a1-${newProjectId()}`;
    const idB1 = `b1-${newProjectId()}`;
    await provision(idA1, "Proj A1", "user-a");
    await provision(idB1, "Proj B1", "user-b");
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
            resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
            newProjectId,
            createProject: async () => {
                throw new Error("tidak dipakai di test detail");
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
                return { userId: resolved.identity.userId, database: resolved.database };
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
describe("GET /api/v1/projects/:project_id — detail Project (goal 1.3.3)", () => {
    it("[C.4] member membaca project_state miliknya via pipeline+getProjectState", async () => {
        const rows = await ctx.globalClient.execute({
            sql: "SELECT id FROM projects WHERE owner_user_id = 'user-a'",
        });
        const projectId = String(rows.rows[0]!.id);
        const res = await makeApp().request(`http://localhost/v1/projects/${projectId}`, {
            headers: { "x-test-user": "user-a" },
        });
        if (res.status !== 200)
            throw new Error(`status ${res.status}: ${await res.text()}`);
        const json = await res.json();
        const p = json.data.project;
        if (p.id !== projectId || p.name !== "Proj A1" || p.version !== 1) {
            throw new Error(`detail salah: ${JSON.stringify(p)}`);
        }
        if (p.archivedAt !== null || p.deletedAt !== null) {
            throw new Error(`state lifecycle salah: ${JSON.stringify(p)}`);
        }
        if (typeof p.createdAt !== "string" || typeof p.updatedAt !== "string") {
            throw new Error(`timestamp hilang: ${JSON.stringify(p)}`);
        }
    });
    it("[INV-04][C.4] non-member menerima PROJECT_ACCESS_DENIED 403 tanpa isi project terungkap", async () => {
        const rows = await ctx.globalClient.execute({
            sql: "SELECT id FROM projects WHERE owner_user_id = 'user-a'",
        });
        const projectId = String(rows.rows[0]!.id);
        const res = await makeApp().request(`http://localhost/v1/projects/${projectId}`, {
            headers: { "x-test-user": "user-b" },
        });
        if (res.status !== 403)
            throw new Error(`status ${res.status}, harusnya 403`);
        const json = await res.json();
        if (json.error?.code !== "PROJECT_ACCESS_DENIED")
            throw new Error(`code ${json.error?.code}`);
        if (typeof json.data?.project !== "undefined")
            throw new Error("data project tidak boleh terungkap ke non-member");
    });
    it("[C.2][C.4] project yang tidak ada di registry → RESOURCE_NOT_FOUND 404", async () => {
        const res = await makeApp().request("http://localhost/v1/projects/01ARZ3NDEKTSV4RRFFQ69G5FAV", {
            headers: { "x-test-user": "user-a" },
        });
        if (res.status !== 404)
            throw new Error(`status ${res.status}`);
        const json = await res.json();
        if (json.error?.code !== "RESOURCE_NOT_FOUND")
            throw new Error(`code ${json.error?.code}`);
    });
    it("[C.2] GET detail tanpa identitas ditolak TOKEN_EXPIRED 401", async () => {
        const res = await makeApp().request("http://localhost/v1/projects/01ARZ3NDEKTSV4RRFFQ69G5FAV");
        if (res.status !== 401)
            throw new Error(`status ${res.status}`);
        const json = await res.json();
        if (json.error?.code !== "TOKEN_EXPIRED")
            throw new Error(`code ${json.error?.code}`);
    });
});
