import { mkdtempSync, rmSync } from "node:fs";
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

const BASE = "2026-01-01T00:00:00.000Z";

let dir: string;
let globalClient: Client;
let deps: MilestoneRoutesDeps;
let pid: string;
let logLines: Array<Record<string, unknown>>;

const identityFor = (userId: string | null): Promise<ResolvedIdentity | null> =>
  userId === null
    ? Promise.resolve(null)
    : Promise.resolve({ type: "session", userId, email: `${userId}@t.local`, name: userId, emailVerified: true, image: null });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kanban-reqlog-"));
  globalClient = createClient({ url: `file:${join(dir, "global.db")}` });
  await applyGlobalMigrations(globalClient);
  await globalClient.execute({
    sql: "INSERT INTO users (id, email, email_verified, name, created_at, updated_at) VALUES ('u1', 'u1@t.local', 1, 'u1', ?, ?)",
    args: [BASE, BASE],
  });
  pid = `a-${newProjectId()}`;
  const dbPath = `file:${join(dir, `${pid}.db`)}`;
  const pdb = createClient({ url: dbPath });
  const mod = await import("@kanban/infrastructure");
  await mod.applyProjectMigrations(pdb);
  await pdb.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES (?, 'P', ?, ?, 1)",
    args: [pid, BASE, BASE],
  });
  await pdb.close();
  await registerProjectWithOwnerMembership(globalClient, {
    projectId: pid, databaseId: dbPath, ownerUserId: "u1", now: BASE,
  });

  // Tangkap emitRequestLog via intercept process.stdout.write
  logLines = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    const text = typeof chunk === "string" ? chunk : String(chunk);
    if (text.startsWith("{") && text.includes("request_id")) {
      try { logLines.push(JSON.parse(text)); return true; } catch { /* bukan JSON */ }
    }
    return origWrite(chunk as never);
  }) as typeof process.stdout.write;

  deps = buildDeps();
  function buildDeps(): MilestoneRoutesDeps {
    return {
      resolveIdentity: (request) => identityFor(request.headers.get("x-test-user")),
      newMilestoneId: newProjectId,
      openProjectContext: async (request, projectId) => {
        const pipeline = new RequestPipeline({
          identityResolver: { resolveIdentity: (req) => identityFor(req.headers.get("x-test-user")) },
          globalClient,
          databaseResolver: new SqliteProjectDatabaseResolver(globalClient),
          projectClientFactory: { create: (databaseId) => createClient({ url: databaseId }) },
        });
        const resolved = await pipeline.run(request, projectId as string);
        return {
          userId: resolved.identity.userId,
          ownerUserId: resolved.project.ownerUserId,
          database: resolved.database,
          permission: resolved.permission,
          effectiveFor: createEntityPermissionResolver({
            globalClient,
            membershipId: resolved.membership.id,
            projectId: projectId as string,
            isOwner: resolved.project.ownerUserId === resolved.identity.userId,
          }),
        };
      },
    } as unknown as MilestoneRoutesDeps;
  }
});

afterAll(async () => {
  process.stdout.write = process.stdout.write; // no-op restore (vitest mengelola)
  await globalClient.close();
  rmSync(dir, { recursive: true, force: true });
});


// Helper: bungkus router dengan middleware logging yang sama seperti produksi.
async function loggedApp(): Promise<Hono> {
  const { requestLogger } = await import("../src/request-logging.ts");
  const app = new Hono();
  app.use("*", requestLogger());
  app.route("/", createMilestonesRouter(() => deps));
  return app;
}

describe("Structured request logging F.4 — goal 6.6.1", () => {
  it("[F.4] satu baris JSON per request: request_id/user_id/project_id/action/outcome/duration", async () => {
    const app = await loggedApp();
    const res = await app.request(`http://localhost/v1/projects/${pid}/milestones`, {
      method: "POST",
      headers: { "x-test-user": "u1", "content-type": "application/json" },
      body: JSON.stringify({ title: "M1" }),
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("X-Request-Id")).toBeTruthy();

    const direct = await import("@kanban/infrastructure");
    const rel = await import("../../../packages/infrastructure/src/observability/request-context.ts");
    console.error("IDENT", direct.setRequestLogFields === rel.setRequestLogFields);
    console.error("LINES", JSON.stringify(logLines));
    const line = logLines.at(-1)!;
    expect(line.request_id).toBeTruthy();
    expect(line.user_id).toBe("u1");       // diisi pipeline via ALS
    expect(line.project_id).toBe(pid);     // dari path /projects/:id/
    expect(line.action).toBe("POST /v1/projects/" + pid + "/milestones");
    expect(line.outcome).toBe("201");
    expect(typeof line.duration_ms).toBe("number");
  });

  it("[F.4] error path → outcome berisi kode kanonik; tanpa user_id saat anonim", async () => {
    const before = logLines.length;
    const app = await loggedApp();
    const res = await app.request(`http://localhost/v1/projects/${pid}/milestones/ms_none`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 1, title: "X" }),
    });
    expect([401, 403]).toContain(res.status);

    const line = logLines[before]!;
    expect(String(line.outcome).split(" ")[0]).toBe(String(res.status));
    expect(line.user_id).toBeUndefined(); // anonim — field opsional
  });
});
