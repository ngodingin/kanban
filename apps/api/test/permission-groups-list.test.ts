import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import {
  applyGlobalMigrations,
  newProjectId,
  registerProjectWithOwnerMembership,
} from "@kanban/infrastructure";
import { buildProjectAdminDeps } from "../src/project-deps.ts";
import type { ProjectAdminRoutesDeps } from "../src/routes/project-admin.ts";

// Goal 1.7.1 — GET /api/v1/projects/:project_id/permission-groups (02-SPEC C.12):
// list Group Project-scoped, exclude soft-deleted kecuali diminta eksplisit,
// tidak bocor lintas Project, authorization interim (member aktif boleh read).

interface TestCtx {
  globalClient: Client;
  deps: ProjectAdminRoutesDeps;
  dir: string;
  projectIdA: string;
}

let ctx: TestCtx;

const projectIdB = `pg-b-${newProjectId()}`;

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-pgroups-"));
  const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  const now = new Date().toISOString();
  const insertUser = async (userId: string) => {
    await globalClient.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
      args: [userId, `${userId}@test.local`, userId, now, now],
    });
  };
  await insertUser("user-a");
  await insertUser("user-b");
  await insertUser("user-c");

  const projectIdA = `pg-a-${newProjectId()}`;
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: projectIdA,
    databaseId: `file:${join(dir, "unused-a.db")}`,
    ownerUserId: "user-a",
    now,
  });
  // user-b member aktif non-Owner di Project A.
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

  // Custom group + satu permission (card.read) di Project A.
  const cardRead = await globalClient.execute({
    sql: "SELECT id FROM permissions WHERE key = 'card.read'",
    args: [],
  });
  const groupIdCustom = `grp-custom-${newProjectId()}`;
  await globalClient.execute({
    sql: "INSERT INTO permission_groups (id, project_id, name, description, created_at, updated_at) VALUES (?, ?, 'Custom Ops', 'grup uji', ?, ?)",
    args: [groupIdCustom, projectIdA, now, now],
  });
  await globalClient.execute({
    sql: "INSERT INTO group_permissions (group_id, permission_id, card_read_visibility, created_at) VALUES (?, ?, 'ALL', ?)",
    args: [groupIdCustom, String(cardRead.rows[0]!.id), now],
  });
  // Satu grup soft-deleted di Project A.
  await globalClient.execute({
    sql: "UPDATE permission_groups SET deleted_at = ? WHERE project_id = ? AND name = 'Viewer'",
    args: [now, projectIdA],
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

describe("GET /api/v1/projects/:project_id/permission-groups (goal 1.7.1)", () => {
  it("[C.12][FR-009][BR-039] Owner melihat baseline + custom group beserta permission-nya", async () => {
    const groups = await ctx.deps.listPermissionGroups(ctx.projectIdA, "user-a", { includeDeleted: false });
    const names = groups.map((g) => g.name).sort();
    if (!names.includes("Co-Owner") || !names.includes("Manager") || !names.includes("Contributor")) {
      throw new Error(`baseline groups hilang: ${JSON.stringify(names)}`);
    }
    if (!names.includes("Custom Ops")) throw new Error(`custom group hilang: ${JSON.stringify(names)}`);
    if (groups.length !== 4) throw new Error(`jumlah salah (Viewer harusnya tersembunyi): ${JSON.stringify(names)}`);
    const custom = groups.find((g) => g.name === "Custom Ops")!;
    if (custom.permissions.length !== 1 || custom.permissions[0]!.key !== "card.read" || custom.permissions[0]!.cardReadVisibility !== "ALL") {
      throw new Error(`permission custom group salah: ${JSON.stringify(custom.permissions)}`);
    }
    for (const g of groups) {
      if (g.deletedAt !== null) throw new Error(`soft-deleted bocor di default list: ${g.name}`);
      if (typeof g.id !== "string" || !Array.isArray(g.permissions)) throw new Error(`bentuk group salah: ${JSON.stringify(g)}`);
    }
  });

  it("[C.12] include_deleted=true menampilkan kembali grup yang soft-deleted", async () => {
    const all = await ctx.deps.listPermissionGroups(ctx.projectIdA, "user-a", { includeDeleted: true });
    if (all.length !== 5) throw new Error(`jumlah salah: ${JSON.stringify(all.map((g) => g.name))}`);
    const viewer = all.find((g) => g.name === "Viewer")!;
    if (viewer.deletedAt === null) throw new Error("Viewer harusnya bertanda deleted_at");
  });

  it("[INV-04] boundary: list Project lain hanya berisi grup milik Project itu", async () => {
    const groupsA = await ctx.deps.listPermissionGroups(ctx.projectIdA, "user-a", { includeDeleted: false });
    const groupsB = await ctx.deps.listPermissionGroups(projectIdB, "user-b", { includeDeleted: false });
    if (groupsB.length !== 4) throw new Error(`Project B harusnya punya 4 baseline: ${JSON.stringify(groupsB.map((g) => g.name))}`);
    const idsA = new Set(groupsA.map((g) => g.id));
    for (const g of groupsB) {
      if (idsA.has(g.id)) throw new Error(`group Project A bocor ke list Project B: ${g.name}`);
    }
  });

  it("[Rule-3][C.12] negatif: bukan member → 403; project tak dikenal → 404; tanpa identitas → 401", async () => {
    let err: unknown = null;
    try {
      await ctx.deps.listPermissionGroups(ctx.projectIdA, "user-c", { includeDeleted: false });
    } catch (e) {
      err = e;
    }
    if (err === null || !(err instanceof Error) || !("httpStatus" in err) || (err as { httpStatus?: number }).httpStatus !== 403) {
      throw new Error(`non-member harusnya 403: ${String(err)}`);
    }
    err = null;
    try {
      await ctx.deps.listPermissionGroups("pg-tidak-ada", "user-a", { includeDeleted: false });
    } catch (e) {
      err = e;
    }
    if (err === null || (err as { code?: string }).code !== "RESOURCE_NOT_FOUND") {
      throw new Error(`project tak dikenal harusnya RESOURCE_NOT_FOUND: ${String(err)}`);
    }
    const resolved = await ctx.deps.resolveIdentity(new Request("http://localhost/x"));
    if (resolved !== null) throw new Error("tanpa header identitas harusnya null");
  });
});
