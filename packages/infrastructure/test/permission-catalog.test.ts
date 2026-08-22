import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { applyGlobalMigrations } from "../src/database/migrate.ts";
import { registerProjectWithOwnerMembership } from "../src/provisioning/provision.ts";
import {
  PERMISSION_CATALOG,
  baselineGroupPermissionKeys,
  permissionCatalogKeys,
  seedPermissionCatalog,
} from "../src/database/permission-catalog.ts";

let dir: string;
let client: Client;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kanban-perm-catalog-"));
  client = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(client);
});

afterAll(async () => {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("seedPermissionCatalog — katalog permission D.1 (goal 1.5.1)", () => {
  it("[D.1] katalog berisi seluruh key kanonik D.1 (40 key) tanpa duplikat di daftar", () => {
    const keys = permissionCatalogKeys();
    expect(new Set(keys).size).toBe(keys.length);
    for (const expected of [
      "project.read",
      "project.update",
      "milestone.restore",
      "board.archive",
      "list.create",
      "card.move",
      "card.comment.update",
      "milestone_label.restore",
      "board_label.create",
      "member.remove",
      "permission_group.update",
      "api_key.revoke",
    ]) {
      expect(keys).toContain(expected);
    }
    expect(keys.length).toBe(52);
    expect(PERMISSION_CATALOG.every((e) => e.description.length > 0)).toBe(true);
  });

  it("[D.1] seed mengisi tepat satu row per key D.1", async () => {
    const { inserted } = await seedPermissionCatalog(client);
    expect(inserted).toBe(PERMISSION_CATALOG.length);

    const rows = await client.execute("SELECT key FROM permissions");
    expect(rows.rows.length).toBe(PERMISSION_CATALOG.length);
    const dbKeys = rows.rows.map((r) => String(r.key)).sort();
    expect(dbKeys).toEqual([...permissionCatalogKeys()].sort());
  });

  it("[D.1] re-run seed dua kali berturut-turut idempotent: jumlah row sama, tidak ada duplikat, tidak error", async () => {
    const second = await seedPermissionCatalog(client);
    expect(second.inserted).toBe(0);
    const third = await seedPermissionCatalog(client);
    expect(third.inserted).toBe(0);

    const count = await client.execute("SELECT COUNT(*) AS n FROM permissions");
    expect(Number(count.rows[0]?.n)).toBe(PERMISSION_CATALOG.length);

    const dupes = await client.execute(
      "SELECT key, COUNT(*) AS n FROM permissions GROUP BY key HAVING n > 1",
    );
    expect(dupes.rows.length).toBe(0);
  });
});

describe("unique index permissions.key — goal 1.5.2", () => {
  it("[B.2] negatif: INSERT key duplikat ditolak DB (permissions_key_unique), bukan hanya oleh aplikasi", async () => {
    const existing = await client.execute("SELECT key FROM permissions LIMIT 1");
    const key = String(existing.rows[0]!.key);
    await expect(
      client.execute({
        sql: "INSERT INTO permissions (id, key, description) VALUES (?, ?, ?)",
        args: ["dup-id-bukan-ulid-asli", key, "duplikat"],
      }),
    ).rejects.toThrow();

    const count = await client.execute({
      sql: "SELECT COUNT(*) AS n FROM permissions WHERE key = ?",
      args: [key],
    });
    expect(Number(count.rows[0]?.n)).toBe(1);
  });

  it("[D.1] rowsAffected ON CONFLICT DO NOTHING: seed ulang mengembalikan 0 tanpa menaikkan id baru", async () => {
    const before = await client.execute("SELECT id FROM permissions ORDER BY id");
    await seedPermissionCatalog(client);
    const after = await client.execute("SELECT id FROM permissions ORDER BY id");
    expect(after.rows.map((r) => String(r.id))).toEqual(before.rows.map((r) => String(r.id)));
  });
});

describe("baselineGroupPermissionKeys — Label keys (goal 3.1.1, D.2 baris Label)", () => {
  const LABEL_KEYS = [
    ...["read", "create", "update", "archive", "delete", "restore"].map((a) => `milestone_label.${a}`),
    ...["read", "create", "update", "archive", "delete", "restore"].map((a) => `board_label.${a}`),
  ];

  it("[D.2][D.1] katalog memuat tepat 12 key Label baru dengan deskripsi terisi", () => {
    const keys = permissionCatalogKeys();
    for (const key of LABEL_KEYS) {
      expect(keys, key).toContain(key);
    }
    const entries = PERMISSION_CATALOG.filter((e) => e.key.includes("_label."));
    expect(entries).toHaveLength(12);
    expect(entries.every((e) => e.description.length > 0)).toBe(true);
  });

  it("[D.2] Manager full lifecycle Label — seluruh 12 key baru ada", () => {
    const manager = baselineGroupPermissionKeys("Manager");
    for (const key of LABEL_KEYS) {
      expect(manager, key).toContain(key);
    }
  });

  it("[D.2] Contributor TIDAK mendapat satu pun key Label (assign/remove cukup lewat card.update)", () => {
    const contributor = baselineGroupPermissionKeys("Contributor");
    for (const key of LABEL_KEYS) {
      expect(contributor, key).not.toContain(key);
    }
  });

  it("[D.2] Co-Owner otomatis penuh dan Viewer otomatis .read tanpa perubahan case eksplisit", () => {
    const coOwner = baselineGroupPermissionKeys("Co-Owner");
    for (const key of LABEL_KEYS) {
      expect(coOwner, key).toContain(key);
    }
    const viewer = baselineGroupPermissionKeys("Viewer");
    for (const key of LABEL_KEYS.filter((k) => k.endsWith(".read"))) {
      expect(viewer, key).toContain(key);
    }
    for (const key of LABEL_KEYS.filter((k) => !k.endsWith(".read"))) {
      expect(viewer, key).not.toContain(key);
    }
  });
});

describe("[DoD 3.1.1] provisioning Project baru menghasilkan baseline Manager dengan Label lifecycle penuh", () => {
  it("[D.2][end-to-end] group_permissions Manager memuat 12 key Label setelah registerProjectWithOwnerMembership", async () => {
    const now = "2026-08-23T00:00:00.000Z";
    await client.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES ('user-prov', 'prov@test.local', 1, 'prov', ?, ?)",
      args: [now, now],
    });
    const projectId = `prov-${Date.now()}`;
    await registerProjectWithOwnerMembership(client, {
      projectId,
      databaseId: `file:${join(dir, `prov-${projectId}.db`)}`,
      ownerUserId: "user-prov",
      now,
    });

    const managerRows = await client.execute(
      `SELECT p.key FROM group_permissions gp
       JOIN permission_groups g ON g.id = gp.group_id
       JOIN permissions p ON p.id = gp.permission_id
       WHERE g.project_id = ? AND g.name = 'Manager'`,
      [projectId],
    );
    const keys = managerRows.rows.map((r) => String(r.key));
    for (const action of ["read", "create", "update", "archive", "delete", "restore"]) {
      expect(keys).toContain(`milestone_label.${action}`);
      expect(keys).toContain(`board_label.${action}`);
    }

    const contributorRows = await client.execute(
      `SELECT p.key FROM group_permissions gp
       JOIN permission_groups g ON g.id = gp.group_id
       JOIN permissions p ON p.id = gp.permission_id
       WHERE g.project_id = ? AND g.name = 'Contributor'`,
      [projectId],
    );
    for (const row of contributorRows.rows) {
      expect(String(row.key)).not.toContain("_label.");
    }
  });
});
