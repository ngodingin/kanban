import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import {
  applyGlobalMigrations,
  newProjectId,
  registerProjectWithOwnerMembership,
} from "@kanban/infrastructure";
import { createProjectAdminRouter, type ProjectAdminRoutesDeps } from "../src/routes/project-admin.ts";
import { buildProjectAdminDeps } from "../src/project-deps.ts";

// Goal 7.9.0 — GET /api/v1/projects/:project_id/permissions (02-SPEC C.12):
// list permission catalog global, return `{ permissions: [{id, key, description}] }`,
// authorization: project member aktif, tidak bocor lintas Project.

interface TestCtx {
  globalClient: Client;
  deps: ProjectAdminRoutesDeps;
  dir: string;
  projectIdA: string;
}

let ctx: TestCtx;

const projectIdB = `perm-b-${newProjectId()}`;

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-perms-"));
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

  const projectIdA = `perm-a-${newProjectId()}`;
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
      turso: null,
    }),
  };
});

afterAll(async () => {
  await ctx?.globalClient.close?.();
  if (ctx?.dir) await rm(ctx.dir, { recursive: true, force: true });
});

function makeApp(deps: ProjectAdminRoutesDeps = ctx.deps): Hono {
  return new Hono().route("/", createProjectAdminRouter(() => deps));
}

describe("GET /v1/projects/:project_id/permissions (goal 7.9.0)", () => {
  it("[C.12] Owner mengembalikan full permission catalog dalam envelope { permissions: [{id, key, description}] }", async () => {
    const app = makeApp();
    const res = await app.request(`http://localhost/v1/projects/${ctx.projectIdA}/permissions`, {
      headers: { "x-test-user": "user-a" },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveProperty("permissions");
    const { permissions } = json.data;
    expect(Array.isArray(permissions)).toBe(true);
    expect(permissions.length).toBeGreaterThan(0);
    for (const entry of permissions) {
      expect(entry).toHaveProperty("id");
      expect(entry).toHaveProperty("key");
      expect(entry).toHaveProperty("description");
      expect(typeof entry.id).toBe("string");
      expect(typeof entry.key).toBe("string");
      expect(entry.key).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
      expect(typeof entry.description).toBe("string");
      expect(entry.description!.length).toBeGreaterThan(0);
    }
  });

  it("[C.12] Member aktif (non-Owner) juga boleh akses", async () => {
    const app = makeApp();
    const res = await app.request(`http://localhost/v1/projects/${ctx.projectIdA}/permissions`, {
      headers: { "x-test-user": "user-b" },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.permissions.length).toBeGreaterThan(0);
  });

  it("[C.12] Semua permission key dari D.1 ada dalam response", async () => {
    const app = makeApp();
    const res = await app.request(`http://localhost/v1/projects/${ctx.projectIdA}/permissions`, {
      headers: { "x-test-user": "user-a" },
    });
    const json = await res.json();
    const keys = json.data.permissions.map((e: { key: string }) => e.key);
    expect(keys).toContain("project.read");
    expect(keys).toContain("card.read");
    expect(keys).toContain("card.move");
    expect(keys).toContain("member.invite");
    expect(keys).toContain("permission_group.create");
    expect(keys).toContain("api_key.read");
  });

  it("[C.12][Rule-3] Non-member ditolak (403)", async () => {
    const app = makeApp();
    const res = await app.request(`http://localhost/v1/projects/${ctx.projectIdA}/permissions`, {
      headers: { "x-test-user": "user-c" },
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("[C.12] Tanpa identitas → 401", async () => {
    const app = makeApp();
    const res = await app.request(`http://localhost/v1/projects/${ctx.projectIdA}/permissions`);
    expect(res.status).toBe(401);
  });

  it("[INV-04] Project boundary: tidak bocor lintas Project", async () => {
    const app = makeApp();
    // user-b adalah member di Project A DAN Owner di Project B.
    // Response Project A hanya berisi catalog global (bukan data spesifik Project).
    const resA = await app.request(`http://localhost/v1/projects/${ctx.projectIdA}/permissions`, {
      headers: { "x-test-user": "user-b" },
    });
    const resB = await app.request(`http://localhost/v1/projects/${projectIdB}/permissions`, {
      headers: { "x-test-user": "user-b" },
    });
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    const jsonA = await resA.json();
    const jsonB = await resB.json();
    // Catalog bersifat global, jadi kedua Project mengembalikan data yang sama.
    expect(jsonA.data.permissions.length).toBe(jsonB.data.permissions.length);
  });
});
