import { createClient, type Client, type InArgs } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyGlobalMigrations } from "../src/database/migrate.ts";
import { registerProjectWithOwnerMembership } from "../src/provisioning/provision.ts";

const NOW = "2026-08-22T00:00:00.000Z";

let dir: string;
let client: Client;

function clientFailingOn(base: Client, needle: string): Client {
  const wrapper = {
    async transaction() {
      const tx = await base.transaction("write");
      return {
        async execute(stmt: Parameters<typeof tx.execute>[0]) {
          const sql = typeof stmt === "string" ? stmt : stmt.sql;
          if (sql.includes(needle)) throw new Error(`injected failure on ${needle}`);
          return tx.execute(stmt);
        },
        commit: () => tx.commit(),
        rollback: () => tx.rollback(),
        close: () => tx.close(),
      };
    },
    execute: base.execute.bind(base),
    batch: base.batch.bind(base),
    closed: false,
    close: base.close.bind(base),
  };
  return wrapper as unknown as Client;
}

async function countRows(table: string, where = "1=1", args: InArgs = []): Promise<number> {
  const r = await client.execute({ sql: `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, args });
  return Number(r.rows[0]?.n);
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kanban-global-test-"));
  client = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(client);
});

afterEach(async () => {
  for (const table of [
    "membership_permission_assignments",
    "membership_group_assignments",
    "invitation_group_assignments",
    "invitations",
    "group_permissions",
    "permission_groups",
    "project_memberships",
    "project_databases",
    "projects",
    "users",
  ]) {
    await client.execute(`DELETE FROM ${table}`);
  }
});

afterAll(async () => {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("registerProjectWithOwnerMembership (goal 1.2.1 — FR-001/FR-002)", () => {
  beforeEach(async () => {
    await client.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)",
      args: ["user_owner_1", "owner@test.local", "Owner", NOW, NOW],
    });
  });

  it("FR-002: registrasi menghasilkan tepat satu Membership aktif untuk Owner sejak commit pertama", async () => {
    await registerProjectWithOwnerMembership(client, {
      projectId: "proj_1",
      databaseId: "kanban-proj-1",
      ownerUserId: "user_owner_1",
      now: NOW,
    });

    expect(await countRows("projects", "id = 'proj_1'")).toBe(1);
    expect(await countRows("project_databases", "project_id = 'proj_1' AND database_id = 'kanban-proj-1'")).toBe(1);
    expect(await countRows("project_memberships", "project_id = 'proj_1'")).toBe(1);

    const m = await client.execute(
      "SELECT user_id, revoked_at FROM project_memberships WHERE project_id = 'proj_1'",
    );
    expect(m.rows[0]?.user_id).toBe("user_owner_1");
    expect(m.rows[0]?.revoked_at).toBeNull();
  });

  it("rollback atomik: kegagalan di tengah transaksi Global tidak menyisakan Project/mapping/membership yatim", async () => {
    const failing = clientFailingOn(client, "project_memberships");
    await expect(
      registerProjectWithOwnerMembership(failing, {
        projectId: "proj_fail",
        databaseId: "kanban-proj-fail",
        ownerUserId: "user_owner_1",
        now: NOW,
      }),
    ).rejects.toThrow(/project_memberships/);

    expect(await countRows("projects", "id = 'proj_fail'")).toBe(0);
    expect(await countRows("project_databases", "project_id = 'proj_fail'")).toBe(0);
    expect(await countRows("project_memberships", "project_id = 'proj_fail'")).toBe(0);
  });

  it("registrasi duplikat projectId ditolak dan tidak menambah membership; registry eksisting utuh", async () => {
    await registerProjectWithOwnerMembership(client, {
      projectId: "proj_dup",
      databaseId: "kanban-proj-dup",
      ownerUserId: "user_owner_1",
      now: NOW,
    });
    await expect(
      registerProjectWithOwnerMembership(client, {
        projectId: "proj_dup",
        databaseId: "kanban-proj-dup-2",
        ownerUserId: "user_owner_1",
        now: NOW,
      }),
    ).rejects.toThrow();

    expect(await countRows("project_memberships", "project_id = 'proj_dup'")).toBe(1);
    expect(await countRows("project_databases", "project_id = 'proj_dup'")).toBe(1);
  });

  it("FK domain layer: ownerUserId yang tidak ada di users ditolak, tanpa row yatim (03-ENG A.5)", async () => {
    await expect(
      registerProjectWithOwnerMembership(client, {
        projectId: "proj_orphan",
        databaseId: "kanban-proj-orphan",
        ownerUserId: "user_ghost",
        now: NOW,
      }),
    ).rejects.toBeDefined();

    expect(await countRows("projects", "id = 'proj_orphan'")).toBe(0);
    expect(await countRows("project_memberships", "project_id = 'proj_orphan'")).toBe(0);
  });
});
