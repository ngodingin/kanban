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

// Goal 1.10.1 — GET /api/v1/projects/:project_id/members
// (C.12 amandemen 2.1.0 + 2.4.0, FR-008): member.read; query param `status`
// comma-separated subset active,revoked; tanpa param → keduanya.

interface TestCtx {
  globalClient: Client;
  deps: ReturnType<typeof buildProjectAdminDeps>;
  dir: string;
  projectIdA: string;
}

let ctx: TestCtx;
let revokedMembershipId = "";
const projectIdB = `pg-b-${newProjectId()}`;

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-members-"));
  const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  const now = new Date().toISOString();
  for (const user of ["user-a", "user-b", "user-c", "user-x"]) {
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
  for (const [id, userId] of [[`m-b-${projectIdA}`, "user-b"], [`m-c-${projectIdA}`, "user-c"]] as const) {
    await globalClient.execute({
      sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES (?, ?, ?, ?, NULL)",
      args: [id, projectIdA, userId, now],
    });
  }
  // Satu membership revoked — untuk filter status.
  revokedMembershipId = `m-x-${projectIdA}`;
  await globalClient.execute({
    sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES (?, ?, 'user-x', ?, ?)",
    args: [revokedMembershipId, projectIdA, now, now],
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

async function listMembers(user: string, query = "") {
  return (await makeRouter()).request(`http://localhost/v1/projects/${ctx.projectIdA}/members${query}`, {
    method: "GET",
    headers: { "x-test-user": user },
  });
}

describe("GET /members (goal 1.10.1)", () => {
  it("[FR-008][C.12] Tanpa status → keduanya (aktif 3 + revoked 1), bentuk payload benar", async () => {
    const res = await listMembers("user-a");
    if (res.status !== 200) throw new Error(`status ${res.status}: ${await res.text()}`);
    const members = (await res.json()).data.members as Array<Record<string, unknown>>;
    if (members.length !== 4) throw new Error(`harusnya 4 membership, dapat ${members.length}`);
    const revoked = members.find((m) => m.membershipId === revokedMembershipId);
    if (!revoked || typeof revoked.revokedAt !== "string") throw new Error("membership revoked tidak muncul tanpa filter");
    const active = members.find((m) => m.userId === "user-b");
    if (!active || active.revokedAt !== null || active.email !== "user-b@test.local") {
      throw new Error(`payload member aktif salah: ${JSON.stringify(active)}`);
    }
  });

  it("[C.12][2.4.0] status=active hanya aktif; status=revoked hanya revoked; kombinasi keduanya", async () => {
    const active = (await (await listMembers("user-a", "?status=active")).json()).data.members as Array<Record<string, unknown>>;
    if (active.length !== 3 || active.some((m) => m.membershipId === revokedMembershipId)) {
      throw new Error(`filter active salah: ${JSON.stringify(active.map((m) => m.membershipId))}`);
    }
    const revokedOnly = (await (await listMembers("user-a", "?status=revoked")).json()).data.members as Array<Record<string, unknown>>;
    if (revokedOnly.length !== 1 || revokedOnly[0]!.membershipId !== revokedMembershipId) {
      throw new Error(`filter revoked salah: ${JSON.stringify(revokedOnly)}`);
    }
    const both = (await (await listMembers("user-a", "?status=active,revoked")).json()).data.members as Array<Record<string, unknown>>;
    if (both.length !== 4) throw new Error(`kombinasi harusnya 4, dapat ${both.length}`);
  });

  it("[C.12] negatif: nilai status tidak dikenal → VALIDATION_ERROR 400", async () => {
    const res = await listMembers("user-a", "?status=archived");
    if (res.status !== 400 || (await res.json()).error.code !== "VALIDATION_ERROR") {
      throw new Error(`harusnya 400 VALIDATION_ERROR, dapat ${res.status}: ${await res.text()}`);
    }
  });

  it("[Rule-3][INV-04] negatif: non-member Project ini → 403; boundary antar Project terjaga", async () => {
    const res = await listMembers("user-x"); // user-x membership-nya sudah revoked → bukan active member
    if (res.status !== 403 || (await res.json()).error.code !== "PERMISSION_DENIED") {
      throw new Error(`revoked member harusnya 403, dapat ${res.status}: ${await res.text()}`);
    }
    const outsider = await (await makeRouter()).request(`http://localhost/v1/projects/${projectIdB}/members`, {
      method: "GET",
      headers: { "x-test-user": "user-b" }, // member A mencoba list Project B
    });
    if (outsider.status !== 403) throw new Error(`list lintas Project harusnya 403, dapat ${outsider.status}`);
    // Daftar Project B hanya berisi member B sendiri — tidak ada kebocoran dari A.
    const resB = await (await makeRouter()).request(`http://localhost/v1/projects/${projectIdB}/members`, {
      method: "GET",
      headers: { "x-test-user": "user-c" },
    });
    const listB = await resB.json();
    if (listB.data.members.length !== 1 || !listB.data.members[0]!.email.startsWith("user-c@")) {
      throw new Error(`daftar Project B bocor: ${JSON.stringify(listB.data.members)}`);
    }
  });
});
