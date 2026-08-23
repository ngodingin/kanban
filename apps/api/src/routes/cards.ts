import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ok } from "@kanban/contracts";
import {
  DrizzleCardRepository,
  listCardLabels,
  PipelineError,
  type CardLabelSummary,
  type CardRecord,
  type ResolvedIdentity,
} from "@kanban/infrastructure";
import { readExpectedVersionField, readJsonObject, toApiErrorResponse, type OpenProjectContext } from "./projects.ts";

export interface CardRoutesDeps {
  resolveIdentity(request: Request): Promise<ResolvedIdentity | null>;
  newCardId(): string;
  openProjectContext(request: Request, projectId: string): Promise<OpenProjectContext>;
  /** 03-ENG A.5 — validator assignee member aktif (Global DB). */
  assertAssigneeActiveMember(projectId: string, userId: string): Promise<void>;
}

function cardPayload(record: CardRecord, labels?: CardLabelSummary[]) {
  return {
    id: record.id,
    listId: record.listId,
    creatorUserId: record.creatorUserId,
    assigneeUserId: record.assigneeUserId,
    title: record.title,
    subtitle: record.subtitle,
    description: record.description,
    dueDate: record.dueDate,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    archivedAt: record.archivedAt,
    deletedAt: record.deletedAt,
    version: record.version,
    // C.8 amandemen 2.8.1 — hanya GET /cards/:card_id yang menyertakan
    // labels (Prinsip TASK-3.9); response lain (create/update/lifecycle)
    // tidak berubah shape-nya (parameter opsional, undefined = field absen).
    ...(labels === undefined ? {} : { labels: labels.map((l) => ({ id: l.id, name: l.name, scope: l.scope })) }),
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

function readOptionalString(body: Record<string, unknown>, field: string): string | null | undefined {
  const raw = body[field];
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") {
    throw new PipelineError("VALIDATION_ERROR", `Field ${field} wajib string atau null.`, 400);
  }
  return raw;
}

function readAssigneeField(body: Record<string, unknown>): string | null {
  const raw = body.assignee;
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new PipelineError("VALIDATION_ERROR", "Field assignee wajib string non-kosong atau null.", 400);
  }
  return raw.trim();
}

export function createCardsRouter(getDeps: () => CardRoutesDeps): Hono {
  const router = new Hono().basePath("/api");

  router.post("/v1/projects/:project_id/lists/:list_id/cards", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      assertOwnerInterim(ctx);
      const body = readJsonObject(await c.req.json().catch(() => null));
      const repository = new DrizzleCardRepository(ctx.database, {
        assertAssigneeActiveMember: deps.assertAssigneeActiveMember,
      });
      const created = await repository.createCard(projectId, {
        id: deps.newCardId(),
        listId: c.req.param("list_id"),
        title: readTitleField(body),
        subtitle: readOptionalString(body, "subtitle") ?? null,
        description: readOptionalString(body, "description") ?? null,
        dueDate: readOptionalString(body, "due_date") ?? null,
        assigneeUserId: readAssigneeField(body),
        actorUserId: ctx.userId,
      });
      return { card: cardPayload(created) };
    }, 201);
  });

  router.get("/v1/projects/:project_id/cards/:card_id", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      const repository = new DrizzleCardRepository(ctx.database, {
        assertAssigneeActiveMember: deps.assertAssigneeActiveMember,
      });
      const record = await repository.getCard(projectId, c.req.param("card_id"));
      if (!record) {
        throw new PipelineError(
          "RESOURCE_NOT_FOUND",
          `Card ${c.req.param("card_id")} tidak ditemukan.`,
          404,
        );
      }
      const labels = await listCardLabels(ctx.database, record.id);
      return { card: cardPayload(record, labels) };
    });
  });

  router.patch("/v1/projects/:project_id/cards/:card_id", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      assertOwnerInterim(ctx);
      const body = readJsonObject(await c.req.json().catch(() => null));
      const expectedVersion = readExpectedVersionField(body);
      const allowedFields = ["title", "subtitle", "description", "due_date", "assignee"] as const;
      for (const key of Object.keys(body)) {
        if (!(allowedFields as readonly string[]).includes(key) && key !== "expected_version") {
          throw new PipelineError(
            "VALIDATION_ERROR",
            `Field '${key}' tidak dapat diubah via PATCH Card${key === "list_id" ? " — move wajib via /cards/:id/move (BR-017)" : " (C.15)"}.`,
            400,
          );
        }
      }
      const repository = new DrizzleCardRepository(ctx.database, {
        assertAssigneeActiveMember: deps.assertAssigneeActiveMember,
      });
      const updated = await repository.updateCard(projectId, {
        cardId: c.req.param("card_id"),
        expectedVersion,
        actorUserId: ctx.userId,
        ...(body.title === undefined ? {} : { title: readTitleField(body) }),
        subtitle: readOptionalString(body, "subtitle"),
        description: readOptionalString(body, "description"),
        dueDate: readOptionalString(body, "due_date"),
        assigneeUserId: body.assignee === undefined ? undefined : readAssigneeField(body),
      });
      return { card: cardPayload(updated) };
    });
  });

  router.post("/v1/projects/:project_id/cards/:card_id/move", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      // BR-044 — card.move permission terpisah dari card.update; interim Owner-only.
      assertOwnerInterim(ctx);
      const body = readJsonObject(await c.req.json().catch(() => null));
      for (const key of Object.keys(body)) {
        if (key !== "destination_list_id" && key !== "expected_version") {
          throw new PipelineError(
            "VALIDATION_ERROR",
            `Field '${key}' tidak dikenal pada payload move (C.8).`,
            400,
          );
        }
      }
      const rawDestination = body.destination_list_id;
      if (typeof rawDestination !== "string" || rawDestination.trim().length === 0) {
        throw new PipelineError("VALIDATION_ERROR", "Field destination_list_id wajib string non-kosong.", 400);
      }
      const expectedVersion = readExpectedVersionField(body);
      const repository = new DrizzleCardRepository(ctx.database, {
        assertAssigneeActiveMember: deps.assertAssigneeActiveMember,
      });
      // Seluruh validasi domain (urutan C.8, INV-MOVE, BR-018) di moveCard.
      const record = await repository.moveCard(projectId, {
        cardId: c.req.param("card_id"),
        destinationListId: rawDestination,
        expectedVersion,
        actorUserId: ctx.userId,
      });
      return { card: cardPayload(record) };
    });
  });

  const lifecycleCommands = {
    archive: (repository: DrizzleCardRepository, projectId: string, input: { cardId: string; expectedVersion: number; actorUserId: string }) =>
      repository.archiveCard(projectId, input),
    restore: (repository: DrizzleCardRepository, projectId: string, input: { cardId: string; expectedVersion: number; actorUserId: string }) =>
      repository.restoreCard(projectId, input),
    delete: (repository: DrizzleCardRepository, projectId: string, input: { cardId: string; expectedVersion: number; actorUserId: string }) =>
      repository.deleteCard(projectId, input),
  } as const;

  for (const [action, command] of Object.entries(lifecycleCommands)) {
    router.post(`/v1/projects/:project_id/cards/:card_id/${action}`, async (c) => {
      return withErrorHandling(c, async () => {
        const deps = getDeps();
        const projectId = c.req.param("project_id");
        const ctx = await deps.openProjectContext(c.req.raw, projectId);
        assertOwnerInterim(ctx);
        const expectedVersion = readExpectedVersionField(await c.req.json().catch(() => null));
        const repository = new DrizzleCardRepository(ctx.database, {
          assertAssigneeActiveMember: deps.assertAssigneeActiveMember,
        });
        const record = await command(repository, projectId, {
          cardId: c.req.param("card_id"),
          expectedVersion,
          actorUserId: ctx.userId,
        });
        return { card: cardPayload(record) };
      });
    });
  }

  return router;
}
