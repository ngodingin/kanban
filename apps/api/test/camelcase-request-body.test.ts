import { mkdtemp } from "node:fs/promises";
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
} from "@kanban/infrastructure";
import type { ResolvedIdentity } from "@kanban/infrastructure";
import { buildMilestoneRoutesDeps, buildProjectRoutesDeps, buildCardRoutesDeps } from "../src/project-deps.ts";
import { createMilestonesRouter } from "../src/routes/milestones.ts";
import { createProjectsRouter } from "../src/routes/projects.ts";
import { createCardsRouter } from "../src/routes/cards.ts";

// TASK-0.17 goal 0.17.1+0.17.5 (amandemen SOT 3.0.0) — field REQUEST BODY
// lama (snake_case) MUST TIDAK LAGI diterima/dibaca: kirim field lama harus
// diperlakukan sebagai field TAK DIKENAL (ditolak PATCH/lifecycle whitelist,
// ATAU diabaikan diam-diam di create tanpa whitelist — nilai jadi default).
// Field BARU (camelCase) harus berfungsi identik field lama sebelumnya.

const NOW = "2026-08-01T00:00:00.000Z";

let dir: string;
let globalClient: Client;
let projectIdValue: string;

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

const fakeIdentityResolver = { resolveIdentity: (req: Request) => identityFor(req.headers.get("x-test-user")) };

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "kanban-camelcase-body-"));
  globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  await globalClient.execute({
    sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES ('user-a', 'a@t.local', 1, 'a', ?, ?)",
    args: [NOW, NOW],
  });
  projectIdValue = `a-${newProjectId()}`;
  const projectDbPath = `file:${join(dir, `${projectIdValue}.db`)}`;
  const projectClient = createClient({ url: projectDbPath });
  await applyProjectMigrations(projectClient);
  await projectClient.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, 'P', ?, ?, 1)",
    args: [projectIdValue, NOW, NOW],
  });
  await projectClient.execute({
    sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, version) VALUES ('ms1', 'M', NULL, 0, ?, ?, 1)",
    args: [NOW, NOW],
  });
  await projectClient.execute({
    sql: "INSERT INTO boards (id, milestone_id, title, description, created_at, updated_at, version) VALUES ('bd1', 'ms1', 'B', NULL, ?, ?, 1)",
    args: [NOW, NOW],
  });
  await projectClient.execute({
    sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('ls1', 'bd1', 'L', ?, ?, 1)",
    args: [NOW, NOW],
  });
  await projectClient.execute({
    sql: "INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('ls2', 'bd1', 'L2', ?, ?, 1)",
    args: [NOW, NOW],
  });
  await projectClient.execute({
    sql: "INSERT INTO cards (id, list_id, creator_user_id, title, created_at, updated_at, version) VALUES ('cd1', 'ls1', 'user-a', 'C', ?, ?, 1)",
    args: [NOW, NOW],
  });
  await projectClient.close();
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: projectIdValue,
    databaseId: projectDbPath,
    ownerUserId: "user-a",
    now: NOW,
  });
});

afterAll(async () => {
  await globalClient.close();
});

const milestoneApp = (): Hono =>
  new Hono().route(
    "/",
    createMilestonesRouter(() =>
      buildMilestoneRoutesDeps({ identityResolver: fakeIdentityResolver, globalClient, turso: null }),
    ),
  );
const cardApp = (): Hono =>
  new Hono().route(
    "/",
    createCardsRouter(() => buildCardRoutesDeps({ identityResolver: fakeIdentityResolver, globalClient, turso: null })),
  );
const projectApp = (): Hono =>
  new Hono().route(
    "/",
    createProjectsRouter(() => buildProjectRoutesDeps({ identityResolver: fakeIdentityResolver, globalClient, turso: null })),
  );

const req = (app: Hono, path: string, method: string, body: unknown): Promise<Response> =>
  app.request(`http://localhost${path}`, {
    method,
    headers: { "x-test-user": "user-a", "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("[TASK-0.17] field request body lama (snake_case) TIDAK LAGI diterima (goal 0.17.1+0.17.5)", () => {
  it("[PATCH Milestone] field lama `start_date` -> VALIDATION_ERROR field tak dikenal (BUKAN diterima diam-diam)", async () => {
    const res = await req(milestoneApp(), `/v1/projects/${projectIdValue}/milestones/ms1`, "PATCH", {
      expectedVersion: 1,
      start_date: "2026-01-01",
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error?.code).toBe("VALIDATION_ERROR");
  });

  it("[PATCH Milestone] field baru `startDate` -> BERFUNGSI (200)", async () => {
    const res = await req(milestoneApp(), `/v1/projects/${projectIdValue}/milestones/ms1`, "PATCH", {
      expectedVersion: 1,
      startDate: "2026-01-01",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.milestone.startDate).toBe("2026-01-01");
  });

  it("[PATCH Milestone] field lama `expected_version` (bukan expectedVersion) -> VALIDATION_ERROR (dianggap tidak ada, bukan dibaca nilainya)", async () => {
    const res = await req(milestoneApp(), `/v1/projects/${projectIdValue}/milestones/ms1`, "PATCH", {
      expected_version: 2,
      title: "Coba",
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error?.code).toBe("VALIDATION_ERROR");
    expect(json.error?.message).toContain("expectedVersion");
  });

  it("[Move Card] field lama `destination_list_id` -> VALIDATION_ERROR field tak dikenal", async () => {
    const res = await req(cardApp(), `/v1/projects/${projectIdValue}/cards/cd1/move`, "POST", {
      expectedVersion: 1,
      destination_list_id: "ls2",
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error?.code).toBe("VALIDATION_ERROR");
  });

  it("[Move Card] field baru `destinationListId` -> BERFUNGSI (200)", async () => {
    const res = await req(cardApp(), `/v1/projects/${projectIdValue}/cards/cd1/move`, "POST", {
      expectedVersion: 1,
      destinationListId: "ls2",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.card.listId).toBe("ls2");
  });

  it("[PATCH Project — goal 0.17.5, gap cakupan] field lama `expected_version` -> VALIDATION_ERROR", async () => {
    const res = await req(projectApp(), `/v1/projects/${projectIdValue}`, "PATCH", {
      name: "Baru",
      expected_version: 1,
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error?.code).toBe("VALIDATION_ERROR");
  });

  it("[Project archive — goal 0.17.5] field baru `expectedVersion` -> BERFUNGSI (200)", async () => {
    const res = await req(projectApp(), `/v1/projects/${projectIdValue}/archive`, "POST", {
      expectedVersion: 1,
    });
    expect(res.status).toBe(200);
  });
});
