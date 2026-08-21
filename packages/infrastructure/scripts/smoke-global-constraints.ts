import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "kanban-global-constraints-"));
const client = createClient({ url: `file:${join(dir, "global.db")}` });
const db = drizzle(client);

async function expectUniqueViolation(fn: () => Promise<unknown>, label: string): Promise<void> {
  try {
    await fn();
    console.error(`FAIL ${label}: seharusnya constraint violation`);
    process.exitCode = 1;
  } catch {
    console.log(`PASS ${label}`);
  }
}

async function columns(table: string): Promise<string[]> {
  const res = await client.execute(`PRAGMA table_info(${table})`);
  return res.rows.map((r) => String(r.name));
}

try {
  await migrate(db, { migrationsFolder: resolve("drizzle/migrations") });

  const uid1 = "u1";
  const uid2 = "u2";
  const now = "2026-08-18T00:00:00.000Z";
  await client.execute({
    sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)",
    args: [uid1, "a@x.dev", "A", now, now],
  });
  await client.execute({
    sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)",
    args: [uid2, "b@x.dev", "B", now, now],
  });
  await expectUniqueViolation(
    () =>
      client.execute({
        sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)",
        args: ["u3", "a@x.dev", "C", now, now],
      }),
    "negatif: users.email duplikat -> UNIQUE",
  );

  await client.execute({
    sql: "INSERT INTO projects (id, owner_user_id, provisioning_state, created_at) VALUES (?, ?, 'READY', ?)",
    args: ["proj_1", uid1, now],
  });
  await client.execute({
    sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at) VALUES (?, ?, ?, ?)",
    args: ["m1", "proj_1", uid1, now],
  });
  await expectUniqueViolation(
    () =>
      client.execute({
        sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at) VALUES (?, ?, ?, ?)",
        args: ["m2", "proj_1", uid1, now],
      }),
    "negatif: membership (project_id, user_id) duplikat -> UNIQUE",
  );

  await client.execute({
    sql: "INSERT INTO permissions (id, key) VALUES ('perm_1', 'card.read')",
  });
await client.execute({
    sql: "INSERT INTO permission_groups (id, project_id, name, created_at, updated_at) VALUES ('g1', 'proj_1', 'Editor', ?, ?)",
    args: [now, now],
  });
  await client.execute({
    sql: "INSERT INTO group_permissions (group_id, permission_id, created_at) VALUES ('g1', 'perm_1', ?)",
    args: [now],
  });
  await expectUniqueViolation(
    () =>
      client.execute({
        sql: "INSERT INTO group_permissions (group_id, permission_id, created_at) VALUES ('g1', 'perm_1', ?)",
        args: [now],
      }),
    "negatif: group_permissions (group_id, permission_id) duplikat -> UNIQUE",
  );

  await client.execute({
    sql: "INSERT INTO membership_group_assignments (id, membership_id, group_id, scope_type, scope_id, created_at) VALUES ('a1', 'm1', 'g1', 'project', 'proj_1', ?)",
    args: [now],
  });
  await expectUniqueViolation(
    () =>
      client.execute({
        sql: "INSERT INTO membership_group_assignments (id, membership_id, group_id, scope_type, scope_id, created_at) VALUES ('a2', 'm1', 'g1', 'project', 'proj_1', ?)",
        args: [now],
      }),
    "negatif: assignment aktif duplikat (scope sama) -> partial UNIQUE",
  );
  await client.execute({
    sql: "UPDATE membership_group_assignments SET revoked_at = ? WHERE id = 'a1'",
    args: [now],
  });
  await client.execute({
    sql: "INSERT INTO membership_group_assignments (id, membership_id, group_id, scope_type, scope_id, created_at) VALUES ('a3', 'm1', 'g1', 'project', 'proj_1', ?)",
    args: [now],
  });
  console.log("PASS positif: assignment yang sama boleh dibuat ulang setelah revoked_at (partial UNIQUE)");

  await client.execute({
    sql: "INSERT INTO membership_group_assignments (id, membership_id, group_id, scope_type, scope_id, created_at) VALUES ('a4', 'm1', 'g1', 'list', 'list_1', ?)",
    args: [now],
  });
  await client.execute({
    sql: "INSERT INTO membership_group_assignments (id, membership_id, group_id, scope_type, scope_id, created_at) VALUES ('a5', 'm1', 'g1', 'card', 'card_1', ?)",
    args: [now],
  });
  console.log("PASS positif: membership_group_assignments menerima scope_type list/card (B.2)");
  await expectUniqueViolation(
    () =>
      client.execute({
        sql: "INSERT INTO membership_group_assignments (id, membership_id, group_id, scope_type, scope_id, created_at) VALUES ('a6', 'm1', 'g1', 'invalid', 'x', ?)",
        args: [now],
      }),
    "negatif: membership_group_assignments.scope_type di luar enum -> CHECK",
  );

  await client.execute({
    sql: "INSERT INTO membership_permission_assignments (id, membership_id, permission_id, scope_type, scope_id, created_at) VALUES ('pa1', 'm1', 'perm_1', 'list', 'list_1', ?)",
    args: [now],
  });
  await client.execute({
    sql: "INSERT INTO membership_permission_assignments (id, membership_id, permission_id, scope_type, scope_id, created_at) VALUES ('pa2', 'm1', 'perm_1', 'card', 'card_1', ?)",
    args: [now],
  });
  console.log("PASS positif: membership_permission_assignments menerima scope_type list/card (B.2)");
  await expectUniqueViolation(
    () =>
      client.execute({
        sql: "INSERT INTO membership_permission_assignments (id, membership_id, permission_id, scope_type, scope_id, created_at) VALUES ('pa3', 'm1', 'perm_1', 'invalid', 'x', ?)",
        args: [now],
      }),
    "negatif: membership_permission_assignments.scope_type di luar enum -> CHECK",
  );

  await client.execute({
    sql: "INSERT INTO invitations (id, project_id, email, invited_by_user_id, expires_at, created_at) VALUES ('inv1', 'proj_1', 'c@x.dev', ?, ?, ?)",
    args: [uid1, now, now],
  });
  await client.execute({
    sql: "INSERT INTO invitation_group_assignments (id, invitation_id, group_id, scope_type, scope_id) VALUES ('iga1', 'inv1', 'g1', 'list', 'list_1')",
  });
  await client.execute({
    sql: "INSERT INTO invitation_group_assignments (id, invitation_id, group_id, scope_type, scope_id) VALUES ('iga2', 'inv1', 'g1', 'card', 'card_1')",
  });
  console.log("PASS positif: invitation_group_assignments menerima scope_type list/card (B.2)");
  await expectUniqueViolation(
    () =>
      client.execute({
        sql: "INSERT INTO invitation_group_assignments (id, invitation_id, group_id, scope_type, scope_id) VALUES ('iga3', 'inv1', 'g1', 'invalid', 'x')",
      }),
    "negatif: invitation_group_assignments.scope_type di luar enum -> CHECK",
  );

  const gcols = await columns("membership_group_assignments");
  if (!gcols.includes("scope_type")) throw new Error("kolom scope_type hilang");
  if (!gcols.includes("revoked_at")) throw new Error("kolom revoked_at hilang");
  console.log("PASS: scoped assignment punya scope_type + revoked_at");

  const keyCols = await columns("api_keys");
  const patCols = await columns("personal_access_tokens");
  if (!keyCols.includes("key_hash") || keyCols.includes("key")) throw new Error("api_keys wajib key_hash, tanpa kolom key plaintext");
  if (!patCols.includes("token_hash") || patCols.includes("token")) throw new Error("pat wajib token_hash, tanpa kolom token plaintext");
  console.log("PASS: credential disimpan hashed (key_hash/token_hash), tidak ada kolom raw");

  const verCols = await columns("auth_verifications");
  if (!verCols.includes("identifier") || !verCols.includes("value") || !verCols.includes("expires_at")) {
    throw new Error("auth_verifications kontrak Better Auth kurang");
  }
  console.log("PASS: auth_verifications.identifier = wadah token hash (magic link storeToken hashed)");

  const userCols = await columns("users");
  const sessionCols = await columns("auth_sessions");
  const accountCols = await columns("auth_accounts");
  const userNeed = ["id", "email", "email_verified", "name", "image", "created_at", "updated_at"];
  const sessionNeed = ["id", "user_id", "token", "expires_at", "ip_address", "user_agent", "created_at", "updated_at"];
  const accountNeed = [
    "id",
    "user_id",
    "account_id",
    "provider_id",
    "access_token",
    "refresh_token",
    "id_token",
    "access_token_expires_at",
    "refresh_token_expires_at",
    "scope",
    "password",
    "created_at",
    "updated_at",
  ];
  for (const c of [...userNeed, ...sessionNeed, ...accountNeed]) {
    const table = userNeed.includes(c) ? userCols : sessionNeed.includes(c) ? sessionCols : accountCols;
    if (!table.includes(c)) throw new Error(`kolom Better Auth ${c} hilang`);
  }
  console.log("PASS: mapping Better Auth core (users/auth_sessions/auth_accounts) — kolom lengkap snake_case per B.2");

  console.log("smoke global constraints selesai");
} finally {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
}