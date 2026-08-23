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
import { createProjectAdminRouter } from "../src/routes/project-admin.ts";

// Goal 1.9.1 — POST /api/v1/projects/:project_id/invitations (C.13)
// BR-050 Group by reference · BR-051 ≥1 assignment · BR-052A default expiry
// 3 hari · Owner-only interim · insert atomik invitation + group refs.

interface TestCtx {
  globalClient: Client;
  deps: ReturnType<typeof buildProjectAdminDeps>;
  dir: string;
  projectIdA: string;
}

let ctx: TestCtx;
const projectIdB = `pg-b-${newProjectId()}`;

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-invite-"));
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
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: projectIdA,
    databaseId: `file:${join(dir, "unused-a.db")}`,
    ownerUserId: "user-a",
    now,
  });
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
});

afterAll(async () => {
  await ctx.globalClient.close();
  await rm(ctx.dir, { recursive: true, force: true });
});

async function makeRouter() {
  return new Hono().route("/", createProjectAdminRouter(() => ctx.deps));
}

async function invite(body: unknown, user: string) {
  return (await makeRouter()).request(`http://localhost/v1/projects/${ctx.projectIdA}/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": user },
    body: JSON.stringify(body),
  });
}

describe("POST /invitations (goal 1.9.1)", () => {
  let groupId = "";
  let groupIdDeleted = "";
  let groupIdB = "";

  beforeAll(async () => {
    groupId = (await ctx.deps.createPermissionGroup(ctx.projectIdA, { name: "Inv-G1", permissions: [] })).id;
    groupIdB = (await ctx.deps.createPermissionGroup(projectIdB, { name: "Inv-G2", permissions: [] })).id;
    groupIdDeleted = (await ctx.deps.createPermissionGroup(ctx.projectIdA, { name: "Inv-G3", permissions: [] })).id;
    await ctx.globalClient.execute({
      sql: "UPDATE permission_groups SET deleted_at = ? WHERE id = ?",
      args: [new Date().toISOString(), groupIdDeleted],
    });
  });

  it("[BR-050][BR-052A][C.13] Positif: 2 assignment valid → 201 PENDING, default expiry ±3 hari, reference tersimpan", async () => {
    const g2 = (await ctx.deps.createPermissionGroup(ctx.projectIdA, { name: "Inv-G4", permissions: [] })).id;
    const res = await invite({ email: "eko@example.com", assignments: [{ group_id: groupId }, { group_id: g2 }] }, "user-a");
    if (res.status !== 201) throw new Error(`status ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const inv = json.data.invitation;
    if (inv.status !== "PENDING" || inv.groupAssignments.length !== 2) {
      throw new Error(`payload salah: ${JSON.stringify(inv)}`);
    }
    const deltaDays = (Date.parse(inv.expiresAt) - Date.parse(inv.createdAt)) / (24 * 60 * 60 * 1000);
    if (Math.abs(deltaDays - 3) > 0.01) throw new Error(`default expiry bukan 3 hari (BR-052A): ${deltaDays}`);
    const rows = await ctx.globalClient.execute({
      sql: "SELECT COUNT(*) AS n FROM invitation_group_assignments WHERE invitation_id = ?",
      args: [inv.id],
    });
    if (Number(rows.rows[0]!.n) !== 2) throw new Error("group references tidak tersimpan lengkap");
  });

  it("[BR-051] negatif: tanpa assignments / array kosong → VALIDATION_ERROR 400", async () => {
    for (const body of [{ email: "a@b.co" }, { email: "a@b.co", assignments: [] }]) {
      const res = await invite(body, "user-a");
      if (res.status !== 400 || (await res.json()).error.code !== "VALIDATION_ERROR") {
        throw new Error(`body ${JSON.stringify(body)} harusnya 400 VALIDATION_ERROR, dapat ${res.status}: ${await res.text()}`);
      }
    }
  });

  it("[BR-042B][INV-04] negatif: group lintas-Project / soft-deleted / tak dikenal → RESOURCE_NOT_FOUND", async () => {
    for (const gid of [groupIdB, groupIdDeleted, "grp-tak-ada"]) {
      const res = await invite({ email: "x@y.co", assignments: [{ group_id: gid }] }, "user-a");
      if (res.status !== 404 || (await res.json()).error.code !== "RESOURCE_NOT_FOUND") {
        throw new Error(`group ${gid} harusnya 404, dapat ${res.status}: ${await res.text()}`);
      }
    }
    // Atomicity: tidak boleh ada invitation tersisa dari percobaan gagal.
    const leftovers = await ctx.globalClient.execute({
      sql: "SELECT COUNT(*) AS n FROM invitations WHERE project_id = ?",
      args: [ctx.projectIdA],
    });
    // 1 invitation sukses dari test pertama; percobaan gagal tidak menambah.
    if (Number(leftovers.rows[0]!.n) !== 1) {
      throw new Error(`ada invitation sisa dari transaksi gagal: ${Number(leftovers.rows[0]!.n)}`);
    }
  });

  it("[C.13] negatif: email invalid / expires_at bukan ISO → VALIDATION_ERROR 400; expires_at lampau / scope salah → INVALID_STATE 409", async () => {
    for (const body of [
      { email: "bukan-email", assignments: [{ group_id: groupId }] },
      { email: "", assignments: [{ group_id: groupId }] },
      { email: "z@z.co", assignments: [{ group_id: groupId }], expires_at: "bukan-tanggal" },
    ]) {
      const res = await invite(body, "user-a");
      if (res.status !== 400 || (await res.json()).error.code !== "VALIDATION_ERROR") {
        throw new Error(`body ${JSON.stringify(body)} harusnya 400 VALIDATION_ERROR, dapat ${res.status}: ${await res.text()}`);
      }
    }
    for (const body of [
      { email: "z@z.co", assignments: [{ group_id: groupId }], expires_at: "2020-01-01T00:00:00.000Z" },
      { email: "z@z.co", assignments: [{ group_id: groupId, scope_type: "milestone", scope_id: "m1" }] },
      { email: "z@z.co", assignments: [{ group_id: groupId, scope_type: "project", scope_id: "proj-lain" }] },
    ]) {
      const res = await invite(body, "user-a");
      if (res.status !== 409 || (await res.json()).error.code !== "INVALID_STATE") {
        throw new Error(`body ${JSON.stringify(body)} harusnya 409 INVALID_STATE, dapat ${res.status}: ${await res.text()}`);
      }
    }
  });

  it("[Rule-3] negatif: non-Owner membuat invitation → PERMISSION_DENIED 403", async () => {
    const res = await invite({ email: "r@r.co", assignments: [{ group_id: groupId }] }, "user-b");
    if (res.status !== 403 || (await res.json()).error.code !== "PERMISSION_DENIED") {
      throw new Error(`harusnya 403, dapat ${res.status}: ${await res.text()}`);
    }
  });
});
