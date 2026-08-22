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
  type ProjectStatus,
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
  listProjects(userId: string, statusFilter?: readonly ProjectStatus[]): Promise<ProjectSummary[]>;
  openProjectContext(request: Request, projectId: string): Promise<OpenProjectContext>;
}

const MAX_PROJECT_NAME_LENGTH = 255;

const PROJECT_STATUS_VALUES: readonly ProjectStatus[] = ["ACTIVE", "ARCHIVED", "DELETED"];

function readStatusFilter(raw: string | undefined): ProjectStatus[] | undefined {
  if (raw === undefined || raw === "") return undefined;
  const values = raw.split(",");
  const parsed: ProjectStatus[] = [];
  for (const value of values) {
    if (!(PROJECT_STATUS_VALUES as readonly string[]).includes(value)) {
      throw new PipelineError(
        "VALIDATION_ERROR",
        `Nilai status '${value}' tidak dikenal; gunakan subset ACTIVE,ARCHIVED,DELETED.`,
        400,
      );
    }
    parsed.push(value as ProjectStatus);
  }
  return parsed;
}

export function toApiErrorResponse(error: unknown): { status: number; body: ErrorEnvelope } {
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

export function readJsonObject(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PipelineError("VALIDATION_ERROR", "Body request wajib objek JSON.", 400);
  }
  return body as Record<string, unknown>;
}

function readProjectNameField(body: unknown): string {
  const raw = readJsonObject(body).name;
  if (typeof raw !== "string") {
    throw new PipelineError("VALIDATION_ERROR", "Field name wajib string.", 400);
  }
  const name = raw.trim();
  if (name.length === 0) {
    throw new PipelineError("VALIDATION_ERROR", "Field name tidak boleh kosong.", 400);
  }
  if (name.length > MAX_PROJECT_NAME_LENGTH) {
    throw new PipelineError("VALIDATION_ERROR", `Field name maksimal ${MAX_PROJECT_NAME_LENGTH} karakter.`, 400);
  }
  return name;
}

export function readExpectedVersionField(body: unknown): number {
  const raw = readJsonObject(body).expected_version;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    throw new PipelineError("VALIDATION_ERROR", "Field expected_version wajib integer >= 1.", 400);
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
): Promise<{ project: ReturnType<typeof projectStatePayload> }> {
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
  return { project: projectStatePayload(state) };
}

async function withErrorHandling<T>(
  c: Context,
  handler: () => Promise<T>,
  successStatus: ContentfulStatusCode = 200,
): Promise<Response> {
  try {
    const result = await handler();
    return c.json(ok(result), successStatus);
  } catch (error) {
    const mapped = toApiErrorResponse(error);
    return c.json(mapped.body, mapped.status as ContentfulStatusCode);
  }
}

export function createProjectsRouter(getDeps: () => ProjectRoutesDeps): Hono {
  const router = new Hono().basePath("/api");

  router.post("/v1/projects", async (c) => {
    return withErrorHandling(c, async () => {
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
      return { id: projectId, name, status: "ACTIVE", version: 1 };
    }, 201);
  });

  router.get("/v1/projects", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      const items = await deps.listProjects(identity.userId, readStatusFilter(c.req.query("status")));
      return { projects: items };
    });
  });

  router.get("/v1/projects/:project_id", async (c) => {
    return withErrorHandling(c, async () => {
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
      return {
        project: projectStatePayload(state),
      };
    });
  });

  router.patch("/v1/projects/:project_id", async (c) => {
    return withErrorHandling(c, async () => {
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
      return { project: projectStatePayload(state) };
    });
  });

  router.post("/v1/projects/:project_id/archive", async (c) => {
    return withErrorHandling(c, () =>
      handleLifecycle(c, getDeps(), c.req.param("project_id"), (repository, input) =>
        repository.archiveProject(input)));
  });

  router.post("/v1/projects/:project_id/restore", async (c) => {
    return withErrorHandling(c, () =>
      handleLifecycle(c, getDeps(), c.req.param("project_id"), (repository, input) =>
        repository.restoreProject(input)));
  });

  router.post("/v1/projects/:project_id/delete", async (c) => {
    return withErrorHandling(c, () =>
      handleLifecycle(c, getDeps(), c.req.param("project_id"), (repository, input) =>
        repository.deleteProject(input)));
  });

  return router;
}
