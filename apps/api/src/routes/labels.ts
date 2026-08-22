import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ok } from "@kanban/contracts";
import {
  DrizzleMilestoneLabelRepository,
  PipelineError,
  type MilestoneLabelRecord,
  type ResolvedIdentity,
} from "@kanban/infrastructure";
import { readJsonObject, toApiErrorResponse, type OpenProjectContext } from "./projects.ts";

export interface MilestoneLabelRoutesDeps {
  resolveIdentity(request: Request): Promise<ResolvedIdentity | null>;
  newMilestoneLabelId(): string;
  openProjectContext(request: Request, projectId: string): Promise<OpenProjectContext>;
}

function labelPayload(record: MilestoneLabelRecord) {
  return {
    id: record.id,
    milestoneId: record.milestoneId,
    name: record.name,
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

export function createMilestoneLabelsRouter(getDeps: () => MilestoneLabelRoutesDeps): Hono {
  const router = new Hono().basePath("/api");

  router.get("/v1/projects/:project_id/milestones/:milestone_id/labels", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      const repository = new DrizzleMilestoneLabelRepository(ctx.database);
      const includeDeleted = c.req.query("include_deleted") === "true";
      const labels = await repository.listMilestoneLabels(projectId, c.req.param("milestone_id"), {
        includeDeleted,
      });
      return { labels: labels.map(labelPayload) };
    });
  });

  router.post("/v1/projects/:project_id/milestones/:milestone_id/labels", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      assertOwnerInterim(ctx);
      const body = readJsonObject(await c.req.json().catch(() => null));
      const rawName = body.name;
      if (typeof rawName !== "string" || rawName.trim().length === 0) {
        throw new PipelineError("VALIDATION_ERROR", "Field name wajib string non-kosong.", 400);
      }
      for (const key of Object.keys(body)) {
        if (key !== "name") {
          throw new PipelineError(
            "VALIDATION_ERROR",
            `Field '${key}' tidak dikenal pada payload create Label (C.11).`,
            400,
          );
        }
      }
      const repository = new DrizzleMilestoneLabelRepository(ctx.database);
      const created = await repository.createMilestoneLabel(projectId, c.req.param("milestone_id"), {
        id: deps.newMilestoneLabelId(),
        name: rawName.trim(),
        actorUserId: ctx.userId,
      });
      return { label: labelPayload(created) };
    }, 201);
  });

  return router;
}
