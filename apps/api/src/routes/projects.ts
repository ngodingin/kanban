import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  apiError,
  extractIdempotencyKey,
  ok,
  toErrorResponse,
  type ErrorEnvelope,
} from "@kanban/contracts";
import {
  DrizzleProjectRepository,
  PipelineError,
  ResolveIdentityStep,
  type ProjectStateRecord,
  type ProjectSummary,
  type ResolvedIdentity,
} from "@kanban/infrastructure";
import type { Client } from "@libsql/client";

export interface CreateProjectInput {
  projectId: string;
  projectName: string;
  creatorUserId: string;
}

export interface OpenProjectContext {
  userId: string;
  ownerUserId: string;
  database: Client;
}

export interface ProjectRoutesDeps {
  resolveIdentity(request: Request): Promise<ResolvedIdentity | null>;
  newProjectId(): string;
  createProject(input: CreateProjectInput): Promise<void>;
  listProjects(userId: string): Promise<ProjectSummary[]>;
  openProjectContext(request: Request, projectId: string): Promise<OpenProjectContext>;
}

const MAX_PROJECT_NAME_LENGTH = 255;

function toApiErrorResponse(error: unknown): { status: number; body: ErrorEnvelope } {
  if (error instanceof PipelineError) {
    return toErrorResponse({ code: error.code, message: error.message, httpStatus: error.httpStatus });
  }
  if (error instanceof Error && typeof (error as { code?: unknown }).code === "string") {
    return toErrorResponse({ code: (error as { code?: unknown }).code as string, message: error.message });
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error("[api] unhandled error:", message);
  return { status: 500, body: apiError("INVALID_STATE", message) };
}

function readJsonObject(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PipelineError("INVALID_STATE", "Body request wajib objek JSON.", 409);
  }
  return body as Record<string, unknown>;
}

function readProjectNameField(body: unknown): string {
  const raw = readJsonObject(body).name;
  if (typeof raw !== "string") {
    throw new PipelineError("INVALID_STATE", "Field name wajib string.", 409);
  }
  const name = raw.trim();
  if (name.length === 0) {
    throw new PipelineError("INVALID_STATE", "Field name tidak boleh kosong.", 409);
  }
  if (name.length > MAX_PROJECT_NAME_LENGTH) {
    throw new PipelineError("INVALID_STATE", `Field name maksimal ${MAX_PROJECT_NAME_LENGTH} karakter.`, 409);
  }
  return name;
}

function readExpectedVersionField(body: unknown): number {
  const raw = readJsonObject(body).expected_version;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    throw new PipelineError("INVALID_STATE", "Field expected_version wajib integer >= 1.", 409);
  }
  return raw;
}

function projectStatePayload(state: ProjectStateRecord) {
  return {
    id: state.projectId,
    name: state.name,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    archivedAt: state.archivedAt,
    deletedAt: state.deletedAt,
    version: state.version,
  };
}

type LifecycleCommand = (
  repository: DrizzleProjectRepository,
  input: { projectId: string; expectedVersion: number; actorUserId: string },
) => Promise<ProjectStateRecord>;

async function handleLifecycle(
  c: Context,
  deps: ProjectRoutesDeps,
  projectId: string,
  command: LifecycleCommand,
): Promise<Response> {
  // Authorization first (Implementation Rule 3), lihat QA-CL-06.
  const ctx = await deps.openProjectContext(c.req.raw, projectId);
  if (ctx.ownerUserId !== ctx.userId) {
    throw new PipelineError(
      "PERMISSION_DENIED",
      "Hanya Owner Project yang dapat melakukan operasi ini (interim Phase 1).",
      403,
    );
  }
  const expectedVersion = readExpectedVersionField(await c.req.json().catch(() => null));
  const repository = new DrizzleProjectRepository(ctx.database);
  const state = await command(repository, {
    projectId,
    expectedVersion,
    actorUserId: ctx.userId,
  });
  return c.json(ok({ project: projectStatePayload(state) }));
}

export function createProjectsRouter(getDeps: () => ProjectRoutesDeps): Hono {
  const router = new Hono().basePath("/api");

  router.post("/v1/projects", async (c) => {
    try {
      const deps = getDeps();
      const idempotencyKey = extractIdempotencyKey(c.req.raw.headers);
      void idempotencyKey;
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      const name = readProjectNameField(await c.req.json().catch(() => null));
      const projectId = deps.newProjectId();
      await deps.createProject({
        projectId,
        projectName: name,
        creatorUserId: identity.userId,
      });
      return c.json(ok({ id: projectId, name, status: "ACTIVE", version: 1 }), 201);
    } catch (error) {
      const mapped = toApiErrorResponse(error);
      return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    }
  });

  router.get("/v1/projects", async (c) => {
    try {
      const deps = getDeps();
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      const items = await deps.listProjects(identity.userId);
      return c.json(ok({ projects: items }));
    } catch (error) {
      const mapped = toApiErrorResponse(error);
      return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    }
  });

  router.get("/v1/projects/:project_id", async (c) => {
    try {
      const deps = getDeps();
      const ctx = await deps.openProjectContext(c.req.raw, c.req.param("project_id"));
      const repository = new DrizzleProjectRepository(ctx.database);
      const state = await repository.getProjectState(c.req.param("project_id"));
      if (!state) {
        throw new PipelineError(
          "RESOURCE_NOT_FOUND",
          `project_state ${c.req.param("project_id")} tidak ditemukan.`,
          404,
        );
      }
      return c.json(ok({
        project: projectStatePayload(state),
      }));
    } catch (error) {
      const mapped = toApiErrorResponse(error);
      return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    }
  });

  router.patch("/v1/projects/:project_id", async (c) => {
    try {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      // Authorization first (Implementation Rule 3), lihat QA-CL-06.
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      if (ctx.ownerUserId !== ctx.userId) {
        throw new PipelineError(
          "PERMISSION_DENIED",
          "Hanya Owner Project yang dapat mengubah nama (interim Phase 1).",
          403,
        );
      }
      const body = await c.req.json().catch(() => null);
      const name = readProjectNameField(body);
      const expectedVersion = readExpectedVersionField(body);
      const repository = new DrizzleProjectRepository(ctx.database);
      const state = await repository.updateProjectName({
        projectId,
        expectedVersion,
        actorUserId: ctx.userId,
        name,
      });
      return c.json(ok({ project: projectStatePayload(state) }));
    } catch (error) {
      const mapped = toApiErrorResponse(error);
      return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    }
  });

  router.post("/v1/projects/:project_id/archive", async (c) => {
    try {
      return await handleLifecycle(c, getDeps(), c.req.param("project_id"), (repository, input) =>
        repository.archiveProject(input));
    } catch (error) {
      const mapped = toApiErrorResponse(error);
      return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    }
  });

  router.post("/v1/projects/:project_id/restore", async (c) => {
    try {
      return await handleLifecycle(c, getDeps(), c.req.param("project_id"), (repository, input) =>
        repository.restoreProject(input));
    } catch (error) {
      const mapped = toApiErrorResponse(error);
      return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    }
  });

  router.post("/v1/projects/:project_id/delete", async (c) => {
    try {
      return await handleLifecycle(c, getDeps(), c.req.param("project_id"), (repository, input) =>
        repository.deleteProject(input));
    } catch (error) {
      const mapped = toApiErrorResponse(error);
      return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    }
  });

  return router;
}
