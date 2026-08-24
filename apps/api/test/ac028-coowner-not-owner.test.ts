import { mkdtemp, rm } from "node:fs/promises";
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
  revokeMembership,
} from "@kanban/infrastructure";
import { buildProjectAdminDeps } from "../src/project-deps.ts";
import { createProjectAdminRouter } from "../src/routes/project-admin.ts";

// AC-028 (goal 6.8.6) — Co-Owner BUKAN Owner (BR-035/BR-036/FR-002):
// member dengan Group Co-Owner (katalog penuh) tetap (a) tidak bisa revoke
// Owner asli — terhalang invariant ownership, bukan otorisasi; (b) tidak
// pernah muncul sebagai ownerUserId; (c) membershipnya sendiri tetap bisa
// di-revoke oleh Owner asli.

const NOW = "2026-08-25T00:00:00.000Z";

let dir: string;
let globalClient: Client;
let pid: string;
let ownerMembershipId: string;
let coMembershipId: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "kanban-ac028-"));
  globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  for (const u of ["u-owner", "u-co"]) {
    await globalClient.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
      args: [u, `${u}@t.local`, u, NOW, NOW],
    });
  }

  pid = `pg-${newProjectId()}`;
  const pdb = createClient({ url: `file:${join(dir, "proj.db")}` });
  await applyProjectMigrations(pdb);
  await pdb.close();
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: pid,
    databaseId: `file:${join(dir, "proj.db")}`,
    ownerUserId: "u-owner",
    now: NOW,
  });

  const ownerRow = await globalClient.execute({
    sql: "SELECT id FROM project_memberships WHERE project_id = ? AND user_id = 'u-owner'",
    args: [pid],
  });
  ownerMembershipId = String(ownerRow.rows[0]!.id);

  // Member kedua + assignment ke baseline Group "Co-Owner" (katalog penuh,
  // dibuat otomatis saat provisioning — lihat baseline-groups.test.ts)
  coMembershipId = `m-co-${pid}`;
  await globalClient.execute({
    sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES (?, ?, 'u-co', ?, NULL)",
    args: [coMembershipId, pid, NOW],
  });
  const groupRow = await globalClient.execute({
    sql: "SELECT id FROM permission_groups WHERE project_id = ? AND name = 'Co-Owner'",
    args: [pid],
  });
  const groupId = String(groupRow.rows[0]!.id);
  await globalClient.execute({
    sql: "INSERT INTO membership_group_assignments (id, membership_id, group_id, scope_type, scope_id, created_at, revoked_at) VALUES (?, ?, ?, 'project', ?, ?, NULL)",
    args: [`asg-${groupId}`, coMembershipId, groupId, pid, NOW],
  });
});

afterAll(async () => {
  await globalClient.close();
  await rm(dir, { recursive: true, force: true });
});

const makeRouter = (): Promise<Hono> => {
  const deps = buildProjectAdminDeps({
    identityResolver: {
      resolveIdentity: async (request) => {
        const userId = request.headers.get("x-test-user");
        if (userId === null) return null;
        return {
          type: "session" as const,
          userId,
          email: `${userId}@t.local`,
          name: userId,
          emailVerified: true,
          image: null,
        };
      },
    },
    globalClient,
  });
  return Promise.resolve(new Hono().route("/", createProjectAdminRouter(() => deps)));
};

const revoke = (membershipId: string, user: string): Promise<Response> =>
  makeRouter().then((router) =>
    router.request(`http://localhost/v1/projects/${pid}/members/${membershipId}/revoke`, {
      method: "POST",
      headers: { "x-test-user": user },
    }),
  );

describe("AC-028 — Co-Owner BUKAN Owner (goal 6.8.6)", () => {
  it("[AC-028] Co-Owner coba revoke Owner asli via API → ditolak 403 PERMISSION_DENIED (endpoint revoke Owner-only interim, C.12/CL-25)", async () => {
    const res = await revoke(ownerMembershipId, "u-co");
    expect(res.status).toBe(403);
    expect((await res.json()).error?.code).toBe("PERMISSION_DENIED");
    const stillActive = await globalClient.execute({
      sql: "SELECT COUNT(*) AS n FROM project_memberships WHERE id = ? AND revoked_at IS NULL",
      args: [ownerMembershipId],
    });
    expect(Number(stillActive.rows[0]!.n)).toBe(1);
  });

  it("[AC-028] lapisan repository: guard ownership menolak revoke terhadap Owner aktif apa pun actornya → INVALID_STATE (BR-035/FR-002)", async () => {
    // Route memakai Owner-only interim sehingga guard ini tidak tercapai via
    // HTTP untuk non-Owner; di level domain, guard bersifat actor-independent.
    await expect(
      revokeMembership(globalClient, { projectId: pid, membershipId: ownerMembershipId, actorUserId: "u-co" }),
    ).rejects.toMatchObject({ name: "PipelineError", code: "INVALID_STATE", httpStatus: 409 });
  });

  it("[AC-028] ownerUserId tetap Owner asli — Co-Owner tidak pernah muncul sebagai owner", async () => {
    const row = await globalClient.execute({
      sql: "SELECT owner_user_id FROM projects WHERE id = ?",
      args: [pid],
    });
    expect(String(row.rows[0]!.owner_user_id)).toBe("u-owner");
    expect(String(row.rows[0]!.owner_user_id)).not.toBe("u-co");
  });

  it("[AC-028] Owner asli TETAP dapat me-revoke Membership Co-Owner → 200 + revokedAt ter-set", async () => {
    const res = await revoke(coMembershipId, "u-owner");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { membership: { revokedAt: string | null } } }).data.membership.revokedAt).not.toBeNull();
    const dbRow = await globalClient.execute({
      sql: "SELECT revoked_at FROM project_memberships WHERE id = ?",
      args: [coMembershipId],
    });
    expect(dbRow.rows[0]!.revoked_at).not.toBeNull();
  });
});
