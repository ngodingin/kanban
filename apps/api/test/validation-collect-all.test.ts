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
import {
  buildBoardRoutesDeps,
  buildCardRoutesDeps,
  buildListRoutesDeps,
  buildMilestoneRoutesDeps,
  buildProjectRoutesDeps,
} from "../src/project-deps.ts";
import { createBoardsRouter } from "../src/routes/boards.ts";
import { createCardsRouter } from "../src/routes/cards.ts";
import { createListsRouter } from "../src/routes/lists.ts";
import { createMilestonesRouter } from "../src/routes/milestones.ts";
import { createProjectsRouter } from "../src/routes/projects.ts";

// TASK-0.17.4 (02-SPEC C.2 amandemen 3.0.0) — VALIDATION_ERROR MUST
// mengumpulkan SELURUH field yang gagal validasi dalam satu response (bukan
// fail-fast berhenti di field pertama) via `details: [{field, reason}]`.
// Diterapkan ke parser Project/Milestone/Board/List/Card via ValidationCollector
// (apps/api/src/routes/projects.ts) yang reusable lintas kelima route ini.

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
  dir = await mkdtemp(join(tmpdir(), "kanban-validation-collect-all-"));
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

const projectApp = (): Hono =>
  new Hono().route(
    "/",
    createProjectsRouter(() => buildProjectRoutesDeps({ identityResolver: fakeIdentityResolver, globalClient, turso: null })),
  );
const milestoneApp = (): Hono =>
  new Hono().route(
    "/",
    createMilestonesRouter(() => buildMilestoneRoutesDeps({ identityResolver: fakeIdentityResolver, globalClient, turso: null })),
  );
const boardApp = (): Hono =>
  new Hono().route(
    "/",
    createBoardsRouter(() => buildBoardRoutesDeps({ identityResolver: fakeIdentityResolver, globalClient, turso: null })),
  );
const listApp = (): Hono =>
  new Hono().route(
    "/",
    createListsRouter(() => buildListRoutesDeps({ identityResolver: fakeIdentityResolver, globalClient, turso: null })),
  );
const cardApp = (): Hono =>
  new Hono().route(
    "/",
    createCardsRouter(() => buildCardRoutesDeps({ identityResolver: fakeIdentityResolver, globalClient, turso: null })),
  );

const req = (app: Hono, path: string, method: string, body: unknown): Promise<Response> =>
  app.request(`http://localhost${path}`, {
    method,
    headers: { "x-test-user": "user-a", "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("[TASK-0.17.4] VALIDATION_ERROR collect-all (02-SPEC C.2 amandemen 3.0.0)", () => {
  it("[PATCH Project] name kosong + expectedVersion bukan integer -> KEDUA field muncul sekaligus di details", async () => {
    const res = await req(projectApp(), `/v1/projects/${projectIdValue}`, "PATCH", {
      name: "",
      expectedVersion: "bukan-angka",
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error?.code).toBe("VALIDATION_ERROR");
    const fields = (json.error?.details ?? []).map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(["expectedVersion", "name"]);
  });

  it("[CREATE Milestone] title kosong + progress di luar 0-100 -> KEDUA field muncul sekaligus", async () => {
    const res = await req(milestoneApp(), `/v1/projects/${projectIdValue}/milestones`, "POST", {
      title: "",
      progress: 999,
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    const fields = (json.error?.details ?? []).map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(["progress", "title"]);
  });

  it("[PATCH Milestone] title kosong + startDate bukan string -> KEDUA field muncul sekaligus", async () => {
    const res = await req(milestoneApp(), `/v1/projects/${projectIdValue}/milestones/ms1`, "PATCH", {
      title: "  ",
      startDate: 123,
      expectedVersion: 1,
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    const fields = (json.error?.details ?? []).map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(["startDate", "title"]);
  });

  it("[CREATE Board] title kosong + description bukan string -> KEDUA field muncul sekaligus", async () => {
    const res = await req(boardApp(), `/v1/projects/${projectIdValue}/milestones/ms1/boards`, "POST", {
      title: "",
      description: 42,
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    const fields = (json.error?.details ?? []).map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(["description", "title"]);
  });

  it("[PATCH List] title kosong + expectedVersion negatif -> KEDUA field muncul sekaligus", async () => {
    const res = await req(listApp(), `/v1/projects/${projectIdValue}/lists/ls1`, "PATCH", {
      title: "",
      expectedVersion: -1,
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    const fields = (json.error?.details ?? []).map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(["expectedVersion", "title"]);
  });

  it("[CREATE Card] title kosong + dueDate bukan string -> KEDUA field muncul sekaligus", async () => {
    const res = await req(cardApp(), `/v1/projects/${projectIdValue}/lists/ls1/cards`, "POST", {
      title: "",
      dueDate: 7,
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    const fields = (json.error?.details ?? []).map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(["dueDate", "title"]);
  });

  it("[PATCH Card] subtitle bukan string + assignee kosong-string -> KEDUA field muncul sekaligus", async () => {
    const res = await req(cardApp(), `/v1/projects/${projectIdValue}/cards/cd1`, "PATCH", {
      subtitle: 5,
      assignee: "",
      expectedVersion: 1,
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    const fields = (json.error?.details ?? []).map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(["assignee", "subtitle"]);
  });

  it("[Move Card] destinationListId kosong + expectedVersion bukan integer -> KEDUA field muncul sekaligus", async () => {
    const res = await req(cardApp(), `/v1/projects/${projectIdValue}/cards/cd1/move`, "POST", {
      destinationListId: "",
      expectedVersion: "x",
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    const fields = (json.error?.details ?? []).map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(["destinationListId", "expectedVersion"]);
  });

  it("[single-field] satu field invalid -> details tetap array berisi SATU entry (bukan cuma multi-field)", async () => {
    const res = await req(listApp(), `/v1/projects/${projectIdValue}/lists/ls1`, "PATCH", {
      expectedVersion: -1,
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error?.details).toEqual([{ field: "expectedVersion", reason: expect.any(String) }]);
  });
});
