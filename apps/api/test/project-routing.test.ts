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
  PipelineError,
  registerProjectWithOwnerMembership,
  type ResolvedIdentity,
} from "@kanban/infrastructure";
import { buildProjectRoutesDeps } from "../src/project-deps.ts";
import { createProjectsRouter, type ProjectRoutesDeps } from "../src/routes/projects.ts";

// Regression QA-CL-04..09 (invariant inti #4 / BR-007 / A.4): wiring produksi
// yang dulu memakai `{ create: () => createDevProjectClientFromEnv() }`
// mengabaikan `databaseId` sehingga semua operasi menyentuh satu DB statis.
// Test ini melewati `buildProjectRoutesDeps` — fungsi perakitan deps produksi
// yang sama dipakai index.ts — dengan >=2 Project DB berbeda (file:, jalur
// passthrough eksplisit dari pola migrate-projects.ts) untuk membuktikan
// routing per-databaseId dan tidak ada cross-project leakage.

interface TestCtx {
  globalClient: Client;
  deps: ProjectRoutesDeps;
  dir: string;
  idA: string;
  idB: string;
  dbPathA: string;
  dbPathB: string;
}

let ctx: TestCtx;

function fakeIdentity(request: Request): Promise<ResolvedIdentity | null> {
  const userId = request.headers.get("x-test-user");
  if (userId === null) return Promise.resolve(null);
  return Promise.resolve({
    type: "session",
    userId,
    email: `${userId}@test.local`,
    name: userId,
    emailVerified: true,
    image: null,
  });
}

function requestAs(userId: string | null, path = "/x"): Request {
  return new Request(`http://localhost${path}`, {
    headers: userId === null ? {} : { "x-test-user": userId },
  });
}

async function projectNameInFile(dbPath: string, projectId: string): Promise<string> {
  const client = createClient({ url: dbPath });
  try {
    const result = await client.execute({
      sql: "SELECT name FROM project_state WHERE project_id = ?",
      args: [projectId],
    });
    return String(result.rows[0]!.name);
  } finally {
    await client.close();
  }
}

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-routing-"));
  const globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  const now = new Date().toISOString();
  for (const user of ["user-a", "user-b"]) {
    await globalClient.execute({
      sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
      args: [user, `${user}@test.local`, user, now, now],
    });
  }

  const provision = async (projectId: string, projectName: string, ownerUserId: string): Promise<string> => {
    const dbPath = `file:${join(dir, `${projectId}.db`)}`;
    const projectClient = createClient({ url: dbPath });
    await applyProjectMigrations(projectClient);
    await projectClient.execute({
      sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, ?, ?, ?, 1)",
      args: [projectId, projectName, now, now],
    });
    await projectClient.close();
    await registerProjectWithOwnerMembership(globalClient, {
      projectId,
      databaseId: dbPath,
      ownerUserId,
      now,
    });
    return dbPath;
  };

  const idA = `rt-a-${newProjectId()}`;
  const idB = `rt-b-${newProjectId()}`;
  const dbPathA = await provision(idA, "Alpha Routing", "user-a");
  const dbPathB = await provision(idB, "Beta Routing", "user-b");

  // Membership aktif lintas-ownership agar list benar-benar membaca DUA DB
  // berbeda untuk satu user (pembuktian pairing, bukan sekadar boundary).
  await globalClient.execute({
    sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES (?, ?, 'user-b', ?, NULL)",
    args: [`m-cross-${idA}`, idA, now],
  });

  ctx = {
    globalClient,
    dir,
    idA,
    idB,
    dbPathA,
    dbPathB,
    deps: buildProjectRoutesDeps({
      identityResolver: { resolveIdentity: fakeIdentity },
      globalClient,
      turso: null,
    }),
  };
});

afterAll(async () => {
  await ctx.globalClient.close();
  await rm(ctx.dir, { recursive: true, force: true });
});

describe("routing Project DB lewat wiring produksi (regression QA-CL-04..09)", () => {
  it("[INV-04][BR-007][A.4] listProjects memetakan tiap project ke DB-nya sendiri — nama per id tidak tertukar", async () => {
    // user-b: Owner idB + member aktif idA → satu list membaca DUA DB berbeda.
    const summaries = await ctx.deps.listProjects("user-b");
    if (summaries.length !== 2) throw new Error(`jumlah salah: ${JSON.stringify(summaries)}`);
    const byId = Object.fromEntries(summaries.map((s) => [s.id, s.name]));
    if (byId[ctx.idA] !== "Alpha Routing") throw new Error(`pairing A salah: ${JSON.stringify(byId)}`);
    if (byId[ctx.idB] !== "Beta Routing") throw new Error(`pairing B salah: ${JSON.stringify(byId)}`);
    const forA = await ctx.deps.listProjects("user-a");
    if (forA.length !== 1 || forA[0]!.name !== "Alpha Routing") {
      throw new Error(`list user-a salah: ${JSON.stringify(forA)}`);
    }
  });

  it("[INV-04][A.4] openProjectContext menulis ke DB Project yang diminta saja — mutasi A tidak menyentuh B", async () => {
    const resolvedCtx = await ctx.deps.openProjectContext(requestAs("user-a"), ctx.idA);
    const repository = new DrizzleProjectRepository(resolvedCtx.database);
    await repository.updateProjectName({
      projectId: ctx.idA,
      expectedVersion: 1,
      actorUserId: "user-a",
      name: "Alpha Renamed",
    });
    if ((await projectNameInFile(ctx.dbPathA, ctx.idA)) !== "Alpha Renamed") {
      throw new Error("mutasi via context A tidak tercatat di DB milik A");
    }
    if ((await projectNameInFile(ctx.dbPathB, ctx.idB)) !== "Beta Routing") {
      throw new Error("mutasi pada A bocor ke DB milik B (cross-project leakage)");
    }
  });

  it("[INV-04][A.4] konteks Project berbeda menghasilkan koneksi berbeda yang tetap benar tujuannya", async () => {
    const resolvedCtx = await ctx.deps.openProjectContext(requestAs("user-b"), ctx.idB);
    const repository = new DrizzleProjectRepository(resolvedCtx.database);
    await repository.updateProjectName({
      projectId: ctx.idB,
      expectedVersion: 1,
      actorUserId: "user-b",
      name: "Beta Renamed",
    });
    if ((await projectNameInFile(ctx.dbPathB, ctx.idB)) !== "Beta Renamed") {
      throw new Error("mutasi via context B tidak tercatat di DB milik B");
    }
    if ((await projectNameInFile(ctx.dbPathA, ctx.idA)) !== "Alpha Renamed") {
      throw new Error("state A berubah saat bekerja di B");
    }
  });

  it("[A.4] negatif: projectId tak dikenal ditolak RESOURCE_NOT_FOUND 404 oleh pipeline produksi", async () => {
    let caught: unknown = null;
    try {
      await ctx.deps.openProjectContext(requestAs("user-a"), "rt-tidak-ada");
    } catch (error) {
      caught = error;
    }
    if (!(caught instanceof PipelineError)) throw new Error(`harusnya PipelineError: ${String(caught)}`);
    if (caught.code !== "RESOURCE_NOT_FOUND" || caught.httpStatus !== 404) {
      throw new Error(`kode/status salah: ${caught.code}/${caught.httpStatus}`);
    }
  });

  it("[BR-007][C.4] endpoint GET detail lewat router+wiring produksi membaca DB yang benar", async () => {
    const app = new Hono().route("/", createProjectsRouter(() => ctx.deps));
    const resA = await app.request(`http://localhost/api/v1/projects/${ctx.idA}`, {
      headers: { "x-test-user": "user-a" },
    });
    if (resA.status !== 200) throw new Error(`status A ${resA.status}: ${await resA.text()}`);
    const jsonA = await resA.json();
    if (jsonA.data.project.name !== "Alpha Renamed") throw new Error(`nama A salah: ${JSON.stringify(jsonA)}`);
    const resB = await app.request(`http://localhost/api/v1/projects/${ctx.idB}`, {
      headers: { "x-test-user": "user-b" },
    });
    const jsonB = await resB.json();
    if (jsonB.data.project.name !== "Beta Renamed") throw new Error(`nama B salah: ${JSON.stringify(jsonB)}`);
  });

  it("[QA-CL-06][Rule-3] authorization dievaluasi sebelum validasi body: non-owner body invalid tetap 403", async () => {
    const app = new Hono().route("/", createProjectsRouter(() => ctx.deps));
    // user-b punya membership aktif di idA tapi BUKAN Owner (Owner = user-a);
    // body sengaja invalid — hasilnya harus 403 PERMISSION_DENIED, bukan 409.
    const res = await app.request(`http://localhost/api/v1/projects/${ctx.idA}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-test-user": "user-b" },
      body: JSON.stringify({ name: "" }),
    });
    if (res.status !== 403) throw new Error(`harusnya 403, dapat ${res.status}: ${await res.text()}`);
    const json = await res.json();
    if (json.error.code !== "PERMISSION_DENIED") throw new Error(`kode salah: ${JSON.stringify(json)}`);
  });

  it("[C.4] negatif: request tanpa identitas ditolak sebelum operasi apa pun", async () => {
    const app = new Hono().route("/", createProjectsRouter(() => ctx.deps));
    const res = await app.request("http://localhost/api/v1/projects");
    if (res.status !== 401) throw new Error(`harusnya 401, dapat ${res.status}: ${await res.text()}`);
  });
});
