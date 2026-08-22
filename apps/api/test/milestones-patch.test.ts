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
  RequestPipeline,
  SqliteProjectDatabaseResolver,
} from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";
import { createMilestonesRouter, type MilestoneRoutesDeps } from "../src/routes/milestones.ts";

interface TestCtx {
  globalClient: Client;
  deps: MilestoneRoutesDeps;
  dir: string;
}

let ctx: TestCtx;

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
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-ms-patch-"));
  const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  const now = new Date().toISOString();
  for (const user of ["user-a", "user-b"]) {
    await globalClient.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
      args: [user, `${user}@test.local`, user, now, now],
    });
  }

  const projectId = `a1-${newProjectId()}`;
  const dbPath = `file:${join(dir, `${projectId}.db`)}`;
  const projectClient = createClient({ url: dbPath });
  await applyProjectMigrations(projectClient);
  await projectClient.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, ?, ?, ?, 1)",
    args: [projectId, "Proj A1", now, now],
  });
  await projectClient.execute({
    sql: "INSERT INTO milestones (id, title, description, progress, start_date, due_date, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)",
    args: ["ms_patch", "Awal", "desk", 10, "2026-08-01", null, now, now],
  });
  await projectClient.close();
  await registerProjectWithOwnerMembership(globalClient, {
    projectId,
    databaseId: dbPath,
    ownerUserId: "user-a",
    now,
  });
  await globalClient.execute({
    sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES ('m-extra-b', ?, 'user-b', ?, NULL)",
    args: [projectId, now],
  });

  ctx = {
    globalClient,
    dir,
    deps: {
      resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
      newMilestoneId: () => `ms-${Math.random().toString(36).slice(2, 10)}`,
      openProjectContext: async (request, pid) => {
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
        const resolved = await pipeline.run(request, pid);
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
  return new Hono().route("/", createMilestonesRouter(() => ctx.deps));
}

async function projectId(): Promise<string> {
  const rows = await ctx.globalClient.execute({ sql: "SELECT id FROM projects LIMIT 1" });
  return String(rows.rows[0]!.id);
}

function patch(body: unknown, user = "user-a"): Promise<Response> {
  return projectId().then((pid) =>
    makeApp().request(`http://localhost/api/v1/projects/${pid}/milestones/ms_patch`, {
      method: "PATCH",
      headers: { "x-test-user": user, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("PATCH /api/v1/projects/:project_id/milestones/:milestone_id — goal 2.3.2", () => {
  it("[C.5][C.2][B.5] Owner update field → 200 payload baru + Activity changes {before, after}", async () => {
    const res = await patch({
      expected_version: 1,
      title: "Diperbarui",
      progress: 60,
      due_date: "2026-09-30",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.milestone).toMatchObject({
      id: "ms_patch",
      title: "Diperbarui",
      progress: 60,
      startDate: "2026-08-01",
      dueDate: "2026-09-30",
      description: "desk",
      version: 2,
    });

    const dbRow = await ctx.globalClient.execute({
      sql: "SELECT d.database_id AS db FROM project_databases d WHERE d.project_id = (SELECT id FROM projects LIMIT 1)",
    });
    const projectDb = createClient({ url: String(dbRow.rows[0]!.db) });
    try {
      const activity = await projectDb.execute(
        "SELECT action, data FROM activities WHERE entity_id = 'ms_patch' AND action = 'milestone.updated'",
      );
      const parsed = JSON.parse(String(activity.rows[0]!.data));
      expect(parsed.changes).toEqual({
        title: { before: "Awal", after: "Diperbarui" },
        progress: { before: 10, after: 60 },
        dueDate: { before: null, after: "2026-09-30" },
      });
    } finally {
      await projectDb.close();
    }
  });

  it("[C.15] negatif: field domain-controlled tidak dapat diubah via PATCH → VALIDATION_ERROR", async () => {
    for (const body of [
      { expected_version: 2, id: "ms_lain" },
      { expected_version: 2, version: 99 },
      { expected_version: 2, archived_at: null },
      { expected_version: 2, deleted_at: null },
      { expected_version: 2, list_id: "ls_x" },
    ]) {
      const res = await patch(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await res.json()).error?.code, JSON.stringify(body)).toBe("VALIDATION_ERROR");
    }
  });

  it("[SOT 2.3.0] negatif: payload invalid bentuk → VALIDATION_ERROR 400 (bukan INVALID_STATE)", async () => {
    for (const body of [
      { title: "" },
      { expected_version: 2, progress: 101 },
      { expected_version: true },
      {},
      "bukan-json",
    ]) {
      const res = await patch(body as unknown as Record<string, unknown>);
      expect(res.status).toBe(400);
      expect((await res.json()).error?.code).toBe("VALIDATION_ERROR");
    }
  });

  it("[AC-020] negatif: version mismatch → VERSION_CONFLICT 409 tanpa perubahan", async () => {
    const res = await patch({ expected_version: 999, title: "Tabrakan" });
    expect(res.status).toBe(409);
    expect((await res.json()).error?.code).toBe("VERSION_CONFLICT");
  });

  it("[Authz interim] non-Owner → PERMISSION_DENIED 403", async () => {
    const res = await patch({ expected_version: 2, title: "Bukan milikku" }, "user-b");
    expect(res.status).toBe(403);
    expect((await res.json()).error?.code).toBe("PERMISSION_DENIED");
  });

  it("[A.3/INV-LIFE-003] milestone ARCHIVED tidak menerima PATCH → INVALID_STATE 409", async () => {
    const pid = await projectId();
    const dbRow = await ctx.globalClient.execute({
      sql: "SELECT d.database_id AS db FROM project_databases d WHERE d.project_id = ?",
      args: [pid],
    });
    const projectDb = createClient({ url: String(dbRow.rows[0]!.db) });
    try {
      await projectDb.execute("UPDATE milestones SET archived_at = '2026-08-20T00:00:00.000Z', version = 3 WHERE id = 'ms_patch'");
    } finally {
      await projectDb.close();
    }
    const res = await patch({ expected_version: 3, title: "Gagal" });
    expect(res.status).toBe(409);
    expect((await res.json()).error?.code).toBe("INVALID_STATE");
  });
});
