import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ok } from "@kanban/contracts";
import {
  DrizzleMilestoneRepository,
  PipelineError,
  type MilestoneRecord,
  type ResolvedIdentity,
} from "@kanban/infrastructure";
import { readExpectedVersionField, readJsonObject, toApiErrorResponse, type OpenProjectContext } from "./projects.ts";

export interface MilestoneRoutesDeps {
  resolveIdentity(request: Request): Promise<ResolvedIdentity | null>;
  newMilestoneId(): string;
  openProjectContext(request: Request, projectId: string): Promise<OpenProjectContext>;
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

function assertOwnerInterim(ctx: OpenProjectContext): void {
  if (ctx.ownerUserId !== ctx.userId) {
    throw new PipelineError(
      "PERMISSION_DENIED",
      "Hanya Owner Project yang dapat melakukan operasi ini (interim).",
      403,
    );
  }
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

function readTitleField(body: unknown): string {
  const raw = readJsonObject(body).title;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new PipelineError("VALIDATION_ERROR", "Field title wajib string non-kosong.", 400);
  }
  return raw.trim();
}

function readOptionalStringField(
  body: Record<string, unknown>,
  field: string,
): string | null | undefined {
  const raw = body[field];
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") {
    throw new PipelineError("VALIDATION_ERROR", `Field ${field} wajib string atau null.`, 400);
  }
  return raw;
}

function readProgressField(body: Record<string, unknown>): number | undefined {
  const raw = body.progress;
  if (raw === undefined) return undefined;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > 100) {
    throw new PipelineError("VALIDATION_ERROR", "Field progress wajib integer 0–100.", 400);
  }
  return raw;
}

export function createMilestonesRouter(getDeps: () => MilestoneRoutesDeps): Hono {
  const router = new Hono().basePath("/api");

  router.post("/v1/projects/:project_id/milestones", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      assertOwnerInterim(ctx);
      const body = readJsonObject(await c.req.json().catch(() => null));
      const title = readTitleField(body);
      const repository = new DrizzleMilestoneRepository(ctx.database);
      const created = await repository.createMilestone(projectId, {
        id: deps.newMilestoneId(),
        title,
        description: readOptionalStringField(body, "description") ?? null,
        progress: readProgressField(body) ?? 0,
        startDate: readOptionalStringField(body, "start_date") ?? null,
        dueDate: readOptionalStringField(body, "due_date") ?? null,
        actorUserId: ctx.userId,
      });
      return { milestone: milestonePayload(created) };
    }, 201);
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

  router.patch("/v1/projects/:project_id/milestones/:milestone_id", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      assertOwnerInterim(ctx);
      const body = readJsonObject(await c.req.json().catch(() => null));
      const expectedVersion = readExpectedVersionField(body);
      const allowedFields = ["title", "description", "progress", "start_date", "due_date"] as const;
      for (const key of Object.keys(body)) {
        if (!(allowedFields as readonly string[]).includes(key) && key !== "expected_version") {
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
        expectedVersion,
        actorUserId: ctx.userId,
        ...(body.title === undefined ? {} : { title: readTitleField(body) }),
        description: readOptionalStringField(body, "description"),
        progress: readProgressField(body),
        startDate: readOptionalStringField(body, "start_date"),
        dueDate: readOptionalStringField(body, "due_date"),
      });
      return { milestone: milestonePayload(updated) };
    });
  });

  return router;
}
