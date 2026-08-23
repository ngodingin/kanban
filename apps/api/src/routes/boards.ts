import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ok } from "@kanban/contracts";
import {
  DrizzleBoardRepository,
  PipelineError,
  type BoardRecord,
  type ResolvedIdentity,
} from "@kanban/infrastructure";
import { readExpectedVersionField, readJsonObject, toApiErrorResponse, type OpenProjectContext } from "./projects.ts";

export interface BoardRoutesDeps {
  resolveIdentity(request: Request): Promise<ResolvedIdentity | null>;
  newBoardId(): string;
  openProjectContext(request: Request, projectId: string): Promise<OpenProjectContext>;
}

function boardPayload(record: BoardRecord) {
  return {
    id: record.id,
    milestoneId: record.milestoneId,
    title: record.title,
    description: record.description,
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

function readTitleField(body: Record<string, unknown>): string {
  const raw = body.title;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new PipelineError("VALIDATION_ERROR", "Field title wajib string non-kosong.", 400);
  }
  return raw.trim();
}

function readOptionalDescription(body: Record<string, unknown>): string | null {
  const raw = body.description;
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") {
    throw new PipelineError("VALIDATION_ERROR", "Field description wajib string atau null.", 400);
  }
  return raw;
}

export function createBoardsRouter(getDeps: () => BoardRoutesDeps): Hono {
  const router = new Hono().basePath("/api");

  router.post("/v1/projects/:project_id/milestones/:milestone_id/boards", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      assertOwnerInterim(ctx);
      const body = readJsonObject(await c.req.json().catch(() => null));
      const repository = new DrizzleBoardRepository(ctx.database);
      const created = await repository.createBoard(projectId, {
        id: deps.newBoardId(),
        milestoneId: c.req.param("milestone_id"),
        title: readTitleField(body),
        description: readOptionalDescription(body),
        actorUserId: ctx.userId,
      });
      return { board: boardPayload(created) };
    }, 201);
  });

  router.get("/v1/projects/:project_id/milestones/:milestone_id/boards", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      const repository = new DrizzleBoardRepository(ctx.database);
      const records = await repository.listBoards(c.req.param("milestone_id"));
      return { boards: records.map(boardPayload) };
    });
  });

  router.get("/v1/projects/:project_id/boards/:board_id", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      const repository = new DrizzleBoardRepository(ctx.database);
      const record = await repository.getBoard(projectId, c.req.param("board_id"));
      if (!record) {
        throw new PipelineError(
          "RESOURCE_NOT_FOUND",
          `Board ${c.req.param("board_id")} tidak ditemukan.`,
          404,
        );
      }
      return { board: boardPayload(record) };
    });
  });

  router.patch("/v1/projects/:project_id/boards/:board_id", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      assertOwnerInterim(ctx);
      const body = readJsonObject(await c.req.json().catch(() => null));
      const expectedVersion = readExpectedVersionField(body);
      const allowedFields = ["title", "description"] as const;
      for (const key of Object.keys(body)) {
        if (!(allowedFields as readonly string[]).includes(key) && key !== "expected_version") {
          throw new PipelineError(
            "VALIDATION_ERROR",
            `Field '${key}' tidak dapat diubah via PATCH Board (C.15).`,
            400,
          );
        }
      }
      const repository = new DrizzleBoardRepository(ctx.database);
      const updated = await repository.updateBoard(projectId, {
        boardId: c.req.param("board_id"),
        expectedVersion,
        actorUserId: ctx.userId,
        ...(body.title === undefined ? {} : { title: readTitleField(body) }),
        ...(body.description === undefined ? {} : { description: readOptionalDescription(body) }),
      });
      return { board: boardPayload(updated) };
    });
  });

  const lifecycleCommands = {
    archive: (repository: DrizzleBoardRepository, projectId: string, input: { boardId: string; expectedVersion: number; actorUserId: string }) =>
      repository.archiveBoard(projectId, input),
    restore: (repository: DrizzleBoardRepository, projectId: string, input: { boardId: string; expectedVersion: number; actorUserId: string }) =>
      repository.restoreBoard(projectId, input),
    delete: (repository: DrizzleBoardRepository, projectId: string, input: { boardId: string; expectedVersion: number; actorUserId: string }) =>
      repository.deleteBoard(projectId, input),
  } as const;

  for (const [action, command] of Object.entries(lifecycleCommands)) {
    router.post(`/v1/projects/:project_id/boards/:board_id/${action}`, async (c) => {
      return withErrorHandling(c, async () => {
        const deps = getDeps();
        const projectId = c.req.param("project_id");
        const ctx = await deps.openProjectContext(c.req.raw, projectId);
        assertOwnerInterim(ctx);
        const expectedVersion = readExpectedVersionField(await c.req.json().catch(() => null));
        const repository = new DrizzleBoardRepository(ctx.database);
        const record = await command(repository, projectId, {
          boardId: c.req.param("board_id"),
          expectedVersion,
          actorUserId: ctx.userId,
        });
        return { board: boardPayload(record) };
      });
    });
  }

  return router;
}
