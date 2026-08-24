import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { applyGlobalMigrations, applyProjectMigrations, assertAssigneeNotRevocationPending, cleanupAssigneesForRevokedMembership, revokeMembership, } from "../src/index.ts";
const BASE = "2026-01-01T00:00:00.000Z";
let dir: string;
let globalClient: Client;
let projectDb: Client;
const PID = "pbr";
const OWNER = "u-owner";
const MEMBER = "u-member";
async function count(sql: string, args: string[] = []): Promise<number> {
    const pr = await projectDb.execute({ sql, args });
    return Number(pr.rows[0]!.n);
}
const memberCol = async (col: "revoked_at" | "revocation_pending_at"): Promise<string | null> => {
    const r = await globalClient.execute({
        sql: `SELECT ${col} AS v FROM project_memberships WHERE id = ?`,
        args: ["m-br"],
    });
    const v = r.rows[0]!.v;
    return v === null || v === undefined ? null : String(v);
};
beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "kanban-revoke-recovery-"));
    globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
    await applyGlobalMigrations(globalClient);
    for (const u of [OWNER, MEMBER]) {
        await globalClient.execute({
            sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
            args: [u, `${u}@t.local`, u, BASE, BASE],
        });
    }
    await globalClient.execute({
        sql: "INSERT INTO projects (id, owner_user_id, provisioning_state, created_at) VALUES (?, ?, 'READY', ?)",
        args: [PID, OWNER, BASE],
    });
    await globalClient.execute({
        sql: "INSERT INTO project_databases (project_id, database_id, created_at) VALUES (?, 'file::memory:', ?)",
        args: [PID, BASE],
    });
    await globalClient.execute({
        sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at) VALUES ('m-br', ?, ?, ?)",
        args: [PID, MEMBER, BASE],
    });
    projectDb = createClient({ url: `file:${join(dir, "proj.db")}` });
    await applyProjectMigrations(projectDb);
    await projectDb.execute({
        sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, 'P', ?, ?, 1)",
        args: [PID, BASE, BASE],
    });
});
afterAll(async () => {
    await globalClient.close();
    await projectDb.close();
    rmSync(dir, { recursive: true, force: true });
});
async function seedCard(id: string): Promise<void> {
    await projectDb.execute({
        sql: `INSERT INTO milestones (id, title, progress, created_at, updated_at, version) VALUES ('${id}-ms', 'M', 0, ?, ?, 1)`,
        args: [BASE, BASE],
    });
    await projectDb.execute({
        sql: `INSERT INTO boards (id, milestone_id, title, created_at, updated_at, version) VALUES ('${id}-bd', '${id}-ms', 'B', ?, ?, 1)`,
        args: [BASE, BASE],
    });
    await projectDb.execute({
        sql: `INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('${id}-ls', '${id}-bd', 'L', ?, ?, 1)`,
        args: [BASE, BASE],
    });
    await projectDb.execute({
        sql: "INSERT INTO cards (id, list_id, title, creator_user_id, assignee_user_id, created_at, updated_at, version) VALUES (?, ?, 'C', 'x', ?, ?, ?, 1)",
        args: [id, `${id}-ls`, MEMBER, BASE, BASE],
    });
}
describe("BR-054C / AC-035 — revoke lintas-DB recovery (goal 2.12.1)", () => {
    it("[happy path] pending → cleanup SATU tx seluruh Card + 1 Activity per Card → finalize", async () => {
        await seedCard("cd1");
        await seedCard("cd2");
        const summary = await revokeMembership(globalClient, {
            projectId: PID,
            membershipId: "m-br",
            actorUserId: OWNER,
        }, projectDb);
        expect(summary.revokedAt).not.toBeNull();
        expect(await memberCol("revoked_at")).not.toBeNull();
        expect(await memberCol("revocation_pending_at")).toBeNull();
        expect(await count("SELECT COUNT(*) AS n FROM cards WHERE assignee_user_id IS NOT NULL")).toBe(0);
        expect(await count("SELECT COUNT(*) AS n FROM activities WHERE action = 'card.unassigned'")).toBe(2);
    });
    it("[AC-035 failure sebelum cleanup commit] → belum revoked, TIDAK ada partial cleanup; retry sukses tanpa Activity ganda", async () => {
        await seedCard("cd3");
        await globalClient.execute({
            sql: "UPDATE project_memberships SET revoked_at = NULL, revocation_pending_at = NULL WHERE id = 'm-br'",
        });
        const failing = {
            transaction: async () => {
                const tx = await projectDb.transaction("write");
                return {
                    execute: (stmt: unknown) => {
                        const sql = typeof stmt === "string" ? stmt : String((stmt as {
                            sql: string;
                        }).sql);
                        if (sql.includes("UPDATE cards"))
                            throw new Error("injected cleanup failure");
                        return tx.execute(stmt as never);
                    },
                    commit: () => tx.commit(),
                    rollback: () => tx.rollback(),
                    close: () => tx.close(),
                };
            },
            execute: projectDb.execute.bind(projectDb),
            batch: projectDb.batch.bind(projectDb),
            closed: false,
            close: () => projectDb.close(),
        } as never as Client;
        await expect(revokeMembership(globalClient, { projectId: PID, membershipId: "m-br", actorUserId: OWNER }, failing)).rejects.toThrow("injected cleanup failure");
        expect(await memberCol("revoked_at")).toBeNull();
        expect(await count("SELECT COUNT(*) AS n FROM cards WHERE id = 'cd3' AND assignee_user_id = ?", [MEMBER])).toBe(1);
        expect(await count("SELECT COUNT(*) AS n FROM activities WHERE action = 'card.unassigned'")).toBe(2);
        const summary = await revokeMembership(globalClient, {
            projectId: PID,
            membershipId: "m-br",
            actorUserId: OWNER,
        }, projectDb);
        expect(summary.revokedAt).not.toBeNull();
        expect(await count("SELECT COUNT(*) AS n FROM activities WHERE action = 'card.unassigned'")).toBe(3);
    });
    it("[AC-035 pending guard] saat pending → assignment baru DITOLAK; setelah finalize authorization dicabut", async () => {
        await globalClient.execute({
            sql: "UPDATE project_memberships SET revoked_at = NULL, revocation_pending_at = NULL WHERE id = 'm-br'",
        });
        await globalClient.execute({
            sql: "UPDATE project_memberships SET revocation_pending_at = ? WHERE id = 'm-br'",
            args: [new Date().toISOString()],
        });
        await expect(assertAssigneeNotRevocationPending(globalClient, PID, MEMBER)).rejects.toMatchObject({
            code: "INVALID_STATE",
        });
        const beforeActivities = await count("SELECT COUNT(*) AS n FROM activities WHERE action = 'card.unassigned'");
        await revokeMembership(globalClient, { projectId: PID, membershipId: "m-br", actorUserId: OWNER }, projectDb);
        expect(await memberCol("revoked_at")).not.toBeNull();
        expect(await memberCol("revocation_pending_at")).toBeNull();
        const afterActivities = await count("SELECT COUNT(*) AS n FROM activities WHERE action = 'card.unassigned'");
        expect(afterActivities).toBe(beforeActivities);
        await expect(assertAssigneeNotRevocationPending(globalClient, PID, MEMBER)).rejects.toBeTruthy();
    });
    it("[idempoten] revoke kedua pada membership sudah final → tanpa perubahan/Activity baru", async () => {
        const before = await count("SELECT COUNT(*) AS n FROM activities WHERE action = 'card.unassigned'");
        const summary = await revokeMembership(globalClient, { projectId: PID, membershipId: "m-br" }, projectDb);
        expect(summary.revokedAt).not.toBeNull();
        expect(await count("SELECT COUNT(*) AS n FROM activities WHERE action = 'card.unassigned'")).toBe(before);
    });
    it("[cleanup batch langsung] rollback penuh bila satu mutasi gagal — tidak ada partial", async () => {
        await seedCard("cd4");
        await seedCard("cd5");
        const failing = {
            transaction: async () => {
                const tx = await projectDb.transaction("write");
                let calls = 0;
                return {
                    execute: (stmt: unknown) => {
                        const sql = typeof stmt === "string" ? stmt : String((stmt as {
                            sql: string;
                        }).sql);
                        if (sql.includes("UPDATE cards")) {
                            calls += 1;
                            if (calls === 2)
                                throw new Error("second card fails");
                        }
                        return tx.execute(stmt as never);
                    },
                    commit: () => tx.commit(),
                    rollback: () => tx.rollback(),
                    close: () => tx.close(),
                };
            },
            execute: projectDb.execute.bind(projectDb),
            batch: projectDb.batch.bind(projectDb),
            closed: false,
            close: () => projectDb.close(),
        } as never as Client;
        await expect(cleanupAssigneesForRevokedMembership(failing, PID, MEMBER, OWNER)).rejects.toThrow("second card fails");
        expect(await count("SELECT COUNT(*) AS n FROM cards WHERE id IN ('cd4','cd5') AND assignee_user_id IS NOT NULL")).toBe(2);
        const res = await cleanupAssigneesForRevokedMembership(projectDb, PID, MEMBER, OWNER);
        expect(res.cleaned).toBe(2);
    });
});
describe("AC-035 konkuren deterministik — dua revoke overlap (QA-CL-26, goal 2.12.1)", () => {
    it("[overlap] dua revoke konkuren: A diklaim & ditahan pra-cleanup; B tuntas penuh; A lanjut → satu Activity per Card, hasil caller konsisten", async () => {
        await globalClient.execute({
            sql: "UPDATE project_memberships SET revoked_at = NULL, revocation_pending_at = NULL WHERE id = 'm-br'",
        });
        await seedCard("cd9");
        let aOpened!: () => void;
        const aOpenedP = new Promise<void>((r) => (aOpened = r));
        let releaseA!: () => void;
        const releaseAP = new Promise<void>((r) => (releaseA = r));
        const aProxy = {
            transaction: async () => {
                aOpened();
                await releaseAP;
                return projectDb.transaction("write");
            },
            execute: (() => { throw new Error("use tx"); }) as never,
            batch: projectDb.batch.bind(projectDb),
            closed: false,
            close: () => projectDb.close(),
        } as unknown as Client;
        const callA = revokeMembership(globalClient, {
            projectId: PID, membershipId: "m-br", actorUserId: OWNER,
        }, aProxy);
        await aOpenedP;
        expect(await memberCol("revocation_pending_at")).not.toBeNull();
        const resB = await revokeMembership(globalClient, {
            projectId: PID, membershipId: "m-br", actorUserId: OWNER,
        }, projectDb);
        expect(resB.revokedAt).not.toBeNull();
        releaseA();
        const resA = await callA;
        expect(resA.revokedAt).toBe(resB.revokedAt);
        expect(await memberCol("revoked_at")).not.toBeNull();
        expect(await memberCol("revocation_pending_at")).toBeNull();
        expect(Number((await projectDb.execute({
            sql: "SELECT COUNT(*) AS n FROM activities WHERE action = 'card.unassigned' AND entity_id = 'cd9'",
        })).rows[0]!.n)).toBe(1);
        expect(Number((await projectDb.execute({
            sql: "SELECT COUNT(*) AS n FROM cards WHERE id = 'cd9' AND assignee_user_id IS NOT NULL",
        })).rows[0]!.n)).toBe(0);
    }, 30000);
});
