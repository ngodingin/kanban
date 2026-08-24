import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { applyGlobalMigrations, registerProjectWithOwnerMembership } from "@kanban/infrastructure";
import { acceptInvitation } from "../src/database/project-admin.ts";

const BASE = "2026-01-01T00:00:00.000Z";
let dir: string;
let gc: Client;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kanban-ac025-"));
  gc = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(gc);
  for (const u of ["u-owner", "u-invitee"]) {
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

describe("AC-025 — scoped assignment tepat Milestone X saat accept (goal 6.8.5)", () => {
  it("[AC-025] invitation scoped di Milestone X → assignment scope_type='milestone' scope_id=MX", async () => {
    const pid = "p-ac025";
    const mxId = "ms-x";
    await registerProjectWithOwnerMembership(gc, {
      projectId: pid,
      databaseId: `file:${join(dir, `${pid}.db`)}`,
      ownerUserId: "u-owner",
      now: BASE,
    });
    // Invitation dengan assignment Milestone X (seed SQL langsung)
    await gc.execute({
      sql: "INSERT INTO invitations (id, project_id, email, invited_by_user_id, expires_at, created_at) VALUES ('inv-mx', ?, 'u-invitee@t.local', 'u-owner', '2099-01-01', ?)",
      args: [pid, BASE],
    });
    await gc.execute({
      sql: "INSERT INTO permission_groups (id, project_id, name, created_at, updated_at) VALUES ('g-mx', ?, 'G', ?, ?)",
      args: [pid, BASE, BASE],
    });
    await gc.execute("INSERT OR IGNORE INTO permissions (id, key) VALUES ('perm-mx', 'card.create')");
    const permRow = await gc.execute({ sql: "SELECT id FROM permissions WHERE key = 'card.create'" });
    await gc.execute({
      sql: "INSERT INTO group_permissions (group_id, permission_id, created_at) VALUES ('g-mx', ?, ?)",
      args: [String(permRow.rows[0]!.id), BASE],
    });
    await gc.execute({
      sql: "INSERT INTO invitation_group_assignments (id, invitation_id, group_id, scope_type, scope_id) VALUES ('iga-mx', 'inv-mx', 'g-mx', 'milestone', ?)",
      args: [mxId],
    });

    await acceptInvitation(gc, {
      invitationId: "inv-mx",
      userId: "u-invitee",
      userEmail: "u-invitee@t.local",
    });

    const rows = await gc.execute({
      sql: `SELECT a.scope_type AS st, a.scope_id AS si FROM membership_group_assignments a
            JOIN project_memberships m ON m.id = a.membership_id
            WHERE m.project_id = ? AND m.user_id = 'u-invitee' AND a.revoked_at IS NULL`,
      args: [pid],
    });
    expect(rows.rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows.rows) {
      expect(String(r.st)).toBe("milestone");
      expect(String(r.si)).toBe(mxId);
    }
  });
});
