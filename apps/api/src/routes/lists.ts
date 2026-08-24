import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ok } from "@kanban/contracts";
import {
  DrizzleListRepository,
  PipelineError,
  type ListRecord,
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
import { parseBody, listCreateSchema, listPatchSchema } from "./core-schemas.ts";

export interface ListRoutesDeps {
  resolveIdentity(request: Request): Promise<ResolvedIdentity | null>;
  newListId(): string;
  openProjectContext(request: Request, projectId: string): Promise<OpenProjectContext>;
  /** C.3 (TASK-0.16) — opsional, lihat catatan `ProjectRoutesDeps`. */
  idempotencyStore?: IdempotencyStoreLike;
}

function listPayload(record: ListRecord) {
  return {
    id: record.id,
    boardId: record.boardId,
    title: record.title,
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

export function createListsRouter(getDeps: () => ListRoutesDeps): Hono {
  const router = new Hono();

  router.post("/v1/projects/:project_id/boards/:board_id/lists", async (c) => {
    const deps = getDeps();
    return withIdempotentHandling(c, getDeps(), async () => {
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      await authorize(ctx, "list.create", projectId, { type: "board", id: c.req.param("board_id") });
      const body = parseBody(listCreateSchema, await c.req.json().catch(() => null));
      const repository = new DrizzleListRepository(ctx.database);
      const created = await repository.createList(projectId, {
        id: deps.newListId(),
        boardId: c.req.param("board_id"),
        title: body.title,
        actorUserId: ctx.userId,
      });
      return { list: listPayload(created) };
    }, 201, deps.idempotencyStore);
  });

  router.get("/v1/projects/:project_id/boards/:board_id/lists", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      const repository = new DrizzleListRepository(ctx.database);
      const records = await repository.listLists(c.req.param("board_id"));
      return { lists: records.map(listPayload) };
    });
  });

  router.get("/v1/projects/:project_id/lists/:list_id", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      const repository = new DrizzleListRepository(ctx.database);
      const record = await repository.getList(projectId, c.req.param("list_id"));
      if (!record) {
        throw new PipelineError(
          "RESOURCE_NOT_FOUND",
          `List ${c.req.param("list_id")} tidak ditemukan.`,
          404,
        );
      }
      return { list: listPayload(record) };
    });
  });

  router.patch("/v1/projects/:project_id/lists/:list_id", async (c) => {
    return withIdempotentHandling(c, getDeps(), async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      await authorize(ctx, "list.update", projectId, { type: "list", id: c.req.param("list_id") });
      const rawBody = readJsonObject(await c.req.json().catch(() => null));
      const body = parseBody(listPatchSchema, rawBody);
      for (const key of Object.keys(body)) {
        if (key !== "title" && key !== "expectedVersion") {
          throw new PipelineError(
            "VALIDATION_ERROR",
            `Field '${key}' tidak dapat diubah via PATCH List (C.15/FR-023).`,
            400,
          );
        }
      }
      const repository = new DrizzleListRepository(ctx.database);
      const updated = await repository.updateList(projectId, {
        listId: c.req.param("list_id"),
        expectedVersion: body.expectedVersion,
        actorUserId: ctx.userId,
        ...(body.title === undefined ? {} : { title: body.title }),
      });
      return { list: listPayload(updated) };
    }, 200, getDeps().idempotencyStore);
  });

  const lifecycleCommands = {
    archive: (repository: DrizzleListRepository, projectId: string, input: { listId: string; expectedVersion: number; actorUserId: string }) =>
      repository.archiveList(projectId, input),
    restore: (repository: DrizzleListRepository, projectId: string, input: { listId: string; expectedVersion: number; actorUserId: string }) =>
      repository.restoreList(projectId, input),
    delete: (repository: DrizzleListRepository, projectId: string, input: { listId: string; expectedVersion: number; actorUserId: string }) =>
      repository.deleteList(projectId, input),
  } as const;

  for (const [action, command] of Object.entries(lifecycleCommands)) {
    router.post(`/v1/projects/:project_id/lists/:list_id/${action}`, async (c) => {
      const deps = getDeps();
      return withIdempotentHandling(c, getDeps(), async () => {
        const projectId = c.req.param("project_id");
        const ctx = await deps.openProjectContext(c.req.raw, projectId);
        await authorize(ctx, `list.${action}`, projectId, { type: "list", id: c.req.param("list_id") });
        const expectedVersion = readExpectedVersionField(await c.req.json().catch(() => null));
        const repository = new DrizzleListRepository(ctx.database);
        const record = await command(repository, projectId, {
          listId: c.req.param("list_id"),
          expectedVersion,
          actorUserId: ctx.userId,
        });
        return { list: listPayload(record) };
      }, 200, deps.idempotencyStore);
    });
  }

  return router;
}
