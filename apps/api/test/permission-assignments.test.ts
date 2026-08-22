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

// Goal 1.8.2 — POST /members/:membership_id/permission-assignments (+ /revoke)
// (C.12): direct permission; visibility hanya card.read (B.2), default
// CREATED_BY_ME (BR-048); Phase 1 scope project (BR-042B); duplikat aktif
// UNIQUE; revoke mempertahankan riwayat; Owner-only interim.

interface TestCtx {
  globalClient: Client;
  deps: ReturnType<typeof buildProjectAdminDeps>;
  dir: string;
  projectIdA: string;
}

let ctx: TestCtx;
let membershipIdB = "";
const projectIdB = `pg-b-${newProjectId()}`;

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-passign-"));
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
  membershipIdB = `m-b-${projectIdA}`;
  await globalClient.execute({
    sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES (?, ?, 'user-b', ?, NULL)",
    args: [membershipIdB, projectIdA, now],
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

async function assignPerm(projectId: string, membershipId: string, body: unknown, user: string) {
  return (await makeRouter()).request(`http://localhost/api/v1/projects/${projectId}/members/${membershipId}/permission-assignments`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": user },
    body: JSON.stringify(body),
  });
}

async function revokePerm(projectId: string, membershipId: string, assignmentId: string, user: string) {
  return (await makeRouter()).request(`http://localhost/api/v1/projects/${projectId}/members/${membershipId}/permission-assignments/${assignmentId}/revoke`, {
    method: "POST",
    headers: { "x-test-user": user },
  });
}

async function permissionIdByKey(key: string): Promise<string> {
  const rows = await ctx.globalClient.execute({ sql: "SELECT id FROM permissions WHERE key = ?", args: [key] });
  return String(rows.rows[0]!.id);
}

describe("permission-assignments endpoints (goal 1.8.2)", () => {
  it("[BR-048][C.12] Positif: card.read tanpa visibility → default CREATED_BY_ME", async () => {
    const permId = await permissionIdByKey("card.read");
    const res = await assignPerm(ctx.projectIdA, membershipIdB, { permission_id: permId, scope_type: "project", scope_id: ctx.projectIdA }, "user-a");
    if (res.status !== 201) throw new Error(`status ${res.status}: ${await res.text()}`);
    const json = await res.json();
    if (json.data.assignment.cardReadVisibility !== "CREATED_BY_ME") {
      throw new Error(`default visibility salah: ${JSON.stringify(json.data.assignment)}`);
    }
  });

  it("[B.2][C.12] Positif: card.read + visibility eksplisit ALL tersimpan", async () => {
    const permId = await permissionIdByKey("card.read");
    // revoke assignment default dulu agar tak kena duplikat aktif
    const existing = await ctx.globalClient.execute({
      sql: "SELECT id FROM membership_permission_assignments WHERE membership_id = ? AND permission_id = ? AND revoked_at IS NULL",
      args: [membershipIdB, permId],
    });
    if (existing.rows.length > 0) {
      await ctx.globalClient.execute({
        sql: "UPDATE membership_permission_assignments SET revoked_at = ? WHERE id = ?",
        args: [new Date().toISOString(), String(existing.rows[0]!.id)],
      });
    }
    const res = await assignPerm(ctx.projectIdA, membershipIdB, { permission_id: permId, scope_type: "project", scope_id: ctx.projectIdA, card_read_visibility: "ALL" }, "user-a");
    if (res.status !== 201) throw new Error(`status ${res.status}: ${await res.text()}`);
    if ((await res.json()).data.assignment.cardReadVisibility !== "ALL") throw new Error("visibility ALL tidak tersimpan");
  });

  it("[B.2] negatif: visibility pada non-card.read → INVALID_STATE 409", async () => {
    for (const key of ["board.read", "list.read"]) {
      const permId = await permissionIdByKey(key);
      const res = await assignPerm(ctx.projectIdA, membershipIdB, { permission_id: permId, scope_type: "project", scope_id: ctx.projectIdA, card_read_visibility: "ALL" }, "user-a");
      if (res.status !== 409) throw new Error(`${key} harusnya 409, dapat ${res.status}`);
      if ((await res.json()).error.code !== "INVALID_STATE") throw new Error(`kode salah untuk ${key}`);
    }
  });

  it("[UNIQUE] negatif: duplikat aktif → INVALID_STATE 409", async () => {
    const permId = await permissionIdByKey("board.read");
    const first = await assignPerm(ctx.projectIdA, membershipIdB, { permission_id: permId, scope_type: "project", scope_id: ctx.projectIdA }, "user-a");
    if (first.status !== 201) throw new Error(`setup pertama gagal: ${first.status}`);
    const dup = await assignPerm(ctx.projectIdA, membershipIdB, { permission_id: permId, scope_type: "project", scope_id: ctx.projectIdA }, "user-a");
    if (dup.status !== 409 || (await dup.json()).error.code !== "INVALID_STATE") {
      throw new Error(`duplikat harusnya 409 INVALID_STATE, dapat ${dup.status}: ${await dup.text()}`);
    }
  });

  it("[BR-042B][INV-04] negatif: scope salah / permission tak ada / membership lintas-Project ditolak", async () => {
    const permId = await permissionIdByKey("list.read");
    for (const body of [
      { permission_id: permId, scope_type: "card", scope_id: ctx.projectIdA },
      { permission_id: permId, scope_type: "project", scope_id: "proj-lain" },
      { permission_id: "perm-tak-ada", scope_type: "project", scope_id: ctx.projectIdA },
    ]) {
      const res = await assignPerm(ctx.projectIdA, membershipIdB, body, "user-a");
      const expected = body.permission_id === "perm-tak-ada" ? 404 : 409;
      if (res.status !== expected) throw new Error(`body ${JSON.stringify(body)} harusnya ${expected}, dapat ${res.status}`);
    }
    const cross = await assignPerm(ctx.projectIdA, `m-owner-${projectIdB}`, { permission_id: permId, scope_type: "project", scope_id: ctx.projectIdA }, "user-a");
    if (cross.status !== 404 || (await cross.json()).error.code !== "RESOURCE_NOT_FOUND") {
      throw new Error(`membership lintas Project harusnya 404, dapat ${cross.status}`);
    }
  });

  it("[C.12] revoke: revoked_at ter-set, row tetap; re-revoke idempotent; re-assign bebas", async () => {
    const permId = await permissionIdByKey("milestone.read");
    const created = await assignPerm(ctx.projectIdA, membershipIdB, { permission_id: permId, scope_type: "project", scope_id: ctx.projectIdA }, "user-a");
    const assignmentId = (await created.json()).data.assignment.id;

    const first = await revokePerm(ctx.projectIdA, membershipIdB, assignmentId, "user-a");
    if (first.status !== 200) throw new Error(`revoke status ${first.status}: ${await first.text()}`);
    const revokedAt = (await first.json()).data.assignment.revokedAt;
    if (revokedAt === null) throw new Error("revoked_at tidak ter-set");

    const second = await revokePerm(ctx.projectIdA, membershipIdB, assignmentId, "user-a");
    if (second.status !== 200 || (await second.json()).data.assignment.revokedAt !== revokedAt) {
      throw new Error("re-revoke tidak idempotent");
    }
    const reassign = await assignPerm(ctx.projectIdA, membershipIdB, { permission_id: permId, scope_type: "project", scope_id: ctx.projectIdA }, "user-a");
    if (reassign.status !== 201) throw new Error(`re-assign setelah revoke gagal: ${await reassign.text()}`);
  });

  it("[Rule-3] negatif: non-Owner assign/revoke → PERMISSION_DENIED 403", async () => {
    const permId = await permissionIdByKey("card.move");
    const res = await assignPerm(ctx.projectIdA, membershipIdB, { permission_id: permId, scope_type: "project", scope_id: ctx.projectIdA }, "user-b");
    if (res.status !== 403 || (await res.json()).error.code !== "PERMISSION_DENIED") {
      throw new Error(`harusnya 403, dapat ${res.status}: ${await res.text()}`);
    }
  });
});
