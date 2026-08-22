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
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-archive-"));
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
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, 'Proj A1', ?, ?, 1)",
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
      resolveIdentity: async (request) => identityFor(request.headers.get("x-test-user")),
      newProjectId,
      createProject: async () => {
        throw new Error("tidak dipakai di test archive");
      },
      listProjects: async () => [],
      openProjectContext: async (request, projectId) => {
        const pipeline = new RequestPipeline({
          identityResolver: {
            resolveIdentity: (req) => identityFor(req.headers.get("x-test-user")),
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

function archive(body: unknown, user?: string) {
  return makeApp().request(`http://localhost/api/v1/projects/${idA1}/archive`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(user ? { "x-test-user": user } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/projects/:project_id/archive — lifecycle ACTIVE→ARCHIVED (goal 1.4.1)", () => {
  it("[A.3][C.4][B.5] owner archive → 200, archived_at terisi, version+1, Activity project.archived dengan previous_state", async () => {
    const res = await archive({ expected_version: 1 }, "user-a");
    if (res.status !== 200) throw new Error(`status ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const p = json.data.project;
    if (p.archivedAt === null || p.version !== 2 || p.deletedAt !== null) {
      throw new Error(`state salah: ${JSON.stringify(p)}`);
    }

    const mapping = await ctx.globalClient.execute({
      sql: "SELECT database_id FROM project_databases WHERE project_id = ?",
      args: [idA1],
    });
    const proj = createClient({ url: String(mapping.rows[0]!.database_id) });
    try {
      const acts = await proj.execute({
        sql: "SELECT action, data FROM activities WHERE action = 'project.archived'",
      });
      const row = acts.rows[0];
      if (!row || !(row.data as string).includes("ACTIVE")) {
        throw new Error(`Activity project.archived tidak sesuai B.5: ${JSON.stringify(acts.rows)}`);
      }
    } finally {
      await proj.close();
    }
  });

  it("[C.4][interim-authz] member non-owner ditolak PERMISSION_DENIED 403", async () => {
    const res = await archive({ expected_version: 3 }, "user-b");
    if (res.status !== 403) throw new Error(`status ${res.status}, harusnya 403`);
    const json = await res.json();
    if (json.error?.code !== "PERMISSION_DENIED") throw new Error(`code ${json.error?.code}`);
  });

  it("[AC-020][INV-07] expected_version stale → VERSION_CONFLICT 409, archived_at tetap null", async () => {
    const fresh = createClient({ url: `file:${join(ctx.dir, `${idA1}.db`)}` });
    try {
      const before = await fresh.execute({
        sql: "SELECT version, archived_at FROM project_state WHERE project_id = ?",
        args: [idA1],
      });
      const staleVersion = Number(before.rows[0]!.version) - 1;
      const res = await archive({ expected_version: staleVersion }, "user-a");
      if (res.status !== 409) throw new Error(`status ${res.status}, harusnya 409`);
      const json = await res.json();
      if (json.error?.code !== "VERSION_CONFLICT") throw new Error(`code ${json.error?.code}`);
      const after = await fresh.execute({
        sql: "SELECT version, archived_at FROM project_state WHERE project_id = ?",
        args: [idA1],
      });
      if (Number(after.rows[0]!.version) !== Number(before.rows[0]!.version) || after.rows[0]!.archived_at === null) {
        throw new Error(`state berubah diam-diam: ${JSON.stringify(after.rows)}`);
      }
    } finally {
      await fresh.close();
    }
  });

  it("[A.3] archive pada state ARCHIVED ditolak INVALID_STATE 409", async () => {
    const current = await makeApp().request(`http://localhost/api/v1/projects/${idA1}`, {
      headers: { "x-test-user": "user-a" },
    });
    const version = (await current.json()).data.project.version;
    const res = await archive({ expected_version: version }, "user-a");
    if (res.status !== 409) throw new Error(`status ${res.status}, harusnya 409`);
    const json = await res.json();
    if (json.error?.code !== "INVALID_STATE") throw new Error(`code ${json.error?.code}`);
  });

  it("[C.2] tanpa expected_version → VALIDATION_ERROR; tanpa identitas → TOKEN_EXPIRED", async () => {
    const noBody = await archive({}, "user-a");
    if (noBody.status !== 400) throw new Error(`status ${noBody.status}, harusnya 400`);
    const jsonNoBody = await noBody.json();
    if (jsonNoBody.error?.code !== "VALIDATION_ERROR") throw new Error(`code ${jsonNoBody.error?.code}`);
    const anon = await archive({ expected_version: 99 });
    if (anon.status !== 401) throw new Error(`status ${anon.status}, harusnya 401`);
    const json = await anon.json();
    if (json.error?.code !== "TOKEN_EXPIRED") throw new Error(`code ${json.error?.code}`);
  });
});
