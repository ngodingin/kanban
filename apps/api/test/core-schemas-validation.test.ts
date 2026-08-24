import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { Hono } from "hono";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyGlobalMigrations, registerProjectWithOwnerMembership, newProjectId } from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";
import { createMilestonesRouter, type MilestoneRoutesDeps } from "../src/routes/milestones.ts";

const BASE = "2026-01-01T00:00:00.000Z";
let dir: string;
let globalClient: Client;
let deps: MilestoneRoutesDeps;
let pid: string;

const identityFor = (userId: string | null): Promise<ResolvedIdentity | null> =>
  userId === null
    ? Promise.resolve(null)
    : Promise.resolve({ type: "session", userId, email: `${userId}@t.local`, name: userId, emailVerified: true, image: null });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kanban-core-schemas-"));
  globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  await globalClient.execute({
    sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES ('u1', 'u1@t.local', 1, 'u1', ?, ?)",
    args: [BASE, BASE],
  });
  pid = `a-${newProjectId()}`;
  const dbPath = `file:${join(dir, `${pid}.db`)}`;
  const pdb = createClient({ url: dbPath });
  const { applyProjectMigrations } = await import("@kanban/infrastructure");
  await applyProjectMigrations(pdb);
  await pdb.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, 'P', ?, ?, 1)",
    args: [pid, BASE, BASE],
  });
  await pdb.close();
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: pid, databaseId: dbPath, ownerUserId: "u1", now: BASE,
  });

  deps = {
    resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
    newMilestoneId: () => `ms-${Math.random().toString(36).slice(2)}`,
    openProjectContext: async (request, projectId) => {
      const pipeline = new (await import("@kanban/infrastructure")).RequestPipeline({
        identityResolver: { resolveIdentity: (req) => identityFor(req.headers.get("x-test-user")) },
        globalClient,
        databaseResolver: new (await import("@kanban/infrastructure")).SqliteProjectDatabaseResolver(globalClient),
        projectClientFactory: { create: (databaseId) => createClient({ url: databaseId }) },
      });
      const resolved = await pipeline.run(request, projectId as string);
      return {
        userId: resolved.identity.userId,
        ownerUserId: resolved.project.ownerUserId,
        database: resolved.database,
        permission: resolved.permission,
        effectiveFor: (await import("@kanban/infrastructure")).createEntityPermissionResolver({
          globalClient,
          membershipId: resolved.membership.id,
          projectId: projectId as string,
          isOwner: resolved.project.ownerUserId === resolved.identity.userId,
        }),
      };
    },
  } as unknown as MilestoneRoutesDeps;
});

afterAll(async () => {
  await globalClient.close();
  rmSync(dir, { recursive: true, force: true });
});

const app = (): Hono => new Hono().route("/", createMilestonesRouter(() => deps));

describe("Zod core schemas — collect-all details (goal 6.2.1)", () => {
  it("[C.2] multi-field invalid → VALIDATION_ERROR.details memuat SEMUA field gagal sekaligus", async () => {
    const res = await app().request(`http://localhost/v1/projects/${pid}/milestones`, {
      method: "POST",
      headers: { "x-test-user": "u1", "content-type": "application/json" },
      body: JSON.stringify({ title: "", progress: 150, startDate: 42 }),
    });
    expect(res.status).toBe(400);
    const err = (await res.json()).error;
    expect(err.code).toBe("VALIDATION_ERROR");
    const fields = err.details.map((d: { field: string }) => d.field);
    expect(fields).toContain("title");
    expect(fields).toContain("progress");
    expect(fields).toContain("startDate");
  });

  it("[parity] payload valid tetap 201 dan field opsional bernilai default yang sama", async () => {
    const res = await app().request(`http://localhost/v1/projects/${pid}/milestones`, {
      method: "POST",
      headers: { "x-test-user": "u1", "content-type": "application/json" },
      body: JSON.stringify({ title: "  Alpha  " }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.milestone.title).toBe("Alpha"); // trim dipertahankan
    expect(json.data.milestone.progress).toBe(0);   // default 0
  });
});
