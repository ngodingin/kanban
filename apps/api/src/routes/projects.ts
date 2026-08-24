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
import { parseBody, projectPatchSchema } from "./core-schemas.ts";

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

/** Shape minimal `DbIdempotencyStore` state-machine (`@kanban/infrastructure`, TASK-0.21) — structural typing, lihat catatan boundary di `DbIdempotencyStore`. */
export interface IdempotencyStoreLike {
  claim(key: string, scope: string, fingerprint: string): Promise<IdempotencyClaimResultLike>;
  complete(key: string, scope: string, claimToken: string, response: { status: number; body: unknown }): Promise<boolean>;
  release(key: string, scope: string, claimToken: string): Promise<void>;
}

export type IdempotencyClaimResultLike =
  | { status: "claimed"; claimToken: string }
  | { status: "replay"; response: { status: number; body: unknown } }
  | { status: "conflict" }
  | { status: "in_progress" };

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
    return toErrorResponse({ code: error.code, message: error.message, httpStatus: error.httpStatus, details: error.details });
  }
  if (error instanceof Error && typeof (error as { code?: unknown }).code === "string") {
    return toErrorResponse({ code: (error as { code?: unknown }).code as string, message: error.message });
  }
  const message = error instanceof Error ? error.message : String(error);
  // C.2 (amandemen 2.12.0) — INVALID_STATE terkunci HTTP 409 (konflik state
  // domain), MUST NOT dipasangkan 500. Kegagalan tak terduga pakai
  // INTERNAL_ERROR (500).
  return { status: 500, body: apiError("INTERNAL_ERROR", message) };
}

export function readJsonObject(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PipelineError("VALIDATION_ERROR", "Body request wajib objek JSON.", 400);
  }
  return body as Record<string, unknown>;
}

/**
 * C.2 (amandemen 3.0.0) — VALIDATION_ERROR MUST mengumpulkan SELURUH field
 * yang gagal validasi dalam satu response (bukan fail-fast berhenti di field
 * pertama). Pola reusable: `collect()` menjalankan satu field reader yang
 * SUDAH ADA (throw PipelineError VALIDATION_ERROR seperti biasa) — jika
 * gagal, dicatat sebagai satu entry `{field, reason}` alih-alih melempar
 * langsung, lalu lanjut ke field berikutnya. Error non-VALIDATION_ERROR
 * (mis. body bukan objek JSON — transport-level, bukan per-field) tetap
 * dilempar langsung karena bukan sesuatu yang applicable untuk collect-all.
 */
export class ValidationCollector {
  private readonly details: Array<{ field: string; reason: string }> = [];

  collect<T>(field: string, fn: () => T): T | undefined {
    try {
      return fn();
    } catch (error) {
      if (error instanceof PipelineError && error.code === "VALIDATION_ERROR") {
        this.details.push({ field, reason: error.message });
        return undefined;
      }
      throw error;
    }
  }

  throwIfAny(message = "Validasi payload gagal, lihat details."): void {
    if (this.details.length > 0) {
      throw new PipelineError("VALIDATION_ERROR", message, 400, this.details);
    }
  }
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
  const raw = readJsonObject(body).expectedVersion;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    throw new PipelineError("VALIDATION_ERROR", "Field expectedVersion wajib integer >= 1.", 400);
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

/** Deterministic stringify — sort key objek rekursif, supaya payload yang secara semantik sama TIDAK menghasilkan fingerprint berbeda cuma karena urutan field beda. */
function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v !== null && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(obj).sort()) sorted[k] = sort(obj[k]);
      return sorted;
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

/**
 * Wrapper idempotency-aware (C.3/TASK-0.21, amandemen SOT 4.0.0) — SATU
 * TITIK generik dipakai SELURUH route create/move/archive/restore/delete
 * (bukan copy-paste per route, Review-CL-19's kelas masalah DRY yang sama
 * seperti 11 `xPayload()` terpisah). Tanpa header `Idempotency-Key`
 * (opsional, C.3 "SHOULD" bukan wajib) ATAU tanpa `idempotencyStore`
 * di-wire → berjalan identik `withErrorHandling` biasa, nol overhead.
 *
 * State machine atomic claim (BUKAN cache get/put — dilarang eksplisit
 * 03-ENG, dua request in-flight bisa eksekusi side-effect ganda):
 * claim() SEBELUM handler dijalankan, complete() HANYA untuk 2xx,
 * release() untuk kegagalan (supaya retry berikutnya diproses sebagai
 * request baru, bukan terkunci permanen sebagai gagal — C.3 poin 7).
 *
 * Scope WAJIB mencakup `userId` (bukan cuma method+path) — Idempotency-Key
 * di-generate CLIENT, jadi TANPA userId, User A bisa "menebak"/reuse key
 * User B untuk endpoint yang sama. Fingerprint dihitung dari method+path+
 * canonical body (C.3 poin 2) — payload BERBEDA dengan key+scope SAMA
 * ditolak `IDEMPOTENCY_CONFLICT`, baik masih diproses maupun sudah selesai.
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
  // c.req.json() di-cache Hono (bodyCache) — handler yang memanggilnya lagi
  // di dalam mendapat hasil parse YANG SAMA, bukan re-read stream kosong.
  const body = await c.req.json().catch(() => null);
  const fingerprint = canonicalJson({ method: c.req.method, path: c.req.path, body });

  const claim = await idempotencyStore.claim(key, scope, fingerprint);
  if (claim.status === "conflict") {
    return c.json(
      apiError("IDEMPOTENCY_CONFLICT", "Idempotency-Key ini sudah dipakai untuk request dengan payload berbeda."),
      409,
    );
  }
  if (claim.status === "in_progress") {
    return c.json(
      apiError("IDEMPOTENCY_IN_PROGRESS", "Request dengan Idempotency-Key ini masih diproses eksekusi pertama."),
      409,
    );
  }
  if (claim.status === "replay") {
    return c.json(claim.response.body as Record<string, unknown>, claim.response.status as ContentfulStatusCode);
  }

  // claim.status === "claimed"
  const response = await withErrorHandling(c, handler, successStatus);
  if (response.status >= 200 && response.status < 300) {
    const responseBody = await response.clone().json();
    await idempotencyStore.complete(key, scope, claim.claimToken, { status: response.status, body: responseBody });
  } else {
    await idempotencyStore.release(key, scope, claim.claimToken);
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
    return withIdempotentHandling(c, getDeps(), async () => {
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
      const body = parseBody(projectPatchSchema, await c.req.json().catch(() => null));
      const repository = new DrizzleProjectRepository(ctx.database);
      const state = await repository.updateProjectName({
        projectId,
        expectedVersion: body.expectedVersion,
        actorUserId: ctx.userId,
        name: body.name,
      });
      return { project: projectStatePayload(state) };
    }, 200, getDeps().idempotencyStore);
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
