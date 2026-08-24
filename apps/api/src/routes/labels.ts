import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ok } from "@kanban/contracts";
import {
  DrizzleBoardLabelRepository,
  DrizzleMilestoneLabelRepository,
  PipelineError,
  type BoardLabelRecord,
  type MilestoneLabelRecord,
  type ResolvedIdentity,
} from "@kanban/infrastructure";
import { authorize, readExpectedVersionField, readJsonObject, toApiErrorResponse, ValidationCollector, type OpenProjectContext } from "./projects.ts";

function readLabelNameField(rawName: unknown): string {
  if (typeof rawName !== "string" || rawName.trim().length === 0) {
    throw new PipelineError("VALIDATION_ERROR", "Field name wajib string non-kosong.", 400);
  }
  return rawName.trim();
}

export interface MilestoneLabelRoutesDeps {
  resolveIdentity(request: Request): Promise<ResolvedIdentity | null>;
  newMilestoneLabelId(): string;
  openProjectContext(request: Request, projectId: string): Promise<OpenProjectContext>;
}

export interface BoardLabelRoutesDeps {
  resolveIdentity(request: Request): Promise<ResolvedIdentity | null>;
  newBoardLabelId(): string;
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

function boardLabelPayload(record: BoardLabelRecord) {
  return {
    id: record.id,
    boardId: record.boardId,
    name: record.name,
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

export function createMilestoneLabelsRouter(getDeps: () => MilestoneLabelRoutesDeps): Hono {
  const router = new Hono();

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
      await authorize(ctx, "milestone_label.create", projectId, { type: "milestone", id: c.req.param("milestone_id") });
      const body = readJsonObject(await c.req.json().catch(() => null));
      const collector = new ValidationCollector();
      const name = collector.collect("name", () => readLabelNameField(body.name));
      collector.throwIfAny();
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
        name: name!,
        actorUserId: ctx.userId,
      });
      return { label: labelPayload(created) };
    }, 201);
  });

  router.patch("/v1/projects/:project_id/milestones/:milestone_id/labels/:label_id", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      await authorize(ctx, "milestone_label.update", projectId, { type: "milestone", id: c.req.param("milestone_id") });
      const body = readJsonObject(await c.req.json().catch(() => null));
      const collector = new ValidationCollector();
      const expectedVersion = collector.collect("expectedVersion", () => readExpectedVersionField(body));
      const name = body.name === undefined ? undefined : collector.collect("name", () => readLabelNameField(body.name));
      collector.throwIfAny();
      for (const key of Object.keys(body)) {
        if (key !== "name" && key !== "expectedVersion") {
          throw new PipelineError(
            "VALIDATION_ERROR",
            `Field '${key}' tidak dapat diubah via PATCH Label (C.15).`,
            400,
          );
        }
      }
      const repository = new DrizzleMilestoneLabelRepository(ctx.database);
      const updated = await repository.updateMilestoneLabel(projectId, {
        labelId: c.req.param("label_id"),
        expectedVersion: expectedVersion!,
        actorUserId: ctx.userId,
        ...(name === undefined ? {} : { name }),
      });
      return { label: labelPayload(updated) };
    });
  });

  const lifecycleCommands = {
    archive: (repository: DrizzleMilestoneLabelRepository, projectId: string, input: { labelId: string; expectedVersion: number; actorUserId: string }) =>
      repository.archiveMilestoneLabel(projectId, input),
    restore: (repository: DrizzleMilestoneLabelRepository, projectId: string, input: { labelId: string; expectedVersion: number; actorUserId: string }) =>
      repository.restoreMilestoneLabel(projectId, input),
    delete: (repository: DrizzleMilestoneLabelRepository, projectId: string, input: { labelId: string; expectedVersion: number; actorUserId: string }) =>
      repository.deleteMilestoneLabel(projectId, input),
  } as const;

  for (const [action, command] of Object.entries(lifecycleCommands)) {
    router.post(`/v1/projects/:project_id/milestones/:milestone_id/labels/:label_id/${action}`, async (c) => {
      return withErrorHandling(c, async () => {
        const deps = getDeps();
        const projectId = c.req.param("project_id");
        const ctx = await deps.openProjectContext(c.req.raw, projectId);
        await authorize(ctx, `milestone_label.${action}`, projectId, { type: "milestone", id: c.req.param("milestone_id") });
        const expectedVersion = readExpectedVersionField(await c.req.json().catch(() => null));
        const repository = new DrizzleMilestoneLabelRepository(ctx.database);
        const record = await command(repository, projectId, {
          labelId: c.req.param("label_id"),
          expectedVersion,
          actorUserId: ctx.userId,
        });
        return { label: labelPayload(record) };
      });
    });
  }

  return router;
}

export function createBoardLabelsRouter(getDeps: () => BoardLabelRoutesDeps): Hono {
  const router = new Hono();

  router.get("/v1/projects/:project_id/boards/:board_id/labels", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      const repository = new DrizzleBoardLabelRepository(ctx.database);
      const includeDeleted = c.req.query("include_deleted") === "true";
      const labels = await repository.listBoardLabels(projectId, c.req.param("board_id"), {
        includeDeleted,
      });
      return { labels: labels.map(boardLabelPayload) };
    });
  });

  router.post("/v1/projects/:project_id/boards/:board_id/labels", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      await authorize(ctx, "board_label.create", projectId, { type: "board", id: c.req.param("board_id") });
      const body = readJsonObject(await c.req.json().catch(() => null));
      const collector = new ValidationCollector();
      const name = collector.collect("name", () => readLabelNameField(body.name));
      collector.throwIfAny();
      for (const key of Object.keys(body)) {
        if (key !== "name") {
          throw new PipelineError(
            "VALIDATION_ERROR",
            `Field '${key}' tidak dikenal pada payload create Label (C.11).`,
            400,
          );
        }
      }
      const repository = new DrizzleBoardLabelRepository(ctx.database);
      const created = await repository.createBoardLabel(projectId, c.req.param("board_id"), {
        id: deps.newBoardLabelId(),
        name: name!,
        actorUserId: ctx.userId,
      });
      return { label: boardLabelPayload(created) };
    }, 201);
  });

  router.patch("/v1/projects/:project_id/boards/:board_id/labels/:label_id", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      await authorize(ctx, "board_label.update", projectId, { type: "board", id: c.req.param("board_id") });
      const body = readJsonObject(await c.req.json().catch(() => null));
      const collector = new ValidationCollector();
      const expectedVersion = collector.collect("expectedVersion", () => readExpectedVersionField(body));
      const name = body.name === undefined ? undefined : collector.collect("name", () => readLabelNameField(body.name));
      collector.throwIfAny();
      for (const key of Object.keys(body)) {
        if (key !== "name" && key !== "expectedVersion") {
          throw new PipelineError(
            "VALIDATION_ERROR",
            `Field '${key}' tidak dapat diubah via PATCH Label (C.15).`,
            400,
          );
        }
      }
      const repository = new DrizzleBoardLabelRepository(ctx.database);
      const updated = await repository.updateBoardLabel(projectId, {
        labelId: c.req.param("label_id"),
        expectedVersion: expectedVersion!,
        actorUserId: ctx.userId,
        ...(name === undefined ? {} : { name }),
      });
      return { label: boardLabelPayload(updated) };
    });
  });

  const lifecycleCommands = {
    archive: (repository: DrizzleBoardLabelRepository, projectId: string, input: { labelId: string; expectedVersion: number; actorUserId: string }) =>
      repository.archiveBoardLabel(projectId, input),
    restore: (repository: DrizzleBoardLabelRepository, projectId: string, input: { labelId: string; expectedVersion: number; actorUserId: string }) =>
      repository.restoreBoardLabel(projectId, input),
    delete: (repository: DrizzleBoardLabelRepository, projectId: string, input: { labelId: string; expectedVersion: number; actorUserId: string }) =>
      repository.deleteBoardLabel(projectId, input),
  } as const;

  for (const [action, command] of Object.entries(lifecycleCommands)) {
    router.post(`/v1/projects/:project_id/boards/:board_id/labels/:label_id/${action}`, async (c) => {
      return withErrorHandling(c, async () => {
        const deps = getDeps();
        const projectId = c.req.param("project_id");
        const ctx = await deps.openProjectContext(c.req.raw, projectId);
        await authorize(ctx, `board_label.${action}`, projectId, { type: "board", id: c.req.param("board_id") });
        const expectedVersion = readExpectedVersionField(await c.req.json().catch(() => null));
        const repository = new DrizzleBoardLabelRepository(ctx.database);
        const record = await command(repository, projectId, {
          labelId: c.req.param("label_id"),
          expectedVersion,
          actorUserId: ctx.userId,
        });
        return { label: boardLabelPayload(record) };
      });
    });
  }

  return router;
}
