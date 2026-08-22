import { Hono } from "hono";
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

function readCreateProjectName(body: unknown): string {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PipelineError("INVALID_STATE", "Body request wajib objek JSON dengan field name.", 409);
  }
  const raw = (body as { name?: unknown }).name;
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
      const name = readCreateProjectName(await c.req.json().catch(() => null));
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
        project: {
          id: state.projectId,
          name: state.name,
          createdAt: state.createdAt,
          updatedAt: state.updatedAt,
          archivedAt: state.archivedAt,
          deletedAt: state.deletedAt,
          version: state.version,
        },
      }));
    } catch (error) {
      const mapped = toApiErrorResponse(error);
      return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    }
  });

  return router;
}
