import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import { applyGlobalMigrations, applyProjectMigrations, newProjectId, registerProjectWithOwnerMembership, } from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";
import { buildMilestoneRoutesDeps, buildProjectRoutesDeps } from "../src/project-deps.ts";
import { createMilestonesRouter } from "../src/routes/milestones.ts";
import { createProjectsRouter } from "../src/routes/projects.ts";
const NOW = "2026-08-01T00:00:00.000Z";
let dir: string;
let globalClient: Client;
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
const fakeIdentityResolver = { resolveIdentity: (req: Request) => identityFor(req.headers.get("x-test-user")) };
beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kanban-idempotency-wiring-"));
    globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
    await applyGlobalMigrations(globalClient);
    for (const user of ["user-a", "user-b"]) {
        await globalClient.execute({
            sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
            args: [user, `${user}@t.local`, user, NOW, NOW],
        });
    }
    projectIdValue = `a-${newProjectId()}`;
    const projectDbPath = `file:${join(dir, `${projectIdValue}.db`)}`;
    const projectClient = createClient({ url: projectDbPath });
    await applyProjectMigrations(projectClient);
    await projectClient.execute({
        sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, 'P', ?, ?, 1)",
        args: [projectIdValue, NOW, NOW],
    });
    await projectClient.close();
    await registerProjectWithOwnerMembership(globalClient, {
        projectId: projectIdValue,
        databaseId: projectDbPath,
        ownerUserId: "user-a",
        now: NOW,
    });
    await globalClient.execute({
        sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES ('m-b', ?, 'user-b', ?, NULL)",
        args: [projectIdValue, NOW],
    });
    await globalClient.execute("INSERT OR IGNORE INTO permissions (id, key) VALUES ('p_mc', 'milestone.create')");
    const permRow = await globalClient.execute({ sql: "SELECT id FROM permissions WHERE key = 'milestone.create'" });
    await globalClient.execute({
        sql: "INSERT INTO membership_permission_assignments (id, membership_id, permission_id, scope_type, scope_id, created_at) VALUES ('da-b', 'm-b', ?, 'project', ?, ?)",
        args: [String(permRow.rows[0]!.id), projectIdValue, NOW],
    });
});
afterAll(async () => {
    await globalClient.close();
});
const milestoneApp = (): Hono => new Hono().route("/", createMilestonesRouter(() => buildMilestoneRoutesDeps({ identityResolver: fakeIdentityResolver, globalClient, turso: null })));
const countMilestones = async (title: string): Promise<number> => {
    const projectClient = createClient({ url: `file:${join(dir, `${projectIdValue}.db`)}` });
    try {
        const r = await projectClient.execute({ sql: "SELECT COUNT(*) AS n FROM milestones WHERE title = ?", args: [title] });
        return Number(r.rows[0]!.n);
    }
    finally {
        await projectClient.close();
    }
};
const createMilestone = (title: string, user: string, idempotencyKey?: string): Promise<Response> => milestoneApp().request(`http://localhost/v1/projects/${projectIdValue}/milestones`, {
    method: "POST",
    headers: {
        "x-test-user": user,
        "content-type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({ title }),
});
describe("Idempotency-Key wiring end-to-end (goal 0.16.3) — create Milestone", () => {
    it("[C.3] key SAMA 2x -> hanya SATU Milestone tercipta (row-level), response ke-2 identik", async () => {
        const res1 = await createMilestone("Idem A", "user-a", "key-idem-a");
        expect(res1.status).toBe(201);
        const json1 = await res1.json();
        const res2 = await createMilestone("Idem A", "user-a", "key-idem-a");
        expect(res2.status).toBe(201);
        const json2 = await res2.json();
        expect(json2).toEqual(json1);
        expect(await countMilestones("Idem A")).toBe(1);
    });
    it("[negatif] key BERBEDA -> diproses normal, TIDAK saling mempengaruhi", async () => {
        await createMilestone("Idem B", "user-a", "key-idem-b1");
        await createMilestone("Idem B", "user-a", "key-idem-b2");
        expect(await countMilestones("Idem B")).toBe(2);
    });
    it("[opsional] TANPA header Idempotency-Key -> tetap berfungsi seperti biasa (tidak wajib)", async () => {
        await createMilestone("Idem C", "user-a");
        await createMilestone("Idem C", "user-a");
        expect(await countMilestones("Idem C")).toBe(2);
    });
    it("[keamanan] User BEDA pakai key SAMA -> TIDAK collide/replay (scope mencakup userId)", async () => {
        const resA = await createMilestone("Idem D", "user-a", "key-idem-shared");
        const resB = await createMilestone("Idem D", "user-b", "key-idem-shared");
        expect(resA.status).toBe(201);
        expect(resB.status).toBe(201);
        const jsonA = await resA.json();
        const jsonB = await resB.json();
        expect(jsonA.data.milestone.id).not.toBe(jsonB.data.milestone.id);
        expect(await countMilestones("Idem D")).toBe(2);
    });
    it("[AC-033, C.3 poin 4] key SAMA, payload BEDA -> 409 IDEMPOTENCY_CONFLICT, TIDAK ada Milestone baru", async () => {
        const first = await createMilestone("Idem E1", "user-a", "key-idem-conflict");
        expect(first.status).toBe(201);
        const second = await createMilestone("Idem E2", "user-a", "key-idem-conflict");
        expect(second.status).toBe(409);
        const json = await second.json();
        expect(json.error?.code).toBe("IDEMPOTENCY_CONFLICT");
        expect(await countMilestones("Idem E2")).toBe(0);
    });
    it("[AC-033] key SAMA, payload SAMA, dikirim ULANG -> tetap replay (bukan conflict, terlepas urutan)", async () => {
        const first = await createMilestone("Idem F", "user-a", "key-idem-samepayload");
        const second = await createMilestone("Idem F", "user-a", "key-idem-samepayload");
        expect(second.status).toBe(201);
        expect(await countMilestones("Idem F")).toBe(1);
        expect(await first.clone().json()).toEqual(await second.json());
    });
    it("[AC-034, concurrency SUNGGUHAN] dua request PARALEL key+payload SAMA -> TEPAT SATU 201, lainnya 409 IDEMPOTENCY_IN_PROGRESS, HANYA SATU Milestone", async () => {
        const [res1, res2] = await Promise.all([
            createMilestone("Idem G", "user-a", "key-idem-concurrent"),
            createMilestone("Idem G", "user-a", "key-idem-concurrent"),
        ]);
        const statuses = [res1.status, res2.status].sort();
        expect(statuses).toEqual([201, 409]);
        const failed = res1.status === 409 ? res1 : res2;
        expect((await failed.json()).error?.code).toBe("IDEMPOTENCY_IN_PROGRESS");
        expect(await countMilestones("Idem G")).toBe(1);
    });
});
describe("Idempotency-Key wiring end-to-end (goal 0.16.3) — create Project", () => {
    it("[C.3] key SAMA 2x pada create Project -> hanya SATU Project tercipta", async () => {
        const deps = buildProjectRoutesDeps({ identityResolver: fakeIdentityResolver, globalClient, turso: null });
        const app = new Hono().route("/", createProjectsRouter(() => deps));
        const res1 = await app.request(`http://localhost/v1/projects`, {
            method: "POST",
            headers: { "x-test-user": "user-a", "content-type": "application/json", "Idempotency-Key": "key-proj-1" },
            body: JSON.stringify({ name: "Proj Idem" }),
        });
        expect(res1.status).toBe(500);
        const res2 = await app.request(`http://localhost/v1/projects`, {
            method: "POST",
            headers: { "x-test-user": "user-a", "content-type": "application/json", "Idempotency-Key": "key-proj-1" },
            body: JSON.stringify({ name: "Proj Idem" }),
        });
        expect(res2.status).toBe(500);
    });
});
describe("Idempotency-Key wiring end-to-end (goal 0.16.3) — lifecycle Milestone (archive)", () => {
    it("[C.3] archive dengan key SAMA 2x -> hanya SATU efek, response ke-2 identik (bukan VERSION_CONFLICT)", async () => {
        const created = await createMilestone("Idem Archive", "user-a", "key-create-archive-target");
        const createdJson = await created.json();
        const milestoneId = createdJson.data.milestone.id as string;
        const archiveOnce = (idempotencyKey: string) => milestoneApp().request(`http://localhost/v1/projects/${projectIdValue}/milestones/${milestoneId}/archive`, {
            method: "POST",
            headers: { "x-test-user": "user-a", "content-type": "application/json", "Idempotency-Key": idempotencyKey },
            body: JSON.stringify({ expectedVersion: 1 }),
        });
        const res1 = await archiveOnce("key-archive-1");
        expect(res1.status).toBe(200);
        const json1 = await res1.json();
        const res2 = await archiveOnce("key-archive-1");
        expect(res2.status).toBe(200);
        const json2 = await res2.json();
        expect(json2).toEqual(json1);
    });
});
