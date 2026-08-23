import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import {
  applyGlobalMigrations,
  newProjectId,
  registerProjectWithOwnerMembership,
} from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";
import {
  createProjectAdminRouter,
  type ProjectAdminRoutesDeps,
} from "../src/routes/project-admin.ts";

const NOW = "2026-08-01T00:00:00.000Z";
let globalClient: Client;
let deps: ProjectAdminRoutesDeps;
let projectIdValue: string;
let otherProjectIdValue: string;

const identityFor = (userId: string | null): Promise<ResolvedIdentity | null> =>
  userId === null
    ? Promise.resolve(null)
    : Promise.resolve({
        type: "session",
        userId,
        email: `${userId}@test.local`,
        name: userId,
        emailVerified: true,
        image: null,
      });

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "kanban-assignments-get-"));
  globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  for (const user of ["user-owner", "user-reader", "user-plain"]) {
    await globalClient.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
      args: [user, `${user}@t.local`, user, NOW, NOW],
    });
  }
  projectIdValue = `a-${newProjectId()}`;
  otherProjectIdValue = `b-${newProjectId()}`;
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: projectIdValue,
    databaseId: `file:${join(dir, `${projectIdValue}.db`)}`,
    ownerUserId: "user-owner",
    now: NOW,
  });
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: otherProjectIdValue,
    databaseId: `file:${join(dir, `${otherProjectIdValue}.db`)}`,
    ownerUserId: "user-plain",
    now: NOW,
  });

  // Membership pembaca di Project A + grant member.read (scope project).
  await globalClient.execute({
    sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES ('m-reader', ?, 'user-reader', ?, NULL)",
    args: [projectIdValue, NOW],
  });
  await globalClient.execute({
    sql: "INSERT INTO permission_groups (id, project_id, name, created_at, updated_at) VALUES ('g_readers', ?, 'Readers', ?, ?)",
    args: [projectIdValue, NOW, NOW],
  });
  await globalClient.execute("INSERT OR IGNORE INTO permissions (id, key) VALUES ('p_mr', 'member.read')");
  const pid = await globalClient.execute({ sql: "SELECT id FROM permissions WHERE key = 'member.read'" });
  await globalClient.execute({
    sql: "INSERT INTO group_permissions (group_id, permission_id, created_at) VALUES ('g_readers', ?, ?)",
    args: [String(pid.rows[0]!.id), NOW],
  });
  await globalClient.execute({
    sql: "INSERT INTO membership_group_assignments (id, membership_id, group_id, scope_type, scope_id, created_at, revoked_at) VALUES ('ga_reader', 'm-reader', 'g_readers', 'project', ?, ?, NULL)",
    args: [projectIdValue, NOW],
  });

  deps = buildDeps(globalClient);
});

// Deps builder mini — mirror pola buildProjectAdminRoutesDeps tapi tanpa Turso.
function buildDeps(gc: Client): ProjectAdminRoutesDeps {
  const lazy = async () => {
    throw new Error("not used in this test");
  };
  return {
    resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
    listPermissionGroups: lazy,
    assertProjectOwner: lazy,
    requireActiveMember: lazy,
    createPermissionGroup: lazy,
    updatePermissionGroup: lazy,
    deletePermissionGroup: lazy,
    createGroupAssignment: lazy,
    revokeGroupAssignment: lazy,
    createPermissionAssignment: lazy,
    revokePermissionAssignment: lazy,
    listMembers: lazy,
    assertPermissionKey: (projectId, requesterUserId, key) =>
      import("@kanban/infrastructure").then((m) => m.assertPermissionKey(gc, projectId, requesterUserId, key)),
    listMembershipAssignments: (projectId, membershipId) =>
      import("@kanban/infrastructure").then((m) => m.listMembershipAssignments(gc, projectId, membershipId)),
    revokeMembership: lazy,
    listProjectInvitations: lazy,
  } as unknown as ProjectAdminRoutesDeps;
}

afterAll(async () => {
  await globalClient.close();
});

const app = (): Hono => new Hono().route("/", createProjectAdminRouter(() => deps));

const getAssignments = (mid: string, user: string): Promise<Response> =>
  app().request(`http://localhost/v1/projects/${projectIdValue}/members/${mid}/assignments`, {
    headers: { "x-test-user": user },
  });

describe("GET .../members/:membership_id/assignments — goal 4.6.1", () => {
  it("[C.12][2.10.0] member.read holder melihat assignment campur AKTIF+REVOKED milik Membership lain", async () => {
    // Isi target: owner membership (punya assignment dari provisioning?) + buat campuran eksplisit
    await globalClient.execute("INSERT OR IGNORE INTO permissions (id, key) VALUES ('p_board_update', 'board.update')");
    const bid = await globalClient.execute({ sql: "SELECT id FROM permissions WHERE key = 'board.update'" });
    await globalClient.execute({
      sql: "INSERT INTO membership_permission_assignments (id, membership_id, permission_id, scope_type, scope_id, card_read_visibility, created_at, revoked_at) VALUES ('da_mix_a', 'm-reader', ?, 'project', ?, NULL, ?, '2026-08-02T00:00:00.000Z')",
      args: [String(bid.rows[0]!.id), projectIdValue, NOW],
    });

    const res = await getAssignments("m-reader", "user-reader");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data.group_assignments)).toBe(true);
    expect(json.data.group_assignments).toEqual([
      expect.objectContaining({ id: "ga_reader", groupId: "g_readers", scopeType: "project", revokedAt: null }),
    ]);
    expect(json.data.permission_assignments).toHaveLength(1);
    expect(json.data.permission_assignments[0]).toMatchObject({
      id: "da_mix_a",
      scopeType: "project",
      revokedAt: "2026-08-02T00:00:00.000Z",
    });
    // DoD: tidak membawa definisi permission/Group penuh
    expect(json.data.permission_assignments[0].key).toBeUndefined();
    expect(json.data.group_assignments[0].permissions).toBeUndefined();
  });

  it("[C.12] Membership tanpa assignment → kedua array kosong", async () => {
    await globalClient.execute({
      sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES ('m-empty', ?, 'user-plain', ?, NULL)",
      args: [projectIdValue, NOW],
    }).catch(() => undefined);
    const res = await getAssignments("m-empty", "user-reader");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.group_assignments).toEqual([]);
    expect(json.data.permission_assignments).toEqual([]);
  });

  it("[boundary] membership_id milik Project lain → RESOURCE_NOT_FOUND 404", async () => {
    const res = await app().request(
      `http://localhost/v1/projects/${otherProjectIdValue}/members/m-reader/assignments`,
      { headers: { "x-test-user": "user-plain" } },
    );
    // user-plain adalah Owner Project B → member.read terpenuhi (BR-037), lalu boundary 404
    expect(res.status).toBe(404);
    expect((await res.json()).error?.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("[authz negatif] tanpa member.read → PERMISSION_DENIED; positif Owner selalu boleh", async () => {
    // user-plain bukan member aktif Project A → 403
    const denied = await getAssignments("m-reader", "user-plain");
    expect(denied.status).toBe(403);
    expect(((await denied.json()).error ?? {}).code).toBe("PERMISSION_DENIED");

    const ownerOk = await getAssignments("m-reader", "user-owner");
    expect(ownerOk.status).toBe(200);
  });
});
