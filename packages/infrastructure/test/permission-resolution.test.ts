import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { applyGlobalMigrations } from "../src/database/migrate.ts";
import { loadEffectivePermissionInputs } from "../src/database/permission-resolution.ts";

const NOW = "2026-08-22T00:00:00.000Z";
const PROJECT = "proj_perm";
const OWNER = "user_owner_1";
const MEMBER = "user_member_1";
let dir: string;
let client: Client;

async function insertMembership(id: string): Promise<void> {
  const userId = `user_${id}`;
  await client.execute({
    sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
    args: [userId, `${userId}@t.local`, userId, NOW, NOW],
  });
  await client.execute({
    sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES (?, ?, ?, ?, NULL)",
    args: [id, PROJECT, userId, NOW],
  });
}

let seq = 0;
async function insertGroup(id: string): Promise<void> {
  await client.execute({
    sql: "INSERT INTO permission_groups (id, project_id, name, description, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)",
    args: [id, PROJECT, `Group ${id}`, NOW, NOW],
  });
}
async function insertGroupPermission(groupId: string, key: string, visibility?: string): Promise<void> {
  seq += 1;
  const permId = `perm_${seq}`;
  await client.execute({
    sql: "INSERT OR IGNORE INTO permissions (id, key) VALUES (?, ?)",
    args: [permId, key],
  });
  // INSERT OR IGNORE di atas bisa skip bila key sudah ada — ambil id aktual.
  const actual = await client.execute({ sql: "SELECT id FROM permissions WHERE key = ?", args: [key] });
  const pid = String(actual.rows[0]!.id);
  await client.execute({
    sql: "INSERT INTO group_permissions (group_id, permission_id, card_read_visibility, created_at) VALUES (?, ?, ?, ?)",
    args: [groupId, pid, visibility ?? null, NOW],
  });
}
async function insertGroupAssignment(id: string, membershipId: string, groupId: string, opts: { revokedAt?: string | null; scopeType?: string } = {}): Promise<void> {
  await client.execute({
    sql: "INSERT INTO membership_group_assignments (id, membership_id, group_id, scope_type, scope_id, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [id, membershipId, groupId, opts.scopeType ?? "project", (opts.scopeType ?? "project") === "project" ? PROJECT : "scope_x", NOW, opts.revokedAt ?? null],
  });
}
async function insertDirectAssignment(id: string, membershipId: string, key: string, opts: { revokedAt?: string | null; visibility?: string | null } = {}): Promise<void> {
  seq += 1;
  await client.execute(
    { sql: "INSERT OR IGNORE INTO permissions (id, key) VALUES (?, ?)", args: [`perm_${seq}`, key] },
  );
  const actual = await client.execute({ sql: "SELECT id FROM permissions WHERE key = ?", args: [key] });
  const pid = String(actual.rows[0]!.id);
  await client.execute({
    sql: "INSERT INTO membership_permission_assignments (id, membership_id, permission_id, scope_type, scope_id, card_read_visibility, created_at, revoked_at) VALUES (?, ?, ?, 'project', ?, ?, ?, ?)",
    args: [id, membershipId, pid, PROJECT, opts.visibility ?? null, NOW, opts.revokedAt ?? null],
  });
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kanban-perm-resolution-"));
  client = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(client);
  for (const user of [OWNER, MEMBER]) {
    await client.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
      args: [user, `${user}@t.local`, user, NOW, NOW],
    });
  }
  await client.execute({
    sql: "INSERT INTO projects (id, owner_user_id, provisioning_state, created_at) VALUES (?, ?, 'READY', ?)",
    args: [PROJECT, OWNER, NOW],
  });
});

afterAll(async () => {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("loadEffectivePermissionInputs — goal 4.2.1", () => {
  it("[BR-038] Membership tanpa assignment → kedua array kosong (bukan error)", async () => {
    await insertMembership("m_empty");
    const inputs = await loadEffectivePermissionInputs(client, "m_empty");
    expect(inputs.groupAssignments).toEqual([]);
    expect(inputs.directAssignments).toEqual([]);
  });

  it("[BR-040][Review-CL-02] Group dengan card.read ber-visibility → entry membawa cardReadVisibility miliknya", async () => {
    await insertMembership("m_vis");
    await insertGroup("g_vis");
    await insertGroupPermission("g_vis", "card.read", "ASSIGNED_TO_ME");
    await insertGroupPermission("g_vis", "milestone.create");
    await insertGroupAssignment("ga_vis", "m_vis", "g_vis");

    const inputs = await loadEffectivePermissionInputs(client, "m_vis");
    expect(inputs.groupAssignments).toHaveLength(1);
    expect(inputs.groupAssignments[0]).toMatchObject({ scopeType: "project", scopeId: PROJECT });
    expect(inputs.groupAssignments[0]!.permissions).toEqual([
      { key: "card.read", cardReadVisibility: "ASSIGNED_TO_ME" },
      { key: "milestone.create" },
    ]);
  });

  it("[BR-041] Assignment AKTIF ke Group soft-deleted → TIDAK ter-load sama sekali", async () => {
    await insertMembership("m_del");
    await insertGroup("g_dead");
    await insertGroupPermission("g_dead", "board.update");
    await client.execute({ sql: "UPDATE permission_groups SET deleted_at = ? WHERE id = 'g_dead'", args: [NOW] });
    await insertGroupAssignment("ga_dead", "m_del", "g_dead");

    const inputs = await loadEffectivePermissionInputs(client, "m_del");
    expect(inputs.groupAssignments).toEqual([]);
  });

  it("[BR-038] Revoked (Group & direct) TIDAK ter-load — filter di query; aktif tetap masuk", async () => {
    await insertMembership("m_rev");
    await insertGroup("g_live");
    await insertGroupPermission("g_live", "card.move");
    await insertGroupAssignment("ga_ok", "m_rev", "g_live");
    await insertGroupAssignment("ga_revoked", "m_rev", "g_live", { revokedAt: NOW });

    await insertDirectAssignment("da_ok", "m_rev", "member.invite", { visibility: "ALL" });
    await insertDirectAssignment("da_revoked", "m_rev", "list.delete", { revokedAt: NOW });

    const inputs = await loadEffectivePermissionInputs(client, "m_rev");
    expect(inputs.groupAssignments).toHaveLength(1);
    expect(inputs.groupAssignments[0]!.permissions.map((p) => p.key)).toEqual(["card.move"]);
    expect(inputs.directAssignments).toHaveLength(1);
    expect(inputs.directAssignments[0]).toMatchObject({
      permissionKey: "member.invite",
      cardReadVisibility: "ALL",
      scopeType: "project",
      scopeId: PROJECT,
    });
  });

  it("[Bug ditemukan saat redo CL-25] Group YANG SAMA di-assign ke Membership ini di DUA scope berbeda → keduanya muncul terpisah, tidak tertimpa/tercampur", async () => {
    // Skema mengizinkan ini: uniqueIndex membership_group_assignments_active_unique
    // atas (membershipId, groupId, scopeType, scopeId) — BUKAN (membershipId,
    // groupId) — jadi Group X boleh aktif di scope Milestone A DAN scope Board B
    // sekaligus untuk Membership yang sama.
    await insertMembership("m_multiscope");
    await insertGroup("g_multiscope");
    await insertGroupPermission("g_multiscope", "card.move");
    await insertGroupPermission("g_multiscope", "list.delete");
    await client.execute({
      sql: "INSERT INTO membership_group_assignments (id, membership_id, group_id, scope_type, scope_id, created_at, revoked_at) VALUES (?, ?, ?, 'milestone', 'ms_x', ?, NULL)",
      args: ["ga_ms", "m_multiscope", "g_multiscope", NOW],
    });
    await client.execute({
      sql: "INSERT INTO membership_group_assignments (id, membership_id, group_id, scope_type, scope_id, created_at, revoked_at) VALUES (?, ?, ?, 'board', 'bd_y', ?, NULL)",
      args: ["ga_bd", "m_multiscope", "g_multiscope", NOW],
    });

    const inputs = await loadEffectivePermissionInputs(client, "m_multiscope");
    expect(inputs.groupAssignments).toHaveLength(2);
    const byScope = new Map(inputs.groupAssignments.map((g) => [`${g.scopeType}:${g.scopeId}`, g]));
    const msEntry = byScope.get("milestone:ms_x");
    const bdEntry = byScope.get("board:bd_y");
    expect(msEntry, "assignment scope milestone hilang").toBeDefined();
    expect(bdEntry, "assignment scope board hilang").toBeDefined();
    expect(msEntry!.permissions.map((p) => p.key).sort()).toEqual(["card.move", "list.delete"]);
    expect(bdEntry!.permissions.map((p) => p.key).sort()).toEqual(["card.move", "list.delete"]);
  });

  it("[DoD] Scoped ke SATU membership — assignment Membership lain tidak bocor", async () => {
    await insertMembership("m_other");
    await insertGroup("g_other");
    await insertGroupPermission("g_other", "project.update");
    await insertGroupAssignment("ga_other", "m_other", "g_other");

    const mine = await loadEffectivePermissionInputs(client, "m_rev");
    expect(mine.groupAssignments).toHaveLength(1); // hanya g_live
    const other = await loadEffectivePermissionInputs(client, "m_other");
    expect(other.groupAssignments[0]!.permissions.map((p) => p.key)).toEqual(["project.update"]);
  });
});
