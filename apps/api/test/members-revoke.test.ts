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
  applyProjectMigrations,
} from "@kanban/infrastructure";
import { buildProjectAdminDeps } from "../src/project-deps.ts";
import { createProjectAdminRouter } from "../src/routes/project-admin.ts";

// Goal 1.10.2 — POST /api/v1/projects/:project_id/members/:membership_id/revoke
// (C.12 amandemen 2.1.0): set revoked_at saja; riwayat assignment utuh
// (BR-053); Owner Membership tidak dapat di-revoke (FR-002); Owner-only interim.

interface TestCtx {
  globalClient: Client;
  deps: ReturnType<typeof buildProjectAdminDeps>;
  dir: string;
  projectIdA: string;
}

let ctx: TestCtx;
let ownerMembershipId = "";
const projectIdB = `pg-b-${newProjectId()}`;

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-member-revoke-"));
  const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  const now = new Date().toISOString();
  for (const user of ["user-a", "user-b", "user-c"]) {
    await globalClient.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
      args: [user, `${user}@test.local`, user, now, now],
    });
  }

  const projectIdA = `pg-a-${newProjectId()}`;
  // TASK-2.12: revoke kini menjalankan cleanup assignee di Project DB —
  // fixture wajib menyediakan Project DB sungguhan dengan schema lengkap.
  for (const dbFile of ["unused-a.db", "unused-b.db"]) {
    const c = createClient({ url: `file:${join(dir, dbFile)}` });
    await applyProjectMigrations(c);
    await c.close();
  }
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: projectIdA,
    databaseId: `file:${join(dir, "unused-a.db")}`,
    ownerUserId: "user-a",
    now,
  });
  const ownerRow = await globalClient.execute({
    sql: "SELECT id FROM project_memberships WHERE project_id = ? AND user_id = 'user-a'",
    args: [projectIdA],
  });
  ownerMembershipId = String(ownerRow.rows[0]!.id);
  for (const userId of ["user-b"]) {
    await globalClient.execute({
      sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES (?, ?, ?, ?, NULL)",
      args: [`m-${userId}-${projectIdA}`, projectIdA, userId, now],
    });
  }
  // Group + assignment aktif pada membership user-b — bukti BR-053.
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: projectIdB,
    databaseId: `file:${join(dir, "unused-b.db")}`,
    ownerUserId: "user-c",
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

  const groupId = (await ctx.deps.createPermissionGroup(ctx.projectIdA, { name: "G-revoke", permissions: [] })).id;
  await ctx.globalClient.execute({
    sql: "INSERT INTO membership_group_assignments (id, membership_id, group_id, scope_type, scope_id, created_at, revoked_at) VALUES (?, 'm-user-b-" + projectIdA + "', ?, 'project', ?, ?, NULL)",
    args: [`asg-${groupId}`, groupId, ctx.projectIdA, now],
  });
});

afterAll(async () => {
  await ctx.globalClient.close();
  await rm(ctx.dir, { recursive: true, force: true });
});

async function makeRouter() {
  return new Hono().route("/", createProjectAdminRouter(() => ctx.deps));
}

function revoke(projectId: string, membershipId: string, user: string) {
  return makeRouter().then((router) =>
    router.request(`http://localhost/v1/projects/${projectId}/members/${membershipId}/revoke`, {
      method: "POST",
      headers: { "x-test-user": user },
    }),
  );
}

describe("POST /members/:membership_id/revoke (goal 1.10.2)", () => {
  it("[BR-053][C.12] Positif: revoke set revoked_at; row & assignment riwayat tetap utuh", async () => {
    const res = await revoke(ctx.projectIdA, `m-user-b-${ctx.projectIdA}`, "user-a");
    if (res.status !== 200) throw new Error(`status ${res.status}: ${await res.text()}`);
    if ((await res.json()).data.membership.revokedAt === null) throw new Error("revokedAt tidak ter-set");
    const membership = await ctx.globalClient.execute({
      sql: "SELECT revoked_at FROM project_memberships WHERE id = ?",
      args: [`m-user-b-${ctx.projectIdA}`],
    });
    if (membership.rows[0]!.revoked_at === null) throw new Error("DB revoked_at tidak ter-set");
    const assignments = await ctx.globalClient.execute({
      sql: "SELECT COUNT(*) AS n FROM membership_group_assignments WHERE membership_id = ? AND revoked_at IS NULL",
      args: [`m-user-b-${ctx.projectIdA}`],
    });
    if (Number(assignments.rows[0]!.n) !== 1) {
      throw new Error("assignment ikut dicabut — melanggar BR-053 (non-applicable via induk, bukan dihapus)");
    }
  });

  it("[C.12] Revoke ulang → idempotent, timestamp pertama dipertahankan", async () => {
    const first = await revoke(ctx.projectIdA, `m-user-b-${ctx.projectIdA}`, "user-a");
    if (first.status !== 200) throw new Error(`revoke pertama gagal: ${first.status}`);
    const again = await revoke(ctx.projectIdA, `m-user-b-${ctx.projectIdA}`, "user-a");
    if (again.status !== 200) throw new Error(`revoke kedua harusnya idempotent 200, dapat ${again.status}`);
    const firstAt = (await first.json()).data.membership.revokedAt;
    if ((await again.json()).data.membership.revokedAt !== firstAt) throw new Error("timestamp berubah saat re-revoke");
  });

  it("[FR-002] negatif: Owner Membership ditolak INVALID_STATE dan Owner tetap aktif", async () => {
    const res = await revoke(ctx.projectIdA, ownerMembershipId, "user-a");
    if (res.status !== 409 || (await res.json()).error.code !== "INVALID_STATE") {
      throw new Error(`harusnya 409 INVALID_STATE, dapat ${res.status}: ${await res.text()}`);
    }
    const owners = await ctx.globalClient.execute({
      sql: "SELECT COUNT(*) AS n FROM project_memberships WHERE project_id = ? AND revoked_at IS NULL",
      args: [ctx.projectIdA],
    });
    if (Number(owners.rows[0]!.n) < 1) throw new Error("Project kehilangan seluruh membership aktif");
  });

  it("[INV-04][Rule-3] negatif: membership lintas-Project → 404; non-Owner caller → 403", async () => {
    const ownerBRow = await ctx.globalClient.execute({
      sql: "SELECT id FROM project_memberships WHERE project_id = ?",
      args: [projectIdB],
    });
    const cross = await revoke(ctx.projectIdA, String(ownerBRow.rows[0]!.id), "user-a");
    if (cross.status !== 404 || (await cross.json()).error.code !== "RESOURCE_NOT_FOUND") {
      throw new Error(`lintas Project harusnya 404, dapat ${cross.status}`);
    }
    const forbidden = await revoke(ctx.projectIdA, ownerMembershipId, "user-b");
    if (forbidden.status !== 403 || (await forbidden.json()).error.code !== "PERMISSION_DENIED") {
      throw new Error(`non-Owner harusnya 403, dapat ${forbidden.status}: ${await forbidden.text()}`);
    }
  });
});
