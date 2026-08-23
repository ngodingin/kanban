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
  listProjectSummaries,
  newProjectId,
  registerProjectWithOwnerMembership,
  SqliteProjectDatabaseResolver,
} from "@kanban/infrastructure";
import { createProjectsRouter, type ProjectRoutesDeps } from "../src/routes/projects.ts";

interface TestCtx {
  globalClient: Client;
  deps: ProjectRoutesDeps;
  dir: string;
}

let ctx: TestCtx;

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "kanban-api-list-"));
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

  await provision(`a1-${newProjectId()}`, "Proj A1", "user-a");
  const idA2 = `a2-${newProjectId()}`;
  const dbA2 = await provision(idA2, "Proj A2", "user-a");
  const idB1 = `b1-${newProjectId()}`;
  await provision(idB1, "Proj B1", "user-b");

  const repoA2 = new DrizzleProjectRepository(createClient({ url: dbA2 }));
  await repoA2.archiveProject({ projectId: idA2, expectedVersion: 1, actorUserId: "user-a" });

  await globalClient.execute({
    sql: "INSERT INTO project_memberships (id, project_id, user_id, created_at, revoked_at) VALUES (?, ?, 'user-a', ?, ?)",
    args: [`m-revoked-${idB1}`, idB1, now, now],
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
        };
      },
      newProjectId,
      createProject: async () => {
        throw new Error("tidak dipakai di test list");
      },
      listProjects: (userId, statusFilter) =>
        listProjectSummaries(globalClient, new SqliteProjectDatabaseResolver(globalClient), {
          create: (databaseId) => createClient({ url: databaseId }),
        }, userId, statusFilter),
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

describe("GET /api/v1/projects — list Project bermembership aktif (goal 1.3.2)", () => {
  it("[C.4][A.4] list berisi Project dengan membership aktif + status ringkas benar (ACTIVE dan ARCHIVED), tanpa transaksi lintas-DB", async () => {
    const res = await makeApp().request("http://localhost/v1/projects", {
      headers: { "x-test-user": "user-a" },
    });
    if (res.status !== 200) throw new Error(`status ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const projects = json.data.projects as Array<{ id: string; name: string; status: string }>;
    if (!Array.isArray(projects) || projects.length !== 2) {
      throw new Error(`jumlah project salah: ${JSON.stringify(projects)}`);
    }
    const byStatus = Object.fromEntries(projects.map((p) => [p.name, p.status]));
    if (byStatus["Proj A1"] !== "ACTIVE") throw new Error(`Proj A1 harusnya ACTIVE: ${JSON.stringify(byStatus)}`);
    if (byStatus["Proj A2"] !== "ARCHIVED") throw new Error(`Proj A2 harusnya ARCHIVED (baca state terkini dari Project DB): ${JSON.stringify(byStatus)}`);
    for (const p of projects) {
      if (typeof p.id !== "string" || p.id.length !== 29) throw new Error(`id tidak sesuai: ${p.id}`);
    }
  });

  it("[INV-04][C.4] boundary: Project milik User lain tidak muncul, dan membership revoked tidak menghasilkan entri", async () => {
    const res = await makeApp().request("http://localhost/v1/projects", {
      headers: { "x-test-user": "user-a" },
    });
    const json = await res.json();
    const ids = (json.data.projects as Array<{ id: string }>).map((p) => p.id);
    if (ids.some((id) => id.startsWith("b1-"))) {
      throw new Error("project milik user-b bocor ke list user-a");
    }
    const resB = await makeApp().request("http://localhost/v1/projects", {
      headers: { "x-test-user": "user-b" },
    });
    const jsonB = await resB.json();
    const projectsB = jsonB.data.projects as Array<{ id: string; name: string }>;
    if (projectsB.length !== 1 || projectsB[0]!.name !== "Proj B1") {
      throw new Error(`list user-b salah: ${JSON.stringify(projectsB)} (membership revoked user-a tidak relevan untuk user-b)`);
    }

    const revokedProbe = await ctx.globalClient.execute({
      sql: "SELECT COUNT(*) AS n FROM project_memberships WHERE user_id = 'user-a' AND project_id LIKE 'b1-%' AND revoked_at IS NOT NULL",
    });
    if (Number(revokedProbe.rows[0]!.n) !== 1) throw new Error("fixture membership revoked hilang");

    const summariesA = await ctx.deps.listProjects("user-a");
    if (summariesA.some((s) => s.id.startsWith("b1-"))) {
      throw new Error("membership revoked masih masuk list (harusnya di-exclude)");
    }
  });

  it("[C.2][C.4] GET tanpa identitas ditolak TOKEN_EXPIRED 401", async () => {
    const res = await makeApp().request("http://localhost/v1/projects");
    if (res.status !== 401) throw new Error(`status ${res.status}`);
    const json = await res.json();
    if (json.error?.code !== "TOKEN_EXPIRED") throw new Error(`code ${json.error?.code}`);
  });
});

describe("GET /api/v1/projects?status= — filter subset status (goal 1.3.5)", () => {
  it("[C.4] positif: ?status=ACTIVE hanya mengembalikan project ACTIVE", async () => {
    const res = await makeApp().request("http://localhost/v1/projects?status=ACTIVE", {
      headers: { "x-test-user": "user-a" },
    });
    if (res.status !== 200) throw new Error(`status ${res.status}: ${await res.text()}`);
    const projects = (await res.json()).data.projects as Array<{ name: string; status: string }>;
    if (projects.length !== 1 || projects[0]!.name !== "Proj A1" || projects[0]!.status !== "ACTIVE") {
      throw new Error(`hasil filter ACTIVE salah: ${JSON.stringify(projects)}`);
    }
  });

  it("[C.4] positif: ?status=ARCHIVED / DELETED / kombinasi comma-separated", async () => {
    const archived = (await (await makeApp().request("http://localhost/v1/projects?status=ARCHIVED", {
      headers: { "x-test-user": "user-a" },
    })).json()).data.projects as Array<{ name: string }>;
    if (archived.length !== 1 || archived[0]!.name !== "Proj A2") {
      throw new Error(`hasil filter ARCHIVED salah: ${JSON.stringify(archived)}`);
    }

    const deleted = (await (await makeApp().request("http://localhost/v1/projects?status=DELETED", {
      headers: { "x-test-user": "user-a" },
    })).json()).data.projects as Array<{ name: string }>;
    if (deleted.length !== 0) throw new Error(`hasil filter DELETED harusnya kosong: ${JSON.stringify(deleted)}`);

    const both = (await (await makeApp().request("http://localhost/v1/projects?status=ACTIVE,ARCHIVED", {
      headers: { "x-test-user": "user-a" },
    })).json()).data.projects as Array<{ name: string }>;
    if (both.length !== 2) throw new Error(`hasil filter gabungan salah: ${JSON.stringify(both)}`);
  });

  it("[C.12] negatif: nilai status tidak dikenal → VALIDATION_ERROR 400", async () => {
    for (const query of ["?status=bogus", "?status=ACTIVE,archived"]) {
      const res = await makeApp().request(`http://localhost/v1/projects${query}`, {
        headers: { "x-test-user": "user-a" },
      });
      if (res.status !== 400) throw new Error(`${query}: status ${res.status}, harusnya 400`);
      const json = await res.json();
      if (json.error?.code !== "VALIDATION_ERROR") throw new Error(`${query}: code ${json.error?.code}`);
    }
  });

  it("[C.4] tanpa param tetap mengembalikan semua status (default tidak berubah)", async () => {
    const res = await makeApp().request("http://localhost/v1/projects", {
      headers: { "x-test-user": "user-a" },
    });
    const projects = (await res.json()).data.projects as Array<{ name: string }>;
    if (projects.length !== 2) throw new Error(`default berubah: ${JSON.stringify(projects)}`);
  });
});
