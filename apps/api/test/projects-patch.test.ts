import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import {
  applyGlobalMigrations,
  applyProjectMigrations,
  newProjectId,
  registerProjectWithOwnerMembership,
  RequestPipeline,
  SqliteProjectDatabaseResolver,
  createEntityPermissionResolver,
} from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";
import { createProjectsRouter, type ProjectRoutesDeps } from "../src/routes/projects.ts";

interface TestCtx {
  globalClient: Client;
  deps: ProjectRoutesDeps;
  dir: string;
}

let ctx: TestCtx;
let idA1: string;

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-patch-"));
  const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  const now = new Date().toISOString();
  for (const user of ["user-a", "user-b"]) {
    await globalClient.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
      args: [user, `${user}@test.local`, user, now, now],
    });
  }

  idA1 = `a1-${newProjectId()}`;
  const dbPathA1 = `file:${join(dir, `${idA1}.db`)}`;
  const projectClient = createClient({ url: dbPathA1 });
  await applyProjectMigrations(projectClient);
  await projectClient.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, 'Nama Awal', ?, ?, 1)",
    args: [idA1, now, now],
  });
  await projectClient.close();
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: idA1,
    databaseId: dbPathA1,
    ownerUserId: "user-a",
    now,
  });

  await globalClient.execute({
    sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES ('m-extra-b', ?, 'user-b', ?, NULL)",
    args: [idA1, now],
  });

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

  ctx = {
    globalClient,
    dir,
    deps: {
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
        } satisfies ResolvedIdentity;
      },
      newProjectId,
      createProject: async () => {
        throw new Error("tidak dipakai di test patch");
      },
      listProjects: async () => [],
      openProjectContext: async (request, projectId) => {
        const pipeline = new RequestPipeline({
          identityResolver: {
            resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
          },
          globalClient,
          databaseResolver: new SqliteProjectDatabaseResolver(globalClient),
          projectClientFactory: {
            create: (databaseId) => createClient({ url: databaseId }),
          },
        });
        const resolved = await pipeline.run(request, projectId);
        return {
          userId: resolved.identity.userId,
          ownerUserId: resolved.project.ownerUserId,
          database: resolved.database,
          permission: resolved.permission,
          effectiveFor: createEntityPermissionResolver({
            globalClient,
            membershipId: resolved.membership.id,
            projectId: projectId,
            isOwner: resolved.project.ownerUserId === resolved.identity.userId,
          }),
        };
      },
    },
  };
});

afterAll(async () => {
  await ctx.globalClient.close();
  await rm(ctx.dir, { recursive: true, force: true });
});

function makeApp(): Hono {
  return new Hono().route("/", createProjectsRouter(() => ctx.deps));
}

function patch(body: unknown, user?: string) {
  return makeApp().request(`http://localhost/v1/projects/${idA1}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(user ? { "x-test-user": user } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/v1/projects/:project_id — rename Owner-only interim (goal 1.3.4)", () => {
  it("[BR-035][C.4] owner rename dengan expected_version benar → 200, name baru, version+1, Activity project.updated", async () => {
    const res = await patch({ name: "Nama Baru", expected_version: 1 }, "user-a");
    if (res.status !== 200) throw new Error(`status ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const p = json.data.project;
    if (p.name !== "Nama Baru" || p.version !== 2) throw new Error(`hasil salah: ${JSON.stringify(p)}`);

    const mapping = await ctx.globalClient.execute({
      sql: "SELECT database_id FROM project_databases WHERE project_id = ?",
      args: [idA1],
    });
    const proj = createClient({ url: String(mapping.rows[0]!.database_id) });
    try {
      const acts = await proj.execute({
        sql: "SELECT action, actor_user_id FROM activities WHERE action = 'project.updated'",
      });
      if (acts.rows.length !== 1 || acts.rows[0]!.actor_user_id !== "user-a") {
        throw new Error(`Activity project.updated tidak tercipta: ${JSON.stringify(acts.rows)}`);
      }
    } finally {
      await proj.close();
    }
  });

  it("[C.4][interim-authz] member non-owner ditolak PERMISSION_DENIED 403 — bukan hanya PROJECT_ACCESS_DENIED", async () => {
    const res = await patch({ name: "Coba Rebut", expected_version: 2 }, "user-b");
    if (res.status !== 403) throw new Error(`status ${res.status}, harusnya 403`);
    const json = await res.json();
    if (json.error?.code !== "PERMISSION_DENIED") throw new Error(`code ${json.error?.code}`);
  });

  it("[AC-020][INV-07] PATCH dengan expected_version stale ditolak VERSION_CONFLICT 409 tanpa mengubah state", async () => {
    const res = await patch({ name: "Tulis Lama", expected_version: 1 }, "user-a");
    if (res.status !== 409) throw new Error(`status ${res.status}`);
    const json = await res.json();
    if (json.error?.code !== "VERSION_CONFLICT") throw new Error(`code ${json.error?.code}`);
    const check = await makeApp().request(`http://localhost/v1/projects/${idA1}`, {
      headers: { "x-test-user": "user-a" },
    });
    const p = (await check.json()).data.project;
    if (p.name !== "Nama Baru" || p.version !== 2) throw new Error(`state berubah diam-diam: ${JSON.stringify(p)}`);
  });

  it("[C.15][C.2] payload invalid: expected_version hilang / bukan integer / name kosong → VALIDATION_ERROR 400", async () => {
    for (const [label, body] of [
      ["tanpa expected_version", { name: "X" }],
      ["expected_version nol", { name: "X", expected_version: 0 }],
      ["expected_version pecahan", { name: "X", expected_version: 1.5 }],
      ["name kosong", { name: " ", expected_version: 2 }],
    ] as const) {
      const res = await patch(body as unknown, "user-a");
      if (res.status !== 400) throw new Error(`${label}: status ${res.status}, harusnya 400`);
      const json = await res.json();
      if (json.error?.code !== "VALIDATION_ERROR") throw new Error(`${label}: code ${json.error?.code}`);
    }
  });

  it("[C.2] PATCH tanpa identitas ditolak TOKEN_EXPIRED 401 sebelum otorisasi", async () => {
    const res = await patch({ name: "Anonim", expected_version: 2 });
    if (res.status !== 401) throw new Error(`status ${res.status}`);
    const json = await res.json();
    if (json.error?.code !== "TOKEN_EXPIRED") throw new Error(`code ${json.error?.code}`);
  });
});
