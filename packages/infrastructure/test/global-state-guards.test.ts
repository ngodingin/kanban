import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { applyGlobalMigrations, deletePermissionGroup, registerProjectWithOwnerMembership, revokeGroupAssignment, revokeInvitation, revokePermissionAssignment, } from "../src/index.ts";
const BASE = "2026-01-01T00:00:00.000Z";
const OWNER = "u-owner";
const MEMBER = "u-member";
const INVITEE = "u-invitee";
let dir: string;
let gc: Client;
beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "kanban-global-guards-"));
    gc = createClient({ url: `file:${join(dir, "global.db")}` });
    await applyGlobalMigrations(gc);
    for (const u of [OWNER, MEMBER, INVITEE]) {
        await gc.execute({
            sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
            args: [u, `${u}@t.local`, u, BASE, BASE],
        });
    }
});
afterAll(async () => {
    await gc.close();
    rmSync(dir, { recursive: true, force: true });
});
async function seedProject(pid: string): Promise<void> {
    await registerProjectWithOwnerMembership(gc, {
        projectId: pid,
        databaseId: `file:${join(dir, `${pid}.db`)}`,
        ownerUserId: OWNER,
        now: BASE,
    });
}
describe("Guard current-state Global DB — BR-019/invariant #7 (goal 5.5.1 remediasi QA-CL-07)", () => {
    it("[deletePermissionGroup] sequential double-delete → kedua kali 404 (kontrak konsisten)", async () => {
        await seedProject("pg1");
        await gc.execute({
            sql: "INSERT INTO permission_groups (id, project_id, name, created_at, updated_at) VALUES ('g-del', 'pg1', 'G', ?, ?)",
            args: [BASE, BASE],
        });
        const first = await deletePermissionGroup(gc, "pg1", "g-del");
        expect(first.deletedAt).not.toBeNull();
        await expect(deletePermissionGroup(gc, "pg1", "g-del")).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    });
    it("[revokeGroupAssignment] double-revoke → idempoten dengan revokedAt AKHIR yang sama (bukan timestamp lokal)", async () => {
        await seedProject("pg2");
        await gc.execute({
            sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at) VALUES ('m-g2', 'pg2', ?, ?)",
            args: [MEMBER, BASE],
        });
        await gc.execute({
            sql: "INSERT INTO permission_groups (id, project_id, name, created_at, updated_at) VALUES ('g-g2', 'pg2', 'G', ?, ?)",
            args: [BASE, BASE],
        });
        const perm = await gc.execute({
            sql: "INSERT OR IGNORE INTO permissions (id, key) VALUES ('perm-x2', 'x.2') RETURNING id",
        });
        void perm;
        const pidRow = await gc.execute({ sql: "SELECT id FROM permissions WHERE key = 'x.2'" });
        await gc.execute({
            sql: "INSERT INTO membership_group_assignments (id, membership_id, group_id, scope_type, scope_id, created_at) VALUES ('ga-g2', 'm-g2', 'g-g2', 'project', 'pg2', ?)",
            args: [BASE],
        });
        void pidRow;
        const r1 = await revokeGroupAssignment(gc, { projectId: "pg2", membershipId: "m-g2", assignmentId: "ga-g2" });
        expect(r1.revokedAt).not.toBeNull();
        const r2 = await revokeGroupAssignment(gc, { projectId: "pg2", membershipId: "m-g2", assignmentId: "ga-g2" });
        expect(r2.revokedAt).toBe(r1.revokedAt);
    });
    it("[revokePermissionAssignment] double-revoke → idempoten konsisten", async () => {
        await seedProject("pg3");
        await gc.execute({
            sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at) VALUES ('m-g3', 'pg3', ?, ?)",
            args: [MEMBER, BASE],
        });
        await gc.execute("INSERT OR IGNORE INTO permissions (id, key) VALUES ('perm-r3', 'read.3')");
        const pid = await gc.execute({ sql: "SELECT id FROM permissions WHERE key = 'read.3'" });
        await gc.execute({
            sql: "INSERT INTO membership_permission_assignments (id, membership_id, permission_id, scope_type, scope_id, created_at) VALUES ('da-g3', 'm-g3', ?, 'project', 'pg3', ?)",
            args: [String(pid.rows[0]!.id), BASE],
        });
        const r1 = await revokePermissionAssignment(gc, { projectId: "pg3", membershipId: "m-g3", assignmentId: "da-g3" });
        const r2 = await revokePermissionAssignment(gc, { projectId: "pg3", membershipId: "m-g3", assignmentId: "da-g3" });
        expect(r1.revokedAt).not.toBeNull();
        expect(r2.revokedAt).toBe(r1.revokedAt);
    });
    it("[QA-CL-07 skenario] accept ditahan pra-tx; revoke commit duluan → accept INVALID_STATE, tanpa accepted+revoked", async () => {
        const pid = "prA";
        await seedProject(pid);
        const invId = "inv-A";
        await gc.execute({
            sql: "INSERT INTO invitations (id, project_id, email, invited_by_user_id, expires_at, created_at) VALUES (?, ?, ?, 'u-owner', '2099-01-01T00:00:00.000Z', ?)",
            args: [invId, pid, `${INVITEE}@t.local`, BASE],
        });
        await gc.execute({
            sql: "INSERT INTO permission_groups (id, project_id, name, created_at, updated_at) VALUES (?, ?, 'GI', ?, ?)",
            args: [`gi-A`, pid, BASE, BASE],
        });
        await gc.execute({
            sql: "INSERT INTO invitation_group_assignments (id, invitation_id, group_id, scope_type, scope_id) VALUES ('iga-A', ?, 'gi-A', 'project', ?)",
            args: [invId, pid],
        });
        const gA = createClient({ url: `file:${join(dir, "global.db")}` });
        let aStarted!: () => void;
        const startedP = new Promise<void>((r) => (aStarted = r));
        let releaseA!: () => void;
        const releaseAP = new Promise<void>((r) => (releaseA = r));
        const admin = await import("../src/database/project-admin.ts");
        const acceptPromise = (async () => {
            aStarted();
            await releaseAP;
            return admin.acceptInvitation(gA, {
                invitationId: invId, userId: INVITEE, userEmail: `${INVITEE}@t.local`,
            });
        })();
        await startedP;
        await revokeInvitation(gc, { projectId: pid, invitationId: invId });
        releaseA();
        await expect(acceptPromise).rejects.toMatchObject({ code: "INVALID_STATE" });
        const row = await gc.execute({
            sql: "SELECT accepted_at AS a, revoked_at AS r FROM invitations WHERE id = ?",
            args: [invId],
        });
        expect(row.rows[0]!.r).not.toBeNull();
        expect(row.rows[0]!.a).toBeNull();
        await gA.close();
    });
    it("[arah kebalikan] revoke ditahan; accept commit duluan → revoke INVALID_STATE, accepted tetap tunggal", async () => {
        const pid = "prB";
        await seedProject(pid);
        const invId = "inv-B";
        await gc.execute({
            sql: "INSERT INTO invitations (id, project_id, email, invited_by_user_id, expires_at, created_at) VALUES (?, ?, ?, 'u-owner', '2099-01-01T00:00:00.000Z', ?)",
            args: [invId, pid, `${INVITEE}@t.local`, BASE],
        });
        await gc.execute({
            sql: "INSERT INTO permission_groups (id, project_id, name, created_at, updated_at) VALUES (?, ?, 'GI', ?, ?)",
            args: [`gi-B`, pid, BASE, BASE],
        });
        await gc.execute({
            sql: "INSERT INTO invitation_group_assignments (id, invitation_id, group_id, scope_type, scope_id) VALUES ('iga-B', ?, 'gi-B', 'project', ?)",
            args: [invId, pid],
        });
        const admin = await import("../src/database/project-admin.ts");
        const acc = await admin.acceptInvitation(gc, {
            invitationId: invId, userId: INVITEE, userEmail: `${INVITEE}@t.local`,
        });
        expect(acc.acceptedAt).not.toBeNull();
        await expect(revokeInvitation(gc, { projectId: pid, invitationId: invId }))
            .rejects.toMatchObject({ code: "INVALID_STATE" });
        const row = await gc.execute({
            sql: "SELECT accepted_at AS a, revoked_at AS r FROM invitations WHERE id = ?",
            args: [invId],
        });
        expect(row.rows[0]!.a).not.toBeNull();
        expect(row.rows[0]!.r).toBeNull();
    });
});
