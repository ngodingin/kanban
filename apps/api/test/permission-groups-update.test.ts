import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import {
  applyGlobalMigrations,
  newProjectId,
  registerProjectWithOwnerMembership,
} from "@kanban/infrastructure";
import { buildProjectAdminDeps } from "../src/project-deps.ts";
import { createProjectAdminRouter, type ProjectAdminRoutesDeps } from "../src/routes/project-admin.ts";

// Goal 1.7.3 — PATCH /api/v1/projects/:project_id/permission-groups/:group_id
// (C.12): ubah name/description/permissions, REPLACE set dalam transaksi,
// BR-040 live reference (assignment member tak tersentuh), Owner-only interim,
// boundary Project (invariant #4).

interface TestCtx {
  globalClient: Client;
  deps: ProjectAdminRoutesDeps;
  dir: string;
  projectIdA: string;
}

let ctx: TestCtx;
const projectIdB = `pg-b-${newProjectId()}`;

async function permissionIdByKey(globalClient: Client, key: string): Promise<string> {
  const rows = await globalClient.execute({ sql: "SELECT id FROM permissions WHERE key = ?", args: [key] });
  return String(rows.rows[0]!.id);
}

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-pgroup-update-"));
  const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  const now = new Date().toISOString();
  for (const user of ["user-a", "user-b"]) {
    await globalClient.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
      args: [user, `${user}@test.local`, user, now, now],
    });
  }

  const projectIdA = `pg-a-${newProjectId()}`;
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: projectIdA,
    databaseId: `file:${join(dir, "unused-a.db")}`,
    ownerUserId: "user-a",
    now,
  });
  await globalClient.execute({
    sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES (?, ?, 'user-b', ?, NULL)",
    args: [`m-b-${projectIdA}`, projectIdA, now],
  });
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: projectIdB,
    databaseId: `file:${join(dir, "unused-b.db")}`,
    ownerUserId: "user-b",
    now,
  });

  ctx = {
    globalClient,
    dir,
    projectIdA,
    deps: buildProjectAdminDeps({
      identityResolver: {
        resolveIdentity: async (request) => {
          const userId = request.headers.get("x-test-user");
          if (userId === null) return null;
          return {
            type: "session",
            userId,
            email: `${userId}@test.local`,
            name: userId,
            emailVerified: true,
            image: null,
          };
        },
      },
      globalClient,
    }),
  };
});

afterAll(async () => {
  await ctx.globalClient.close();
  await rm(ctx.dir, { recursive: true, force: true });
});

function makeApp(): Hono {
  return new Hono().route("/", createProjectAdminRouter(() => ctx.deps));
}

async function patchGroup(projectId: string, groupId: string, body: unknown, user: string) {
  return makeApp().request(`http://localhost/v1/projects/${projectId}/permission-groups/${groupId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-test-user": user },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/v1/projects/:project_id/permission-groups/:group_id (goal 1.7.3)", () => {
  let groupId = "";
  let groupIdB = "";

  beforeAll(async () => {
    const created = await ctx.deps.createPermissionGroup(ctx.projectIdA, {
      name: "Ops Lama",
      description: "sebelum update",
      permissions: [{ permissionId: await permissionIdByKey(ctx.globalClient, "card.read") }],
    });
    groupId = created.id;
    // Assignment aktif dari membership user-b ke group ini (untuk bukti BR-040).
    await ctx.globalClient.execute({
      sql: "INSERT INTO membership_group_assignments (id, membership_id, group_id, scope_type, scope_id, created_at, revoked_at) VALUES (?, ?, ?, 'project', ?, ?, NULL)",
      args: [`asg-${groupId}`, `m-b-${ctx.projectIdA}`, groupId, ctx.projectIdA, new Date().toISOString()],
    });
    const createdB = await ctx.deps.createPermissionGroup(projectIdB, {
      name: "Group Project B",
      permissions: [],
    });
    groupIdB = createdB.id;
  });

  it("[C.12][BR-039][FR-010] Owner mengubah nama+description; state baru terbaca", async () => {
    const res = await patchGroup(ctx.projectIdA, groupId, { name: "Ops Baru", description: "sesudah" }, "user-a");
    if (res.status !== 200) throw new Error(`status ${res.status}: ${await res.text()}`);
    const json = await res.json();
    if (json.data.group.name !== "Ops Baru" || json.data.group.description !== "sesudah") {
      throw new Error(`payload salah: ${JSON.stringify(json.data)}`);
    }
    if (json.data.group.permissions.length !== 1 || json.data.group.permissions[0]!.key !== "card.read") {
      throw new Error("permissions tidak boleh berubah bila field tidak dikirim");
    }
  });

  it("[BR-040][C.12] REPLACE permission set berlaku langsung; riwayat assignment member utuh", async () => {
    const before = await ctx.globalClient.execute({
      sql: "SELECT COUNT(*) AS n FROM membership_group_assignments WHERE group_id = ? AND revoked_at IS NULL",
      args: [groupId],
    });
    const res = await patchGroup(ctx.projectIdA, groupId, {
      permissions: [
        { permissionId: await permissionIdByKey(ctx.globalClient, "project.read") },
        { permissionId: await permissionIdByKey(ctx.globalClient, "board.read"), cardReadVisibility: null },
        { permissionId: await permissionIdByKey(ctx.globalClient, "card.read"), cardReadVisibility: "ALL" },
      ],
    }, "user-a");
    if (res.status !== 200) throw new Error(`status ${res.status}: ${await res.text()}`);
    const keys = (await res.json()).data.group.permissions.map((p: { key: string }) => p.key).sort();
    if (JSON.stringify(keys) !== JSON.stringify(["board.read", "card.read", "project.read"])) {
      throw new Error(`set baru salah: ${JSON.stringify(keys)}`);
    }
    const after = await ctx.globalClient.execute({
      sql: "SELECT COUNT(*) AS n FROM membership_group_assignments WHERE group_id = ? AND revoked_at IS NULL",
      args: [groupId],
    });
    if (Number(before.rows[0]!.n) !== 1 || Number(after.rows[0]!.n) !== 1) {
      throw new Error(`assignment history berubah: ${Number(before.rows[0]!.n)} -> ${Number(after.rows[0]!.n)}`);
    }
  });

  it("[Rule-3] negatif: non-Owner ditolak 403 walau body invalid (authorization first)", async () => {
    const res = await patchGroup(ctx.projectIdA, groupId, { name: "" }, "user-b");
    if (res.status !== 403) throw new Error(`harusnya 403, dapat ${res.status}: ${await res.text()}`);
    const json = await res.json();
    if (json.error.code !== "PERMISSION_DENIED") throw new Error(`kode salah: ${JSON.stringify(json)}`);
  });

  it("[INV-04] negatif: PATCH group milik Project lain lewat path Project ini → RESOURCE_NOT_FOUND", async () => {
    const res = await patchGroup(ctx.projectIdA, groupIdB, { name: "Bajak" }, "user-a");
    if (res.status !== 404) throw new Error(`harusnya 404, dapat ${res.status}: ${await res.text()}`);
    const check = await ctx.deps.listPermissionGroups(projectIdB, "user-b", { includeDeleted: false });
    if (check.find((g) => g.id === groupIdB)?.name !== "Group Project B") {
      throw new Error("group Project B ikut berubah — boundary bocor");
    }
  });

  it("[INV-04] negatif: group soft-deleted diperlakukan tidak ada (404)", async () => {
    await ctx.globalClient.execute({
      sql: "UPDATE permission_groups SET deleted_at = ? WHERE id = ?",
      args: [new Date().toISOString(), groupId],
    });
    const res = await patchGroup(ctx.projectIdA, groupId, { name: "Hidup Lagi" }, "user-a");
    if (res.status !== 404) throw new Error(`harusnya 404, dapat ${res.status}`);
  });

  it("[C.12] negatif: permission tak dikenal / duplikat / field asing / tanpa field → VALIDATION_ERROR 400", async () => {
    const fresh = await ctx.deps.createPermissionGroup(ctx.projectIdA, { name: "Validasi", permissions: [] });
    for (const body of [
      { permissions: [{ permissionId: "perm-tidak-ada" }] },
      { permissions: [
        { permissionId: await permissionIdByKey(ctx.globalClient, "list.read") },
        { permissionId: await permissionIdByKey(ctx.globalClient, "list.read") },
      ] },
      { unknown_field: 1 },
      {},
    ]) {
      const res = await patchGroup(ctx.projectIdA, fresh.id, body, "user-a");
      if (res.status !== 400) throw new Error(`body ${JSON.stringify(body)} harusnya 400, dapat ${res.status}`);
      const json = await res.json();
      if (json.error.code !== "VALIDATION_ERROR") throw new Error(`kode salah untuk ${JSON.stringify(body)}: ${JSON.stringify(json)}`);
    }
  });
});
