import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client, type InArgs } from "@libsql/client";
import { applyGlobalMigrations } from "../src/database/migrate.ts";
import {
  BASELINE_GROUP_NAMES,
  PERMISSION_CATALOG,
  baselineGroupPermissionKeys,
} from "../src/database/permission-catalog.ts";
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

async function provision(projectId: string, failingClient?: Client): Promise<void> {
  await registerProjectWithOwnerMembership(failingClient ?? client, {
    projectId,
    databaseId: `kanban-${projectId}`,
    ownerUserId: "user_owner_1",
    now: NOW,
  });
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kanban-baseline-groups-"));
  client = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(client);
  await client.execute({
    sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES ('user_owner_1', 'owner@test.local', 1, 'Owner', ?, ?)",
    args: [NOW, NOW],
  });
});

afterAll(async () => {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("baseline Permission Groups saat provisioning (goal 1.6.1)", () => {
  it("[D.2][BR-039] create Project menghasilkan tepat 4 group baseline project-scoped tanpa group bernama Owner", async () => {
    await provision("proj_g1");

    const groups = await client.execute({
      sql: "SELECT name, project_id FROM permission_groups WHERE project_id = ? ORDER BY name",
      args: ["proj_g1"],
    });
    expect(groups.rows.length).toBe(4);
    const names = groups.rows.map((r) => String(r.name)).sort();
    expect(names).toEqual([...BASELINE_GROUP_NAMES].sort());
    expect(names).not.toContain("Owner");
    for (const row of groups.rows) {
      expect(String(row.project_id)).toBe("proj_g1");
    }
    expect(await countRows("permission_groups", "name = 'Owner'")).toBe(0);
  });

  it("[D.2] set group_permissions sesuai matrix: Co-Owner 40 (semua), Manager M/B/L penuh + Card baca-tulis-tanpa-restore, Contributor card-ops + read, Viewer hanya *.read", async () => {
    const keysOf = async (group: string): Promise<string[]> => {
      const rows = await client.execute({
        sql: "SELECT p.key FROM group_permissions gp JOIN permissions p ON p.id = gp.permission_id JOIN permission_groups g ON g.id = gp.group_id WHERE g.project_id = ? AND g.name = ?",
        args: ["proj_g1", group],
      });
      return rows.rows.map((r) => String(r.key)).sort();
    };

    for (const group of BASELINE_GROUP_NAMES) {
      const expected = [...baselineGroupPermissionKeys(group)].sort();
      const actual = await keysOf(group);
      expect(actual).toEqual(expected);
      expect(new Set(actual).size).toBe(actual.length);
    }

    expect((await keysOf("Co-Owner")).length).toBe(PERMISSION_CATALOG.length);

    const manager = await keysOf("Manager");
    for (const key of ["milestone.restore", "board.restore", "list.restore"]) {
      expect(manager).toContain(key);
    }
    expect(manager).not.toContain("card.restore");
    expect(manager).not.toContain("project.update");
    expect(manager).not.toContain("member.invite");
    expect(manager).not.toContain("api_key.create");

    const contributor = await keysOf("Contributor");
    for (const key of ["card.create", "card.update", "card.move", "card.archive", "card.delete", "card.comment"]) {
      expect(contributor).toContain(key);
    }
    expect(contributor).not.toContain("permission_group.read");
    expect(contributor).not.toContain("member.remove");

    const viewer = await keysOf("Viewer");
    expect(viewer.every((key) => key.endsWith(".read"))).toBe(true);
    expect(viewer).toContain("card.read");
    expect(viewer).not.toContain("card.create");
  });

  it("[BR-039][BR-036][BR-047][BR-048] konfigurasi tersimpan sebagai data — tidak ada kolom role; visibility hanya pada card.read dan default CREATED_BY_ME", async () => {
    const rows = await client.execute({
      sql: "SELECT p.key AS permission_key, gp.card_read_visibility FROM group_permissions gp JOIN permissions p ON p.id = gp.permission_id JOIN permission_groups g ON g.id = gp.group_id WHERE g.project_id = ?",
      args: ["proj_g1"],
    });
    expect(rows.rows.length).toBeGreaterThan(0);
    for (const row of rows.rows) {
      if (row.permission_key === "card.read") {
        // BR-047/BR-048: baseline seed tidak memberi visibility eksplisit -> service mengisi CREATED_BY_ME.
        expect(row.card_read_visibility).toBe("CREATED_BY_ME");
      } else {
        // Visibility MUST NULL untuk permission selain card.read (03-ENG B.2).
        expect(row.card_read_visibility ?? null).toBeNull();
      }
    }

    const columns = await client.execute("PRAGMA table_info(permission_groups)");
    const names = columns.rows.map((c) => String(c.name));
    expect(names).not.toContain("role");
  });

  it("[INV-09] rollback atomik: kegagalan saat insert group_permissions menyisakan tidak ada project/membership/group yatim", async () => {
    const failing = clientFailingOn(client, "group_permissions");
    await expect(provision("proj_fail", failing)).rejects.toThrow(/group_permissions/);

    expect(await countRows("projects", "id = 'proj_fail'")).toBe(0);
    expect(await countRows("project_databases", "project_id = 'proj_fail'")).toBe(0);
    expect(await countRows("project_memberships", "project_id = 'proj_fail'")).toBe(0);
    expect(await countRows("permission_groups", "project_id = 'proj_fail'")).toBe(0);
  });

  it("[D.1][D.2] provisioning kedua idempotent terhadap katalog: permissions tetap tepat 40 row, group baru per-project", async () => {
    await provision("proj_g2");

    expect(await countRows("permissions")).toBe(PERMISSION_CATALOG.length);
    expect(await countRows("permission_groups", "project_id = 'proj_g2'")).toBe(4);
    expect(await countRows("permission_groups", "project_id = 'proj_g1'")).toBe(4);
  });
});
