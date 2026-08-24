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
import type { EffectivePermissions } from "@kanban/domain";
import {
  hasPermission,
  loadEntityHierarchy,
  type RouteEntityType,
} from "@kanban/infrastructure";

export interface CreateProjectInput {
  projectId: string;
  projectName: string;
  creatorUserId: string;
}

export interface OpenProjectContext {
  userId: string;
  ownerUserId: string;
  database: Client;
  permission: EffectivePermissions;
  effectiveFor(hierarchy: {
    milestoneId?: string;
    boardId?: string;
    listId?: string;
    cardId?: string;
  }): Promise<EffectivePermissions>;
}

/**
 * Formula ALLOW A.10 — komponen "permission granted + scope matches".
 * Bila entity dialamati, hierarchy SAAT INI di-walk dan permission
 * di-resolve ulang (BR-042); entity tak dikenal → fallback Project-scope
 * sehingga non-berhak tetap 403 sebelum command menghasilkan 404.
 */
export async function authorize(
  ctx: OpenProjectContext,
  key: string,
  projectId: string,
  entity?: { type: RouteEntityType; id: string },
): Promise<void> {
  let effective = ctx.permission;
  if (entity) {
    const path = await loadEntityHierarchy(ctx.database, entity.type, entity.id);
    if (path) effective = await ctx.effectiveFor(path);
    else
      effective = await ctx.effectiveFor(
        entity.type === "milestone"
          ? { milestoneId: entity.id }
          : entity.type === "board"
            ? { boardId: entity.id }
            : entity.type === "list"
              ? { listId: entity.id }
              : { cardId: entity.id },
      );
  }
  void projectId;
  if (!hasPermission(effective, key)) {
    throw new PipelineError("PERMISSION_DENIED", `Permission '${key}' tidak dimiliki pada scope ini.`, 403);
  }
}

export interface ProjectRoutesDeps {
  resolveIdentity(request: Request): Promise<ResolvedIdentity | null>;
  newProjectId(): string;
  createProject(input: CreateProjectInput): Promise<void>;
  listProjects(userId: string, statusFilter?: readonly ProjectStatus[]): Promise<ProjectSummary[]>;
  openProjectContext(request: Request, projectId: string): Promise<OpenProjectContext>;
  /** C.3 (TASK-0.16) — opsional: tanpa ini, endpoint create/move/archive/restore/delete berjalan tanpa proteksi idempotency (backward-compatible untuk deps yang belum di-wire). */
  idempotencyStore?: IdempotencyStoreLike;
}

/** Shape minimal `IdempotencyStore` (`@kanban/contracts`) — lihat catatan boundary di `DbIdempotencyStore`. */
export interface IdempotencyStoreLike {
  get(key: string, scope: string): Promise<unknown | null>;
  put(key: string, scope: string, result: unknown): Promise<void>;
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

/**
 * Wrapper idempotency-aware (C.3, TASK-0.16) — SATU TITIK generik dipakai
 * SELURUH route create/move/archive/restore/delete (bukan copy-paste per
 * route, Review-CL-19's kelas masalah DRY yang sama seperti 11 `xPayload()`
 * terpisah). Tanpa header `Idempotency-Key` (opsional, C.3 "gunakan" bukan
 * "wajib") ATAU tanpa `idempotencyStore` di-wire → berjalan identik
 * `withErrorHandling` biasa, nol overhead.
 *
 * Scope WAJIB mencakup `userId` (bukan cuma method+path) — Idempotency-Key
 * di-generate CLIENT, jadi TANPA userId, User A bisa "menebak"/reuse key
 * User B untuk endpoint yang sama dan mendapat replay respons User B
 * (kebocoran lintas-user). `userId` di-resolve via `deps.resolveIdentity`
 * (operasi ringan — session/token lookup tunggal, BUKAN permission-
 * resolution berat seperti CL-30) — TERPISAH dari resolve identity yang
 * handler sendiri lakukan lagi di dalam (duplikasi kecil, diterima sebagai
 * trade-off: overhead HANYA terjadi saat klien genuinely mengirim header,
 * bukan di setiap request).
 */
export async function withIdempotentHandling<T>(
  c: Context,
  deps: { resolveIdentity(request: Request): Promise<{ userId: string } | null> },
  handler: () => Promise<T>,
  successStatus: ContentfulStatusCode = 200,
  idempotencyStore?: IdempotencyStoreLike,
): Promise<Response> {
  if (!idempotencyStore) return withErrorHandling(c, handler, successStatus);
  const key = extractIdempotencyKey(c.req.raw.headers);
  if (!key) return withErrorHandling(c, handler, successStatus);

  const identity = await deps.resolveIdentity(c.req.raw);
  if (!identity) return withErrorHandling(c, handler, successStatus);

  const scope = `${identity.userId}:${c.req.method}:${c.req.path}`;
  const cached = await idempotencyStore.get(key, scope);
  if (cached !== null && typeof cached === "object") {
    const { status, body } = cached as { status: number; body: unknown };
    return c.json(body as Record<string, unknown>, status as ContentfulStatusCode);
  }

  const response = await withErrorHandling(c, handler, successStatus);
  if (response.status >= 200 && response.status < 300) {
    const body = await response.clone().json();
    await idempotencyStore.put(key, scope, { status: response.status, body });
  }
  return response;
}

export function createProjectsRouter(getDeps: () => ProjectRoutesDeps): Hono {
  const router = new Hono();

  router.post("/v1/projects", async (c) => {
    const deps = getDeps();
    return withIdempotentHandling(c, deps, async () => {
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
    }, 201, deps.idempotencyStore);
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
    const deps = getDeps();
    return withIdempotentHandling(c, deps, () =>
      handleLifecycle(c, deps, c.req.param("project_id"), (repository, input) =>
        repository.archiveProject(input)), 200, deps.idempotencyStore);
  });

  router.post("/v1/projects/:project_id/restore", async (c) => {
    const deps = getDeps();
    return withIdempotentHandling(c, deps, () =>
      handleLifecycle(c, deps, c.req.param("project_id"), (repository, input) =>
        repository.restoreProject(input)), 200, deps.idempotencyStore);
  });

  router.post("/v1/projects/:project_id/delete", async (c) => {
    const deps = getDeps();
    return withIdempotentHandling(c, deps, () =>
      handleLifecycle(c, deps, c.req.param("project_id"), (repository, input) =>
        repository.deleteProject(input)), 200, deps.idempotencyStore);
  });

  return router;
}
