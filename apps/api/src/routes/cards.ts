import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ok } from "@kanban/contracts";
import {
  DrizzleCardRepository,
  listCardLabels,
  listCardLabelsForCards,
  PipelineError,
  type CardLabelSummary,
  type CardRecord,
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
import { parseBody, cardCreateSchema, cardPatchSchema, cardMoveSchema } from "./core-schemas.ts";
import { hasPermission, loadEntityHierarchy } from "@kanban/infrastructure";
import { resolveCardVisibilityFilter } from "@kanban/domain";

export interface CardRoutesDeps {
  resolveIdentity(request: Request): Promise<ResolvedIdentity | null>;
  newCardId(): string;
  openProjectContext(request: Request, projectId: string): Promise<OpenProjectContext>;
  /** 03-ENG A.5 — validator assignee member aktif (Global DB). */
  assertAssigneeActiveMember(projectId: string, userId: string): Promise<void>;
  /** C.3 (TASK-0.16) — opsional, lihat catatan `ProjectRoutesDeps`. */
  idempotencyStore?: IdempotencyStoreLike;
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

export function createCardsRouter(getDeps: () => CardRoutesDeps): Hono {
  const router = new Hono();

  router.post("/v1/projects/:project_id/lists/:list_id/cards", async (c) => {
    const deps = getDeps();
    return withIdempotentHandling(c, getDeps(), async () => {
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      await authorize(ctx, "card.create", projectId, { type: "list", id: c.req.param("list_id") });
      const body = parseBody(cardCreateSchema, await c.req.json().catch(() => null));
      const repository = new DrizzleCardRepository(ctx.database, {
        assertAssigneeActiveMember: deps.assertAssigneeActiveMember,
      });
      const created = await repository.createCard(projectId, {
        id: deps.newCardId(),
        listId: c.req.param("list_id"),
        title: body.title,
        subtitle: body.subtitle ?? null,
        description: body.description ?? null,
        dueDate: body.dueDate ?? null,
        assigneeUserId: body.assignee,
        actorUserId: ctx.userId,
      });
      return { card: cardPayload(created) };
    }, 201, deps.idempotencyStore);
  });

  router.get("/v1/projects/:project_id/lists/:list_id/cards", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      const repository = new DrizzleCardRepository(ctx.database, {
        assertAssigneeActiveMember: deps.assertAssigneeActiveMember,
      });
      const listId = c.req.param("list_id");
      const records = await repository.listCards(listId);
      const path = await loadEntityHierarchy(ctx.database, "list", listId);
      const effective = await ctx.effectiveFor(path ?? { listId });
      if (!hasPermission(effective, "card.read")) {
        return { cards: [] }; // anti-enumeration: list kosong, bukan error
      }
      const isVisible = resolveCardVisibilityFilter(effective, ctx.userId);
      const visible = records.filter((r) => isVisible({ creatorUserId: r.creatorUserId, assigneeUserId: r.assigneeUserId }));
      const labelsByCard = await listCardLabelsForCards(ctx.database, visible.map((r) => r.id));
      return { cards: visible.map((record) => cardPayload(record, labelsByCard.get(record.id) ?? [])) };
    });
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
      // D.3/A.11 — visibility dicek SETELAH existence; tersembunyi → 404 identik
      // dengan tidak-ada (anti-enumeration, konsisten BR-054A).
      const path = await loadEntityHierarchy(ctx.database, "card", record.id);
      const effective = await ctx.effectiveFor(path ?? { cardId: record.id });
      // AC-006/AC-007 — tanpa grant card.read apapun (termasuk creator/assignee),
      // baca ditolak: status creator/assignee TIDAK otomatis memberi read.
      if (!hasPermission(effective, "card.read")) {
        throw new PipelineError(
          "RESOURCE_NOT_FOUND",
          `Card ${c.req.param("card_id")} tidak ditemukan.`,
          404,
        );
      }
      const isVisible = resolveCardVisibilityFilter(effective, ctx.userId);
      if (!isVisible({ creatorUserId: record.creatorUserId, assigneeUserId: record.assigneeUserId })) {
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
    return withIdempotentHandling(c, getDeps(), async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      await authorize(ctx, "card.update", projectId, { type: "card", id: c.req.param("card_id") });
      const rawBody = readJsonObject(await c.req.json().catch(() => null));
      const body = parseBody(cardPatchSchema, rawBody);
      const allowedFields = ["title", "subtitle", "description", "dueDate", "assignee"] as const;
      for (const key of Object.keys(rawBody)) {
        if (!(allowedFields as readonly string[]).includes(key) && key !== "expectedVersion") {
          throw new PipelineError(
            "VALIDATION_ERROR",
            `Field '${key}' tidak dapat diubah via PATCH Card${key === "listId" ? " — move wajib via /cards/:id/move (BR-017)" : " (C.15)"}.`,
            400,
          );
        }
      }
      const repository = new DrizzleCardRepository(ctx.database, {
        assertAssigneeActiveMember: deps.assertAssigneeActiveMember,
      });
      const updated = await repository.updateCard(projectId, {
        cardId: c.req.param("card_id"),
        expectedVersion: body.expectedVersion,
        actorUserId: ctx.userId,
        ...(body.title === undefined ? {} : { title: body.title }),
        subtitle: body.subtitle,
        description: body.description,
        dueDate: body.dueDate,
        ...(body.assignee === undefined ? {} : { assigneeUserId: body.assignee }),
      });
      return { card: cardPayload(updated) };
    }, 200, getDeps().idempotencyStore);
  });

  router.post("/v1/projects/:project_id/cards/:card_id/move", async (c) => {
    const deps = getDeps();
    return withIdempotentHandling(c, getDeps(), async () => {
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      // BR-044 — card.move permission terpisah dari card.update; interim Owner-only.
      await authorize(ctx, "card.move", projectId, { type: "card", id: c.req.param("card_id") });
      const body = readJsonObject(await c.req.json().catch(() => null));
      for (const key of Object.keys(body)) {
        if (key !== "destinationListId" && key !== "expectedVersion") {
          throw new PipelineError(
            "VALIDATION_ERROR",
            `Field '${key}' tidak dikenal pada payload move (C.8).`,
            400,
          );
        }
      }
      const { destinationListId, expectedVersion } = parseBody(cardMoveSchema, body);
      const repository = new DrizzleCardRepository(ctx.database, {
        assertAssigneeActiveMember: deps.assertAssigneeActiveMember,
      });
      // Seluruh validasi domain (urutan C.8, INV-MOVE, BR-018) di moveCard.
      const record = await repository.moveCard(projectId, {
        cardId: c.req.param("card_id"),
        destinationListId: destinationListId!,
        expectedVersion: expectedVersion!,
        actorUserId: ctx.userId,
      });
      return { card: cardPayload(record) };
    }, 200, deps.idempotencyStore);
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
      const deps = getDeps();
      return withIdempotentHandling(c, getDeps(), async () => {
        const projectId = c.req.param("project_id");
        const ctx = await deps.openProjectContext(c.req.raw, projectId);
        await authorize(ctx, `card.${action}`, projectId, { type: "card", id: c.req.param("card_id") });
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
      }, 200, deps.idempotencyStore);
    });
  }

  return router;
}
