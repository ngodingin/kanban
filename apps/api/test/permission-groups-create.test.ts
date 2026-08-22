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

// Goal 1.7.2 — POST /api/v1/projects/:project_id/permission-groups (C.12):
// create custom Group + assign permission set (referensi permissions.id katalog),
// Owner-only interim, visibility hanya untuk card.read dengan default
// CREATED_BY_ME (BR-048), Project-scoped (BR-039).

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
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-pgroup-create-"));
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

describe("POST /api/v1/projects/:project_id/permission-groups (goal 1.7.2)", () => {
  it("[C.12][FR-010][FR-011] Owner membuat custom group + permission set; card.read tanpa visibility → CREATED_BY_ME", async () => {
    const cardRead = await permissionIdByKey(ctx.globalClient, "card.read");
    const projectRead = await permissionIdByKey(ctx.globalClient, "project.read");
    const res = await makeApp().request(`http://localhost/api/v1/projects/${ctx.projectIdA}/permission-groups`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": "user-a" },
      body: JSON.stringify({
        name: "Release Ops",
        description: "grup rilis",
        permissions: [
          { permission_id: cardRead },
          { permission_id: projectRead, card_read_visibility: null },
        ],
      }),
    });
    if (res.status !== 201) throw new Error(`status ${res.status}: ${await res.text()}`);
    const json = await res.json();
    if (json.data.group.name !== "Release Ops") throw new Error(`payload salah: ${JSON.stringify(json.data)}`);
    const groups = await ctx.deps.listPermissionGroups(ctx.projectIdA, "user-a", { includeDeleted: false });
    const created = groups.find((g) => g.id === json.data.group.id)!;
    if (!created) throw new Error("group tidak persisten");
    const byKey = Object.fromEntries(created.permissions.map((p) => [p.key, p.cardReadVisibility]));
    if (byKey["card.read"] !== "CREATED_BY_ME") throw new Error(`default visibility salah: ${JSON.stringify(byKey)}`);
    if ("project.read" in byKey && byKey["project.read"] !== null) {
      throw new Error(`visibility harusnya NULL utk non-card.read: ${JSON.stringify(byKey)}`);
    }
    if (created.permissions.length !== 2) throw new Error(`jumlah permission salah: ${JSON.stringify(created.permissions)}`);
  });

  it("[BR-048][B.2] card_read_visibility eksplisit pada card.read disimpan apa adanya", async () => {
    const cardRead = await permissionIdByKey(ctx.globalClient, "card.read");
    const res = await makeApp().request(`http://localhost/api/v1/projects/${ctx.projectIdA}/permission-groups`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": "user-a" },
      body: JSON.stringify({
        name: "Wide Read",
        permissions: [{ permission_id: cardRead, card_read_visibility: "ASSIGNED_TO_ME" }],
      }),
    });
    if (res.status !== 201) throw new Error(`status ${res.status}: ${await res.text()}`);
    const groups = await ctx.deps.listPermissionGroups(ctx.projectIdA, "user-a", { includeDeleted: false });
    const created = groups.find((g) => g.name === "Wide Read")!;
    if (created.permissions[0]!.cardReadVisibility !== "ASSIGNED_TO_ME") {
      throw new Error(`visibility salah: ${JSON.stringify(created.permissions)}`);
    }
  });

  it("[B.2] negatif: card_read_visibility utk permission selain card.read ditolak INVALID_STATE", async () => {
    const projectRead = await permissionIdByKey(ctx.globalClient, "project.read");
    const res = await makeApp().request(`http://localhost/api/v1/projects/${ctx.projectIdA}/permission-groups`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": "user-a" },
      body: JSON.stringify({
        name: "Salah Visibility",
        permissions: [{ permission_id: projectRead, card_read_visibility: "ALL" }],
      }),
    });
    if (res.status !== 409) throw new Error(`harusnya 409, dapat ${res.status}: ${await res.text()}`);
    const json = await res.json();
    if (json.error.code !== "INVALID_STATE") throw new Error(`kode salah: ${JSON.stringify(json)}`);
  });

  it("[Rule-3][D.2] negatif: non-Owner aktif ditolak 403 walau body invalid (authorization first)", async () => {
    const res = await makeApp().request(`http://localhost/api/v1/projects/${ctx.projectIdA}/permission-groups`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": "user-b" },
      body: JSON.stringify({ name: "" }),
    });
    if (res.status !== 403) throw new Error(`harusnya 403, dapat ${res.status}: ${await res.text()}`);
    const json = await res.json();
    if (json.error.code !== "PERMISSION_DENIED") throw new Error(`kode salah: ${JSON.stringify(json)}`);
  });

  it("[C.12] negatif: permission_id tidak dikenal ditolak; nama kosong ditolak", async () => {
    const res = await makeApp().request(`http://localhost/api/v1/projects/${ctx.projectIdA}/permission-groups`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": "user-a" },
      body: JSON.stringify({ name: "X", permissions: [{ permission_id: "perm-tidak-ada" }] }),
    });
    if (res.status !== 409) throw new Error(`harusnya 409, dapat ${res.status}`);
    const resName = await makeApp().request(`http://localhost/api/v1/projects/${ctx.projectIdA}/permission-groups`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": "user-a" },
      body: JSON.stringify({ name: "   " }),
    });
    if (resName.status !== 409) throw new Error(`nama kosong harusnya 409, dapat ${resName.status}`);
  });

  it("[INV-04][BR-039] boundary: group baru hanya muncul di Project pembuatnya", async () => {
    const groupsA = await ctx.deps.listPermissionGroups(ctx.projectIdA, "user-a", { includeDeleted: false });
    if (!groupsA.some((g) => g.name === "Release Ops")) throw new Error("group hilang dari Project A");
    const groupsB = await ctx.deps.listPermissionGroups(projectIdB, "user-b", { includeDeleted: false });
    if (groupsB.some((g) => g.name === "Release Ops")) throw new Error("group Project A bocor ke Project B");
  });
});
