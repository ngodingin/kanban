import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { applyGlobalMigrations } from "../src/database/migrate.ts";
import {
  PERMISSION_CATALOG,
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
      "member.remove",
      "permission_group.update",
      "api_key.revoke",
    ]) {
      expect(keys).toContain(expected);
    }
    expect(keys.length).toBe(40);
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
