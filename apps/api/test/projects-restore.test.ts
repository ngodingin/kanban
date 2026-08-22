import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import {
  applyGlobalMigrations,
  applyProjectMigrations,
  DrizzleProjectRepository,
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
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-restore-"));
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
        throw new Error("tidak dipakai di test restore");
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

async function currentStateVersion(): Promise<number> {
  const res = await makeApp().request(`http://localhost/api/v1/projects/${idA1}`, {
    headers: { "x-test-user": "user-a" },
  });
  return (await res.json()).data.project.version;
}

function restore(body: unknown, user?: string) {
  return makeApp().request(`http://localhost/api/v1/projects/${idA1}/restore`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(user ? { "x-test-user": user } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/projects/:project_id/restore — lifecycle ARCHIVED→ACTIVE (goal 1.4.2)", () => {
  it("[INV-LIFE-002][C.4] restore pada project ACTIVE ditolak INVALID_STATE 409 (hanya valid dari ARCHIVED)", async () => {
    const version = await currentStateVersion();
    if (version !== 1) throw new Error(`fixture harus masih ACTIVE v1, dapat v${version}`);
    const res = await restore({ expected_version: version }, "user-a");
    if (res.status !== 409) throw new Error(`status ${res.status}, harusnya 409`);
    const json = await res.json();
    if (json.error?.code !== "INVALID_STATE") throw new Error(`code ${json.error?.code}`);
  });

  it("[A.3][C.4][B.5] owner restore dari ARCHIVED → 200, archived_at null kembali, Activity project.restored dengan previous_state ARCHIVED", async () => {
    const mapping = await ctx.globalClient.execute({
      sql: "SELECT database_id FROM project_databases WHERE project_id = ?",
      args: [idA1],
    });
    const proj = createClient({ url: String(mapping.rows[0]!.database_id) });
    let fixtureVersion: number;
    try {
      const repo = new DrizzleProjectRepository(proj);
      const archived = await repo.archiveProject({ projectId: idA1, expectedVersion: 1, actorUserId: "user-a" });
      if (archived.archivedAt === null || archived.version !== 2) {
        throw new Error(`fixture archive gagal: ${JSON.stringify(archived)}`);
      }
      fixtureVersion = archived.version;
    } finally {
      await proj.close();
    }

    const res = await restore({ expected_version: fixtureVersion }, "user-a");
    if (res.status !== 200) throw new Error(`status ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const p = json.data.project;
    if (p.archivedAt !== null || p.version !== fixtureVersion + 1) throw new Error(`state salah: ${JSON.stringify(p)}`);

    const verify = createClient({ url: String(mapping.rows[0]!.database_id) });
    try {
      const acts = await verify.execute({
        sql: "SELECT action, data FROM activities WHERE action = 'project.restored'",
      });
      const row = acts.rows[0];
      if (!row || !(row.data as string).includes("ARCHIVED")) {
        throw new Error(`Activity project.restored tidak sesuai B.5: ${JSON.stringify(acts.rows)}`);
      }
    } finally {
      await verify.close();
    }
  });

  it("[AC-020][INV-07] restore dengan expected_version stale → VERSION_CONFLICT 409", async () => {
    const res = await restore({ expected_version: 1 }, "user-a");
    if (res.status !== 409) throw new Error(`status ${res.status}, harusnya 409`);
    const json = await res.json();
    if (json.error?.code !== "VERSION_CONFLICT") throw new Error(`code ${json.error?.code}`);
  });

  it("[C.4][interim-authz][C.2] non-owner → PERMISSION_DENIED 403; tanpa identitas → TOKEN_EXPIRED 401; tanpa expected_version → INVALID_STATE", async () => {
    const forbidden = await restore({ expected_version: 4 }, "user-b");
    if (forbidden.status !== 403) throw new Error(`status ${forbidden.status}, harusnya 403`);
    const anon = await restore({ expected_version: 4 });
    if (anon.status !== 401) throw new Error(`status ${anon.status}, harusnya 401`);
    const noVersion = await restore({}, "user-a");
    if (noVersion.status !== 409) throw new Error(`status ${noVersion.status}, harusnya 409`);
  });
});
