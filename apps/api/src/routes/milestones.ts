import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ok } from "@kanban/contracts";
import {
  DrizzleMilestoneRepository,
  PipelineError,
  type MilestoneRecord,
  type ResolvedIdentity,
} from "@kanban/infrastructure";
import {
  authorize,
  readExpectedVersionField,
  readJsonObject,
  toApiErrorResponse,
  withIdempotentHandling,
  type IdempotencyStoreLike,
  type OpenProjectContext,
} from "./projects.ts";
import { parseBody, milestoneCreateSchema, milestonePatchSchema } from "./core-schemas.ts";

export interface MilestoneRoutesDeps {
  resolveIdentity(request: Request): Promise<ResolvedIdentity | null>;
  newMilestoneId(): string;
  openProjectContext(request: Request, projectId: string): Promise<OpenProjectContext>;
  /** C.3 (TASK-0.16) — opsional, lihat catatan `ProjectRoutesDeps`. */
  idempotencyStore?: IdempotencyStoreLike;
}

function milestonePayload(record: MilestoneRecord) {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    progress: record.progress,
    startDate: record.startDate,
    dueDate: record.dueDate,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    archivedAt: record.archivedAt,
    deletedAt: record.deletedAt,
    version: record.version,
  };
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

export function createMilestonesRouter(getDeps: () => MilestoneRoutesDeps): Hono {
  const router = new Hono();

  router.post("/v1/projects/:project_id/milestones", async (c) => {
    const deps = getDeps();
    return withIdempotentHandling(c, getDeps(), async () => {
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      await authorize(ctx, "milestone.create", projectId);
      const body = parseBody(milestoneCreateSchema, await c.req.json().catch(() => null));
      const repository = new DrizzleMilestoneRepository(ctx.database);
      const created = await repository.createMilestone(projectId, {
        id: deps.newMilestoneId(),
        title: body.title,
        description: body.description ?? null,
        progress: body.progress ?? 0,
        startDate: body.startDate ?? null,
        dueDate: body.dueDate ?? null,
        actorUserId: ctx.userId,
      });
      return { milestone: milestonePayload(created) };
    }, 201, deps.idempotencyStore);
  });

  router.get("/v1/projects/:project_id/milestones", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      const repository = new DrizzleMilestoneRepository(ctx.database);
      const records = await repository.listMilestones(projectId);
      return { milestones: records.map(milestonePayload) };
    });
  });

  router.get("/v1/projects/:project_id/milestones/:milestone_id", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      const repository = new DrizzleMilestoneRepository(ctx.database);
      const record = await repository.getMilestone(projectId, c.req.param("milestone_id"));
      if (!record) {
        throw new PipelineError(
          "RESOURCE_NOT_FOUND",
          `Milestone ${c.req.param("milestone_id")} tidak ditemukan.`,
          404,
        );
      }
      return { milestone: milestonePayload(record) };
    });
  });

  router.patch("/v1/projects/:project_id/milestones/:milestone_id", async (c) => {    return withIdempotentHandling(c, getDeps(), async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      await authorize(ctx, "milestone.update", projectId, { type: "milestone", id: c.req.param("milestone_id") });
      const rawBody = readJsonObject(await c.req.json().catch(() => null));
      const body = parseBody(milestonePatchSchema, rawBody);
      const allowedFields = ["title", "description", "progress", "startDate", "dueDate"] as const;
      for (const key of Object.keys(rawBody)) {
        if (!(allowedFields as readonly string[]).includes(key) && key !== "expectedVersion") {
          throw new PipelineError(
            "VALIDATION_ERROR",
            `Field '${key}' tidak dapat diubah via PATCH Milestone (C.15).`,
            400,
          );
        }
      }
      const repository = new DrizzleMilestoneRepository(ctx.database);
      const updated = await repository.updateMilestone(projectId, {
        milestoneId: c.req.param("milestone_id"),
        expectedVersion: body.expectedVersion,
        actorUserId: ctx.userId,
        ...(body.title === undefined ? {} : { title: body.title }),
        description: body.description,
        progress: body.progress,
        startDate: body.startDate,
        dueDate: body.dueDate,
      });
      return { milestone: milestonePayload(updated) };
    }, 200, getDeps().idempotencyStore);
  });

  const lifecycleCommands = {
    archive: (repository: DrizzleMilestoneRepository, projectId: string, input: { milestoneId: string; expectedVersion: number; actorUserId: string }) =>
      repository.archiveMilestone(projectId, input),
    restore: (repository: DrizzleMilestoneRepository, projectId: string, input: { milestoneId: string; expectedVersion: number; actorUserId: string }) =>
      repository.restoreMilestone(projectId, input),
    delete: (repository: DrizzleMilestoneRepository, projectId: string, input: { milestoneId: string; expectedVersion: number; actorUserId: string }) =>
      repository.deleteMilestone(projectId, input),
  } as const;

  for (const [action, command] of Object.entries(lifecycleCommands)) {
    router.post(`/v1/projects/:project_id/milestones/:milestone_id/${action}`, async (c) => {
      const deps = getDeps();
      return withIdempotentHandling(c, getDeps(), async () => {
        const projectId = c.req.param("project_id");
        const ctx = await deps.openProjectContext(c.req.raw, projectId);
        await authorize(ctx, `milestone.${action}`, projectId, { type: "milestone", id: c.req.param("milestone_id") });
        const expectedVersion = readExpectedVersionField(await c.req.json().catch(() => null));
        const repository = new DrizzleMilestoneRepository(ctx.database);
        const record = await command(repository, projectId, {
          milestoneId: c.req.param("milestone_id"),
          expectedVersion,
          actorUserId: ctx.userId,
        });
        return { milestone: milestonePayload(record) };
      }, 200, deps.idempotencyStore);
    });
  }

  return router;
}
