import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import type { Request } from "hono";
import { applyGlobalMigrations } from "../src/database/migrate.ts";
import { RequestPipeline, EmptyPermissionResolver } from "../src/index.ts";
import { SqliteProjectDatabaseResolver } from "../src/database/project-resolver.ts";
const NOW = "2026-08-22T00:00:00.000Z";
const PROJECT = "proj_pipe";
const OWNER = "user_owner_1";
const MEMBER = "user_member_1";
let dir: string;
let globalClient: Client;
let pipeline: RequestPipeline;
const fakeRequest = (userId: string): Request => new Request("http://localhost/x", { headers: { "x-test-user": userId } }) as unknown as Request;
beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "kanban-perm-pipeline-"));
    globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
    await applyGlobalMigrations(globalClient);
    for (const user of [OWNER, MEMBER]) {
        await globalClient.execute({
            sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
            args: [user, `${user}@t.local`, user, NOW, NOW],
        });
    }
    await globalClient.execute({
        sql: "INSERT INTO projects (id, owner_user_id, provisioning_state, created_at) VALUES (?, ?, 'READY', ?)",
        args: [PROJECT, OWNER, NOW],
    });
    const projectDbPath = join(dir, `${PROJECT}.db`);
    await globalClient.execute({
        sql: "INSERT INTO project_databases (project_id, database_id, created_at) VALUES (?, ?, ?)",
        args: [PROJECT, `file:${projectDbPath}`, NOW],
    });
    createClient({ url: `file:${projectDbPath}` }).close();
    await globalClient.execute({
        sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES ('m_owner', ?, ?, ?, NULL), ('m_member', ?, ?, ?, NULL)",
        args: [PROJECT, OWNER, NOW, PROJECT, MEMBER, NOW],
    });
    await globalClient.execute({
        sql: "INSERT INTO permission_groups (id, project_id, name, description, created_at, updated_at) VALUES ('g_pipe', ?, 'G', NULL, ?, ?)",
        args: [PROJECT, NOW, NOW],
    });
    const p1 = await globalClient.execute({ sql: "INSERT INTO permissions (id, key) VALUES ('perm_cm', 'card.move') RETURNING id" });
    void p1;
    await globalClient.execute({
        sql: "INSERT INTO group_permissions (group_id, permission_id, created_at) VALUES ('g_pipe', 'perm_cm', ?)",
        args: [NOW],
    });
    await globalClient.execute({
        sql: "INSERT INTO membership_group_assignments (id, membership_id, group_id, scope_type, scope_id, created_at, revoked_at) VALUES ('ga_pipe', 'm_member', 'g_pipe', 'project', ?, ?, NULL)",
        args: [PROJECT, NOW],
    });
    await globalClient.execute({ sql: "INSERT OR IGNORE INTO permissions (id, key) VALUES ('perm_mi', 'member.invite')" });
    await globalClient.execute({ sql: "INSERT INTO permissions (id, key) VALUES ('perm_cr', 'card.read')" });
    await globalClient.execute({
        sql: "INSERT INTO membership_permission_assignments (id, membership_id, permission_id, scope_type, scope_id, card_read_visibility, created_at, revoked_at) VALUES ('da_pipe', 'm_member', 'perm_mi', 'project', ?, NULL, ?, NULL), ('da_pipe2', 'm_member', 'perm_cr', 'project', ?, 'ASSIGNED_TO_ME', ?, NULL)",
        args: [PROJECT, NOW, PROJECT, NOW],
    });
    pipeline = new RequestPipeline({
        identityResolver: { resolveIdentity: async (request: Request) => {
                const userId = request.headers.get("x-test-user");
                return userId ? { type: "session", userId, email: `${userId}@t.local`, name: userId, emailVerified: true, image: null } : null;
            } },
        globalClient,
        databaseResolver: new SqliteProjectDatabaseResolver(globalClient),
        projectClientFactory: { create: () => createClient({ url: ":memory:" }) },
    });
});
afterAll(async () => {
    await globalClient.close();
    rmSync(dir, { recursive: true, force: true });
});
describe("RequestPipeline + RealPermissionResolver — goal 4.3.1", () => {
    it("[BR-038] Member dengan assignment scope Project → grantedKeys berisi key di-grant + visibility terluas", async () => {
        const ctx = await pipeline.run(fakeRequest(MEMBER), PROJECT);
        expect(ctx.membership.id).toBe("m_member");
        expect(ctx.permission.grantedKeys.has("card.move")).toBe(true);
        expect(ctx.permission.grantedKeys.has("member.invite")).toBe(true);
        expect(ctx.permission.grantedKeys.has("board.update")).toBe(false);
        expect(ctx.permission.cardReadVisibility).toBe("ASSIGNED_TO_ME");
    });
    it("[BR-037] Owner → seluruh key katalog granted terlepas assignment", async () => {
        const ctx = await pipeline.run(fakeRequest(OWNER), PROJECT);
        expect(ctx.permission.grantedKeys.size).toBeGreaterThan(40);
        expect(ctx.permission.grantedKeys.has("card.move")).toBe(true);
        expect(ctx.permission.cardReadVisibility).toBe("ALL");
    });
    it("[D.3] Member tanpa assignment → grantedKeys kosong, tidak crash", async () => {
        await globalClient.execute({
            sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES ('u_none', 'none@t.local', 1, 'n', ?, ?)",
            args: [NOW, NOW],
        });
        await globalClient.execute({
            sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES ('m_none', ?, 'u_none', ?, NULL)",
            args: [PROJECT, NOW],
        });
        const ctx = await pipeline.run(fakeRequest("u_none"), PROJECT);
        expect(ctx.permission.grantedKeys.size).toBe(0);
        expect(ctx.permission.cardReadVisibility).toBe("CREATED_BY_ME");
    });
    it("[DoD] EmptyPermissionResolver masih injectable untuk test — granted kosong", async () => {
        const bare = new RequestPipeline({
            identityResolver: { resolveIdentity: async (request: Request) => {
                    const userId = request.headers.get("x-test-user");
                    return userId ? { type: "session", userId, email: `${userId}@t.local`, name: userId, emailVerified: true, image: null } : null;
                } },
            globalClient,
            databaseResolver: new SqliteProjectDatabaseResolver(globalClient),
            projectClientFactory: { create: () => createClient({ url: ":memory:" }) },
            permissionResolver: new EmptyPermissionResolver(),
        });
        const ctx = await bare.run(fakeRequest(OWNER), PROJECT);
        expect(ctx.permission.grantedKeys.size).toBe(0);
        expect(ctx.permission.cardReadVisibility).toBe("CREATED_BY_ME");
    });
});
