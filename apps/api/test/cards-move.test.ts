import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import { applyGlobalMigrations, applyProjectMigrations, newProjectId, registerProjectWithOwnerMembership, RequestPipeline, SqliteProjectDatabaseResolver, createEntityPermissionResolver, } from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";
import { createCardsRouter, type CardRoutesDeps } from "../src/routes/cards.ts";
interface TestCtx {
    globalClient: Client;
    deps: CardRoutesDeps;
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
    const dir = await mkdtemp(join(tmpdir(), "kanban-api-cd-move-"));
    const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
    await applyGlobalMigrations(globalClient);
    const now = new Date().toISOString();
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
    for (const id of ["ms_1", "ms_2"]) {
        await projectClient.execute({
            sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES (?, ?, NULL, 0, ?, ?, 1)",
            args: [id, `M ${id}`, now, now],
        });
    }
    for (const [id, ms] of [
        ["bd_1", "ms_1"],
        ["bd_2", "ms_2"],
    ] as const) {
        await projectClient.execute({
            sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES (?, ?, ?, NULL, ?, ?, 1)",
            args: [id, ms, `B ${id}`, now, now],
        });
    }
    for (const [id, bd] of [
        ["ls_s", "bd_1"],
        ["ls_d", "bd_1"],
        ["ls_m2", "bd_2"],
    ] as const) {
        await projectClient.execute({
            sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, 1)",
            args: [id, bd, `L ${id}`, now, now],
        });
    }
    await projectClient.execute({
        sql: "INSERT INTO cards (id, list_id, creator_user_id, assignee_user_id, title, subtitle, description, due_date, created_at, updated_at, version) VALUES ('cd_move', 'ls_s', 'user-a', NULL, 'Pindah', NULL, NULL, NULL, ?, ?, 1)",
        args: [now, now],
    });
    await projectClient.close();
    await registerProjectWithOwnerMembership(globalClient, { projectId: projectIdValue, databaseId: projectDbPathValue, ownerUserId: "user-a", now });
    await globalClient.execute({
        sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES ('m-extra-b', ?, 'user-b', ?, NULL)",
        args: [projectIdValue, now],
    });
    ctx = {
        globalClient,
        deps: {
            resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
            newCardId: () => `cd-${Math.random().toString(36).slice(2, 10)}`,
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
            assertAssigneeActiveMember: async (_projectId, _userId) => { },
        },
    };
});
afterAll(async () => {
    await ctx.globalClient.close();
});
function makeApp(): Hono {
    return new Hono().route("/", createCardsRouter(() => ctx.deps));
}
function move(body: unknown, cardId = "cd_move", user = "user-a"): Promise<Response> {
    return makeApp().request(`http://localhost/v1/projects/${projectIdValue}/cards/${cardId}/move`, {
        method: "POST",
        headers: { "x-test-user": user, "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}
describe("POST /api/v1/projects/:project_id/cards/:card_id/move — goal 2.11.1", () => {
    it("[C.8][C.2] sukses same-board → 200 data.card.listId baru + Activity card.moved payload from/to", async () => {
        const res = await move({ destinationListId: "ls_d", expectedVersion: 1 });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data.card).toMatchObject({ id: "cd_move", listId: "ls_d", version: 2 });
        const projectDb = createClient({ url: projectDbPathValue });
        try {
            const activity = await projectDb.execute("SELECT data FROM activities WHERE entity_id = 'cd_move' AND action = 'card.moved'");
            const parsed = JSON.parse(String(activity.rows[0]!.data));
            expect(parsed.from).toMatchObject({ listId: "ls_s", boardId: "bd_1" });
            expect(parsed.to).toMatchObject({ listId: "ls_d", boardId: "bd_1" });
        }
        finally {
            await projectDb.close();
        }
        const back = await move({ destinationListId: "ls_s", expectedVersion: 2 });
        expect(back.status).toBe(200);
    });
    it("[BR-018] cross-Milestone → INVALID_DESTINATION 422 walau Owner; row tidak berubah", async () => {
        const res = await move({ destinationListId: "ls_m2", expectedVersion: 3 });
        expect(res.status).toBe(422);
        expect((await res.json()).error?.code).toBe("INVALID_DESTINATION");
    });
    it("[AC-020][regresi 2.10] version mismatch → VERSION_CONFLICT tanpa perubahan/activity baru", async () => {
        const res = await move({ destinationListId: "ls_d", expectedVersion: 999 });
        expect(res.status).toBe(409);
        expect((await res.json()).error?.code).toBe("VERSION_CONFLICT");
        const before = await ctx.globalClient.execute({
            sql: "SELECT d.database_id AS db FROM project_databases d WHERE d.project_id = ?",
            args: [projectIdValue],
        });
        const projectDb = createClient({ url: String(before.rows[0]!.db) });
        try {
            const card = await projectDb.execute("SELECT list_id, version FROM cards WHERE id = 'cd_move'");
            expect(card.rows[0]).toMatchObject({ list_id: "ls_s", version: 3 });
            const movedCount = await projectDb.execute("SELECT COUNT(*) AS n FROM activities WHERE entity_id = 'cd_move' AND action = 'card.moved'");
            expect(Number(movedCount.rows[0]?.n)).toBe(2);
        }
        finally {
            await projectDb.close();
        }
    });
    it("[C.8 persis] payload invalid → VALIDATION_ERROR 400 (field asing, destination bukan string, kosong)", async () => {
        for (const body of [
            { expectedVersion: 3 },
            { destinationListId: "", expectedVersion: 3 },
            { destinationListId: 42, expectedVersion: 3 },
            { destinationListId: "ls_d" },
            { destinationListId: "ls_d", expectedVersion: 3, extra: true },
            "bukan-json",
        ]) {
            const res = await move(body as unknown as Record<string, unknown>);
            expect(res.status).toBe(400);
            expect((await res.json()).error?.code).toBe("VALIDATION_ERROR");
        }
    });
    it("[Authz interim] non-Owner member → PERMISSION_DENIED; tanpa identitas → TOKEN_EXPIRED; card tidak ada → 404", async () => {
        const denied = await move({ destinationListId: "ls_d", expectedVersion: 3 }, "cd_move", "user-b");
        expect(denied.status).toBe(403);
        const noIdentity = await makeApp().request(`http://localhost/v1/projects/${projectIdValue}/cards/cd_move/move`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ destinationListId: "ls_d", expectedVersion: 3 }),
        });
        expect(noIdentity.status).toBe(401);
        const missing = await move({ destinationListId: "ls_d", expectedVersion: 3 }, "cd_none");
        expect(missing.status).toBe(404);
    });
});
