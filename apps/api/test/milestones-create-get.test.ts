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
  createEntityPermissionResolver,
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
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-milestones-"));
  const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  const now = new Date().toISOString();
  for (const user of ["user-a", "user-b"]) {
    await globalClient.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
      args: [user, `${user}@test.local`, user, now, now],
    });
  }

  const provision = async (
    projectId: string,
    projectName: string,
    ownerUserId: string,
    lifecycle: { archivedAt?: string | null; deletedAt?: string | null } = {},
  ): Promise<void> => {
    const dbPath = `file:${join(dir, `${projectId}.db`)}`;
    const projectClient = createClient({ url: dbPath });
    await applyProjectMigrations(projectClient);
    await projectClient.execute({
      sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, archived_at, deleted_at, version) VALUES (?, ?, ?, ?, ?, ?, 1)",
      args: [projectId, projectName, now, now, lifecycle.archivedAt ?? null, lifecycle.deletedAt ?? null],
    });
    await projectClient.close();
    await registerProjectWithOwnerMembership(globalClient, {
      projectId,
      databaseId: dbPath,
      ownerUserId,
      now,
    });
  };

  const idA1 = `a1-${newProjectId()}`;
  const idA2 = `a2-${newProjectId()}`;
  const idB1 = `b1-${newProjectId()}`;
  const idArch = `arch-${newProjectId()}`;
  await provision(idA1, "Proj A1", "user-a");
  await provision(idA2, "Proj A2", "user-a");
  await provision(idB1, "Proj B1", "user-b");
  await provision(idArch, "Proj Archived", "user-a", { archivedAt: now });

  ctx = {
    globalClient,
    dir,
    deps: {
      resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
      newMilestoneId: () => `ms-${Math.random().toString(36).slice(2, 10)}`,
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
  return new Hono().route("/", createMilestonesRouter(() => ctx.deps));
}

async function projectIdOwnedBy(owner: string, index = 0): Promise<string> {
  const rows = await ctx.globalClient.execute({
    sql: "SELECT id FROM projects WHERE owner_user_id = ? ORDER BY id LIMIT 1 OFFSET ?",
    args: [owner, index],
  });
  return String(rows.rows[0]!.id);
}

describe("POST /api/v1/projects/:project_id/milestones — goal 2.3.1", () => {
  it("[FR-014][C.5][C.2] Owner membuat milestone → 201 envelope data.milestone lengkap + row DB + Activity", async () => {
    const projectId = await projectIdOwnedBy("user-a");
    const res = await makeApp().request(`http://localhost/api/v1/projects/${projectId}/milestones`, {
      method: "POST",
      headers: { "x-test-user": "user-a", "content-type": "application/json" },
      body: JSON.stringify({
        title: "MVP",
        description: "fase awal",
        progress: 25,
        start_date: "2026-08-17",
        due_date: "2026-09-30",
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    const ms = json.data.milestone;
    expect(ms.title).toBe("MVP");
    expect(ms.description).toBe("fase awal");
    expect(ms.progress).toBe(25);
    expect(ms.startDate).toBe("2026-08-17");
    expect(ms.dueDate).toBe("2026-09-30");
    expect(ms.version).toBe(1);
    expect(ms.archivedAt).toBeNull();
    expect(ms.deletedAt).toBeNull();

    const dbPathRow = await ctx.globalClient.execute({
      sql: "SELECT d.database_id AS database_id FROM project_databases d WHERE d.project_id = ?",
      args: [projectId],
    });
    const projectDb = createClient({ url: String(dbPathRow.rows[0]!.database_id) });
    try {
      const row = await projectDb.execute({ sql: "SELECT title FROM milestones WHERE id = ?", args: [ms.id] });
      expect(row.rows[0]?.title).toBe("MVP");
      const activity = await projectDb.execute({
        sql: "SELECT action, entity_type FROM activities WHERE entity_id = ?",
        args: [ms.id],
      });
      expect(activity.rows[0]).toMatchObject({ action: "milestone.created", entity_type: "milestone" });
    } finally {
      await projectDb.close();
    }
  });

  it("[C.2] tanpa identitas → TOKEN_EXPIRED 401", async () => {
    const projectId = await projectIdOwnedBy("user-a");
    const res = await makeApp().request(`http://localhost/api/v1/projects/${projectId}/milestones`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "X" }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error?.code).toBe("TOKEN_EXPIRED");
  });

  it("[C.5] non-member → PROJECT_ACCESS_DENIED tanpa membuat apa pun", async () => {
    const projectId = await projectIdOwnedBy("user-a");
    const res = await makeApp().request(`http://localhost/api/v1/projects/${projectId}/milestones`, {
      method: "POST",
      headers: { "x-test-user": "user-b", "content-type": "application/json" },
      body: JSON.stringify({ title: "X" }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error?.code).toBe("PROJECT_ACCESS_DENIED");
  });

  it("[INV-LIFE-001][BR-013] create pada Project ARCHIVED → ditolak INVALID_STATE 409", async () => {
    const projectId = await projectIdOwnedBy("user-a", 2);
    const res = await makeApp().request(`http://localhost/api/v1/projects/${projectId}/milestones`, {
      method: "POST",
      headers: { "x-test-user": "user-a", "content-type": "application/json" },
      body: JSON.stringify({ title: "X" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error?.code).toBe("INVALID_STATE");
  });

  it("[C.5] payload invalid (title kosong / progress bukan 0–100) → VALIDATION_ERROR 400", async () => {
    const projectId = await projectIdOwnedBy("user-a");
    for (const body of [
      JSON.stringify({ title: "" }),
      JSON.stringify({ title: "X", progress: 101 }),
      JSON.stringify({ title: "X", progress: -1 }),
      JSON.stringify({ title: "X", progress: "banyak" }),
      JSON.stringify({}),
      "bukan-json",
    ]) {
      const res = await makeApp().request(`http://localhost/api/v1/projects/${projectId}/milestones`, {
        method: "POST",
        headers: { "x-test-user": "user-a", "content-type": "application/json" },
        body,
      });
      expect(res.status, body).toBe(400);
      expect((await res.json()).error?.code, body).toBe("VALIDATION_ERROR");
    }
  });
});

describe("GET /api/v1/projects/:project_id/milestones/:milestone_id — goal 2.3.1", () => {
  let seeded: { projectId: string; milestoneId: string };

  beforeAll(async () => {
    const projectId = await projectIdOwnedBy("user-a", 1);
    const res = await makeApp().request(`http://localhost/api/v1/projects/${projectId}/milestones`, {
      method: "POST",
      headers: { "x-test-user": "user-a", "content-type": "application/json" },
      body: JSON.stringify({ title: "Terlihat", progress: 10 }),
    });
    const json = await res.json();
    seeded = { projectId, milestoneId: json.data.milestone.id as string };
  });

  it("[C.5][C.2] member membaca milestone via pipeline", async () => {
    const res = await makeApp().request(
      `http://localhost/api/v1/projects/${seeded.projectId}/milestones/${seeded.milestoneId}`,
      { headers: { "x-test-user": "user-a" } },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.milestone).toMatchObject({ id: seeded.milestoneId, title: "Terlihat", progress: 10 });
  });

  it("[INV-04] Project-boundary: milestone Project lain tidak bocor — akses non-member ditolak", async () => {
    const res = await makeApp().request(
      `http://localhost/api/v1/projects/${seeded.projectId}/milestones/${seeded.milestoneId}`,
      { headers: { "x-test-user": "user-b" } },
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error?.code).toBe("PROJECT_ACCESS_DENIED");
  });

  it("[C.2] milestone tidak ada → RESOURCE_NOT_FOUND 404", async () => {
    const projectId = await projectIdOwnedBy("user-a", 1);
    const res = await makeApp().request(`http://localhost/api/v1/projects/${projectId}/milestones/ms_tidak_ada`, {
      headers: { "x-test-user": "user-a" },
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error?.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("[C.2] GET tanpa identitas → TOKEN_EXPIRED 401", async () => {
    const res = await makeApp().request(
      `http://localhost/api/v1/projects/${seeded.projectId}/milestones/${seeded.milestoneId}`,
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error?.code).toBe("TOKEN_EXPIRED");
  });
});
