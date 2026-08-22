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

// Goal 1.9.3 — GET /api/v1/projects/:project_id/invitations (C.13/FR-006)
// List seluruh Invitation Project (accepted/revoked/expired, tanpa filter server-side)

// Goal 1.9.4 — POST /api/v1/invitations/:invitation_id/revoke (C.13/FR-006)
// Set revoked_at; invitation sudah accepted MUST NOT dapat di-revoke

interface TestCtx {
  globalClient: Client;
  deps: ReturnType<typeof buildProjectAdminDeps>;
  dir: string;
  projectIdA: string;
}

let ctx: TestCtx;

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-invite-list-revoke-"));
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

async function createInvitation(email: string): Promise<string> {
  const group = await ctx.deps.createPermissionGroup(ctx.projectIdA, { name: `G-${email}`, permissions: [] });
  const created = await ctx.deps.createInvitation(ctx.projectIdA, "user-a", {
    email,
    assignments: [{ groupId: group.id, scopeType: "project", scopeId: ctx.projectIdA }],
  });
  return created.id;
}

describe("GET /projects/:project_id/invitations & POST /invitations/:id/revoke (goals 1.9.3 & 1.9.4)", () => {
  it("[C.13][FR-006] Positif 1.9.3: list mengembalikan seluruh invitation project", async () => {
    // Create 3 invitations with different states
    const inv1 = await createInvitation("user-b@test.local");
    const inv2 = await createInvitation("user-c@test.local");
    const inv3 = await createInvitation("expired@test.local");

    // Accept inv1
    const router = await makeRouter();
    const acceptRes = await router.request(`http://localhost/api/v1/invitations/${inv1}/accept`, {
      method: "POST",
      headers: { "x-test-user": "user-b" },
    });
    if (acceptRes.status !== 200) throw new Error(`accept failed: ${acceptRes.status}`);

    // Revoke inv2
    const revokeRes = await router.request(`http://localhost/api/v1/projects/${ctx.projectIdA}/invitations/${inv2}/revoke`, {
      method: "POST",
      headers: { "x-test-user": "user-a" },
    });
    if (revokeRes.status !== 200) throw new Error(`revoke failed: ${revokeRes.status}`);

    // Expire inv3 manually
    await ctx.globalClient.execute({
      sql: "UPDATE invitations SET expires_at = ? WHERE id = ?",
      args: [new Date(Date.now() - 60_000).toISOString(), inv3],
    });

    // List all invitations
    const listRes = await router.request(`http://localhost/api/v1/projects/${ctx.projectIdA}/invitations`, {
      method: "GET",
      headers: { "x-test-user": "user-a" },
    });
    if (listRes.status !== 200) throw new Error(`list failed: ${listRes.status}`);
    const json = await listRes.json();
    const invitations = json.data;

    if (invitations.length !== 3) throw new Error(`expected 3 invitations, got ${invitations.length}`);

    // Verify states
    const states = invitations.map((i: Record<string, unknown>) => ({
      id: i.id,
      acceptedAt: i.acceptedAt !== null ? "accepted" : i.revokedAt !== null ? "revoked" : "pending",
    }));

    const accepted = states.find((s: Record<string, unknown>) => s.acceptedAt === "accepted");
    const revoked = states.find((s: Record<string, unknown>) => s.acceptedAt === "revoked");
    const pending = states.find((s: Record<string, unknown>) => s.acceptedAt === "pending");

    if (!accepted) throw new Error("accepted invitation not found in list");
    if (!revoked) throw new Error("revoked invitation not found in list");
    if (!pending) throw new Error("pending (expired) invitation not found in list");
  });

  it("[C.13][FR-006] Negatif 1.9.4: revoke pending → revokedAt ter-set", async () => {
    const invId = await createInvitation("pending@test.local");
    const router = await makeRouter();
    const res = await router.request(`http://localhost/api/v1/projects/${ctx.projectIdA}/invitations/${invId}/revoke`, {
      method: "POST",
      headers: { "x-test-user": "user-a" },
    });
    if (res.status !== 200) throw new Error(`revoke pending failed: ${res.status}`);
    const json = await res.json();
    if (json.data.revokedAt === null) throw new Error("revokedAt tidak ter-set");
  });

  it("[C.13][FR-006] Negatif 1.9.4: revoke accepted → INVALID_STATE", async () => {
    const invId = await createInvitation("user-c@test.local");
    const router = await makeRouter();

    // Accept first
    const acceptRes = await router.request(`http://localhost/api/v1/invitations/${invId}/accept`, {
      method: "POST",
      headers: { "x-test-user": "user-c" },
    });
    if (acceptRes.status !== 200) throw new Error(`accept failed: ${acceptRes.status}`);

    // Try to revoke accepted invitation
    const revokeRes = await router.request(`http://localhost/api/v1/projects/${ctx.projectIdA}/invitations/${invId}/revoke`, {
      method: "POST",
      headers: { "x-test-user": "user-a" },
    });
    if (revokeRes.status !== 409) throw new Error(`expected 409, got ${revokeRes.status}`);
    const json = await revokeRes.json();
    if (json.error.code !== "INVALID_STATE") throw new Error(`expected INVALID_STATE, got ${json.error.code}`);
  });

  it("[C.13][BR-007/BR-009] Project boundary: list invitations tidak bocor lintas Project", async () => {
    // Create invitation di projectA
    await createInvitation("boundary-test@test.local");

    // Create projectB dengan owner terpisah
    const projectIdB = `pg-b-${newProjectId()}`;
    const now = new Date().toISOString();
    await registerProjectWithOwnerMembership(ctx.globalClient, {
      projectId: projectIdB,
      databaseId: `file:${join(ctx.dir, "unused-b.db")}`,
      ownerUserId: "user-b",
      now,
    });

    // List invitations dari projectB (seharusnya kosong)
    const router = await makeRouter();
    const listRes = await router.request(`http://localhost/api/v1/projects/${projectIdB}/invitations`, {
      method: "GET",
      headers: { "x-test-user": "user-b" },
    });
    if (listRes.status !== 200) throw new Error(`list projectB failed: ${listRes.status}`);
    const json = await listRes.json();
    if (json.data.length !== 0) throw new Error(`projectB should have 0 invitations, got ${json.data.length}`);
  });
});
