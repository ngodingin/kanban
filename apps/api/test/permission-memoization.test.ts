import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import {
  applyGlobalMigrations,
  applyProjectMigrations,
  newProjectId,
  registerProjectWithOwnerMembership,
} from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";
import { buildMilestoneRoutesDeps } from "../src/project-deps.ts";
import { createMilestonesRouter } from "../src/routes/milestones.ts";

const NOW = "2026-08-01T00:00:00.000Z";

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

// Menghitung berapa kali query "assignment mentah" Membership ini benar-benar
// dijalankan terhadap Global DB dalam SATU request — sebelum Review-CL-05's
// fix, entity-scoped mutation (authorize() dgn entity) memicu 2x
// loadEffectivePermissionInputs (pipeline-level + effectiveFor's re-resolve)
// walau membershipId sama persis; sesudah fix harusnya cuma 1x per request.
function countAssignmentQueryCalls(client: Client): { count: () => number } {
  const original = client.execute.bind(client);
  let calls = 0;
  // @ts-expect-error — override runtime method utk instrumentasi test, tipe overload execute tidak perlu dicocokkan persis di sini.
  client.execute = async (...args: Parameters<typeof original>) => {
    const stmt = args[0];
    const sql = typeof stmt === "string" ? stmt : (stmt as { sql?: string }).sql;
    if (sql && sql.includes("FROM membership_group_assignments")) {
      calls += 1;
    }
    return original(...(args as [never]));
  };
  return { count: () => calls };
}

describe("Memoisasi loadEffectivePermissionInputs per-request (Review-CL-05, P2)", () => {
  let globalClient: Client;
  let projectIdValue: string;
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kanban-perm-memo-"));
    globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
    await applyGlobalMigrations(globalClient);
    for (const user of ["user-ms", "user-owner-unused"]) {
      await globalClient.execute({
        sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
        args: [user, `${user}@t.local`, user, NOW, NOW],
      });
    }
    projectIdValue = `a-${newProjectId()}`;
    const projectDbPath = `file:${join(dir, `${projectIdValue}.db`)}`;
    const projectClient = createClient({ url: projectDbPath });
    await applyProjectMigrations(projectClient);
    await projectClient.execute({
      sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, 'P', ?, ?, 1)",
      args: [projectIdValue, NOW, NOW],
    });
    await projectClient.execute({
      sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms_1', 'X', NULL, 0, ?, ?, 1)",
      args: [NOW, NOW],
    });
    await projectClient.close();

    await registerProjectWithOwnerMembership(globalClient, {
      projectId: projectIdValue,
      databaseId: projectDbPath,
      ownerUserId: "user-owner-unused",
      now: NOW,
    });
    await globalClient.execute({
      sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES ('m-ms', ?, 'user-ms', ?, NULL)",
      args: [projectIdValue, NOW],
    });
    await globalClient.execute("INSERT OR IGNORE INTO permissions (id, key) VALUES ('p_mu', 'milestone.update')");
    const permId = await globalClient.execute({ sql: "SELECT id FROM permissions WHERE key = 'milestone.update'" });
    await globalClient.execute({
      sql: "INSERT INTO membership_permission_assignments (id, membership_id, permission_id, scope_type, scope_id, created_at, revoked_at) VALUES ('da_ms', 'm-ms', ?, 'project', ?, ?, NULL)",
      args: [String(permId.rows[0]!.id), projectIdValue, NOW],
    });
  });

  afterAll(async () => {
    await globalClient.close();
  });

  it("[Review-CL-05] 1 request entity-scoped mutation → 1x fetch assignment Membership (bukan 2x)", async () => {
    const deps = buildMilestoneRoutesDeps({
      identityResolver: { resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")) },
      globalClient,
      turso: null,
    });
    const app = new Hono().route("/", createMilestonesRouter(() => deps));

    const counter = countAssignmentQueryCalls(globalClient);
    const res = await app.request(`http://localhost/api/v1/projects/${projectIdValue}/milestones/ms_1`, {
      method: "PATCH",
      headers: { "x-test-user": "user-ms", "content-type": "application/json" },
      body: JSON.stringify({ expected_version: 1, title: "diubah" }),
    });

    expect(res.status).toBe(200); // buktikan authorize() dgn entity tetap ALLOW seperti sebelum fix
    expect(counter.count()).toBe(1); // sebelum fix: 2 (pipeline + effectiveFor re-fetch)
  });
});
