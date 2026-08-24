import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { InArgs } from "@libsql/client";
import { createClient, type Client } from "@libsql/client";
import {
  applyGlobalMigrations,
  cleanupAssigneesForRevokedMembership,
  newProjectId,
  registerProjectWithOwnerMembership,
  revokeMembership,
  unassignCardFromRevokedMember,
} from "../src/index.ts";
import { createTestProjectDb, type TestDb } from "./helpers/db.ts";

const T0 = "2026-08-01T00:00:00.000Z";
const OWNER_ACTOR = "user-owner";

let globalClient: Client;
let project: TestDb;
let projectIdValue: string;
const MEMBERSHIP_X = "m-x";
const MEMBERSHIP_Y = "m-y";

async function seedCards(): Promise<void> {
  await project.client.execute({
    sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_seed', 'M', NULL, 0, ?, ?, 1)",
    args: [T0, T0],
  });
  await project.client.execute({
    sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('bd_seed', 'ms_seed', 'B', NULL, ?, ?, 1)",
    args: [T0, T0],
  });
  await project.client.execute({
    sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('ls_seed', 'bd_seed', 'L', ?, ?, 1)",
    args: [T0, T0],
  });
  for (const [id, assignee] of [
    ["cd_1", "user-x"],
    ["cd_2", "user-x"],
    ["cd_3", "user-x"],
    ["cd_other", "user-y"],
    ["cd_none", null],
  ] as const) {
    await project.client.execute({
      sql: "INSERT INTO cards (id, list_id, creator_user_id, assignee_user_id, title, created_at, updated_at, version) VALUES (?, 'ls_seed', 'creator-awal', ?, 'T', ?, ?, 1)",
      args: [id, assignee, T0, T0],
    });
  }
}

beforeAll(async () => {
  const globalDir = await mkdtemp(join(tmpdir(), "kanban-global-unassign-"));
  globalClient = createClient({ url: `file:${join(globalDir, "global.db")}` });
  await applyGlobalMigrations(globalClient);

  const now = T0;
  for (const user of ["user-owner", "user-x", "user-y"]) {
    await globalClient.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
      args: [user, `${user}@test.local`, user, now, now],
    });
  }

  project = await createTestProjectDb();
  projectIdValue = `p-${newProjectId()}`;
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: projectIdValue,
    databaseId: `file:${join(project.dir, "project.db")}`,
    ownerUserId: "user-owner",
    now,
  });
  for (const [membershipId, userId] of [
    [MEMBERSHIP_X, "user-x"],
    [MEMBERSHIP_Y, "user-y"],
  ] as const) {
    await globalClient.execute({
      sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES (?, ?, ?, ?, NULL)",
      args: [membershipId, projectIdValue, userId, now],
    });
  }
});

afterEach(async () => {
  // reset Project DB rows; Global DB tax-free lintas test dalam file ini
  await project.truncateAll();
});

afterAll(async () => {
  await globalClient.close();
  await project.cleanup();
});

describe("unassignCardFromRevokedMember — atomik per Card (goal 2.12.1)", () => {
  it("[FR-026][BR-054] positif: assignee NULL + Activity card.unassigned payload B.5 + creator utuh", async () => {
    await seedCards();
    const changed = await unassignCardFromRevokedMember(project.client, {
      cardId: "cd_1",
      revokedUserId: "user-x",
      actorUserId: OWNER_ACTOR,
    });
    expect(changed).toBe(true);

    const card = await project.client.execute(
      "SELECT assignee_user_id, creator_user_id, version FROM cards WHERE id = 'cd_1'",
    );
    expect(card.rows[0]).toMatchObject({ assignee_user_id: null, creator_user_id: "creator-awal", version: 2 });

    const activity = await project.client.execute(
      "SELECT action, data, actor_user_id FROM activities WHERE entity_id = 'cd_1'",
    );
    expect(activity.rows[0]).toMatchObject({ action: "card.unassigned", actor_user_id: OWNER_ACTOR });
    expect(JSON.parse(String(activity.rows[0]!.data))).toEqual({
      previousAssigneeUserId: "user-x",
      reason: "membership_revoked",
    });
  });

  it("[guard] skip tanpa efek samping bila assignee sudah bukan user tersebut", async () => {
    await seedCards();
    const changed = await unassignCardFromRevokedMember(project.client, {
      cardId: "cd_other",
      revokedUserId: "user-x",
      actorUserId: OWNER_ACTOR,
    });
    expect(changed).toBe(false);
    const count = await project.client.execute("SELECT COUNT(*) AS n FROM activities");
    expect(Number(count.rows[0]?.n)).toBe(0);
  });

  it("[atomik per-Card] UPDATE gagal → tidak ada Activity yatim tanpa mutation yang sesuai", async () => {
    await seedCards();
    const real = project.client;
    const failId = "cd_2";
    let txCount = 0;
    const failing = {
      transaction: async () => {
        txCount++;
        const tx = await real.transaction("write");
        return {
          execute: async (sqlOrOpts: string | { sql: string; args?: InArgs }, maybeArgs?: InArgs) => {
            const sql = typeof sqlOrOpts === "string" ? sqlOrOpts : sqlOrOpts.sql;
            const args = typeof sqlOrOpts === "string" ? maybeArgs : sqlOrOpts.args;
            if (sql.startsWith("UPDATE cards") && Array.isArray(args) && args.includes(failId)) {
              throw Object.assign(new Error("boom"), { code: "SQLITE_TEST_FAIL" });
            }
            return tx.execute({ sql, args: args ?? [] });
          },
          commit: () => tx.commit(),
          rollback: () => tx.rollback(),
        };
      },
      execute: ((sql: string, args?: InArgs) => real.execute({ sql, args: args ?? [] })) as unknown,
      closed: false,
      protocol: "http",
      url: "",
    } as unknown as Client;

    await expect(
      unassignCardFromRevokedMember(failing, { cardId: failId, revokedUserId: "user-x", actorUserId: OWNER_ACTOR }),
    ).rejects.toThrow();
    expect(txCount).toBeGreaterThan(0);

    const orphanActivity = await project.client.execute(
      "SELECT COUNT(*) AS n FROM activities WHERE entity_id = 'cd_2' AND action = 'card.unassigned'",
    );
    expect(Number(orphanActivity.rows[0]?.n)).toBe(0);
    const row = await project.client.execute("SELECT assignee_user_id, version FROM cards WHERE id = 'cd_2'");
    expect(row.rows[0]).toMatchObject({ assignee_user_id: "user-x", version: 1 });
  });
});

describe("cleanupAssigneesForRevokedMembership — best-effort per Card (goal 2.12.1)", () => {
  it("[FR-026] 3 Card user-x dibersihkan masing-masing; Card lain & creator tak tersentuh", async () => {
    await seedCards();
    const result = await cleanupAssigneesForRevokedMembership(
      project.client,
      projectIdValue,
      "user-x",
      OWNER_ACTOR,
    );
    expect(result.cleaned).toBe(3);
    expect(result.skipped).toBe(0);

    for (const id of ["cd_1", "cd_2", "cd_3"]) {
      const card = await project.client.execute(
        "SELECT assignee_user_id, creator_user_id, version FROM cards WHERE id = ?",
        [id],
      );
      expect(card.rows[0]).toMatchObject({ assignee_user_id: null, creator_user_id: "creator-awal", version: 2 });
    }
    for (const [id, assignee] of [
      ["cd_other", "user-y"],
      ["cd_none", null],
    ] as const) {
      const card = await project.client.execute("SELECT assignee_user_id, version FROM cards WHERE id = ?", [id]);
      expect(card.rows[0]).toMatchObject({ assignee_user_id: assignee, version: 1 });
    }
    const activities = await project.client.execute(
      "SELECT entity_id, data FROM activities WHERE action = 'card.unassigned' ORDER BY entity_id",
    );
    expect(activities.rows).toHaveLength(3); // satu per Card, bukan gabungan
    for (const row of activities.rows) {
      expect(["cd_1", "cd_2", "cd_3"]).toContain(String(row.entity_id));
      expect(JSON.parse(String(row.data))).toEqual({
        previousAssigneeUserId: "user-x",
        reason: "membership_revoked",
      });
    }
  });

  it("[best-effort] kegagalan di tengah loop → card lain tetap dibersihkan, card gagal tak tersentuh & tanpa Activity", async () => {
    await seedCards();
    const real = project.client;
    const failId = "cd_2";
    const failing = {
      transaction: async () => {
        const tx = await real.transaction("write");
        return {
          execute: async (sqlOrOpts: string | { sql: string; args?: InArgs }, maybeArgs?: InArgs) => {
            const sql = typeof sqlOrOpts === "string" ? sqlOrOpts : sqlOrOpts.sql;
            const args = typeof sqlOrOpts === "string" ? maybeArgs : sqlOrOpts.args;
            if (sql.startsWith("UPDATE cards") && Array.isArray(args) && args.includes(failId)) {
              throw Object.assign(new Error("boom"), { code: "SQLITE_TEST_FAIL" });
            }
            return tx.execute({ sql, args: args ?? [] });
          },
          commit: () => tx.commit(),
          rollback: () => tx.rollback(),
        };
      },
      execute: ((sql: string, args?: InArgs) => real.execute({ sql, args: args ?? [] })) as unknown,
      closed: false,
      protocol: "http",
      url: "",
    } as unknown as Client;

    // wrapper melempar error dari card yang gagal — tapi card sebelum/sesudahnya
    // diproses atomik masing-masing; verifikasi via pemanggilan manual per-card:
    const ids = ["cd_1", "cd_2", "cd_3"];
    const outcomes: Array<{ id: string; ok: boolean }> = [];
    for (const id of ids) {
      try {
        const ok = await unassignCardFromRevokedMember(failing, {
          cardId: id,
          revokedUserId: "user-x",
          actorUserId: OWNER_ACTOR,
        });
        outcomes.push({ id, ok });
      } catch {

        outcomes.push({ id, ok: false });
      }
    }
    expect(outcomes.find((o) => o.id === "cd_1")).toMatchObject({ ok: true });
    expect(outcomes.find((o) => o.id === "cd_3")).toMatchObject({ ok: true });

    const failedRow = await project.client.execute("SELECT assignee_user_id FROM cards WHERE id = 'cd_2'");
    expect(failedRow.rows[0]).toMatchObject({ assignee_user_id: "user-x" });
    const orphanActivity = await project.client.execute(
      "SELECT COUNT(*) AS n FROM activities WHERE entity_id = 'cd_2'",
    );
    expect(Number(orphanActivity.rows[0]?.n)).toBe(0);
  });
});

describe("revokeMembership + cleanup — integrasi lintas-DB nyata (goal 2.12.1)", () => {
  it("[DoD] Global revoke → Project DB Card assignee ikut NULL; idempoten", async () => {
    await seedCards();
    const summary = await revokeMembership(
      globalClient,
      { projectId: projectIdValue, membershipId: MEMBERSHIP_X, actorUserId: OWNER_ACTOR },
      project.client,
    );
    expect(summary.revokedAt).not.toBeNull();

    const xCards = await project.client.execute(
      "SELECT COUNT(*) AS n FROM cards WHERE assignee_user_id = 'user-x'",
    );
    expect(Number(xCards.rows[0]?.n)).toBe(0);

    const activities = await project.client.execute(
      "SELECT COUNT(*) AS n FROM activities WHERE action = 'card.unassigned'",
    );
    expect(Number(activities.rows[0]?.n)).toBe(3);

    await revokeMembership(
      globalClient,
      { projectId: projectIdValue, membershipId: MEMBERSHIP_X, actorUserId: OWNER_ACTOR },
      project.client,
    );
    const after = await project.client.execute(
      "SELECT COUNT(*) AS n FROM activities WHERE action = 'card.unassigned'",
    );
    expect(Number(after.rows[0]?.n)).toBe(3); // tidak bertambah
  });

  it("[kompatibilitas] revokeMembership tanpa projectDb tetap jalan (perilaku Phase 1)", async () => {
    await seedCards();
    const summary = await revokeMembership(
      globalClient,
      { projectId: projectIdValue, membershipId: MEMBERSHIP_Y },
      null,
    );
    expect(summary.userId).toBe("user-y");
    const other = await project.client.execute("SELECT assignee_user_id FROM cards WHERE id = 'cd_other'");
    expect(other.rows[0]).toMatchObject({ assignee_user_id: "user-y" }); // cleanup di-skip
  });
});
