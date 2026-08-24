import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ok } from "@kanban/contracts";
import {
  assignLabelToCard,
  PipelineError,
  removeLabelFromCard,
  type CardLabelAssociationRecord,
  type ResolvedIdentity,
} from "@kanban/infrastructure";
import { authorize, readJsonObject, toApiErrorResponse, type OpenProjectContext } from "./projects.ts";

export interface CardLabelRoutesDeps {
  resolveIdentity(request: Request): Promise<ResolvedIdentity | null>;
  openProjectContext(request: Request, projectId: string): Promise<OpenProjectContext>;
}

function associationPayload(record: CardLabelAssociationRecord) {
  return {
    cardId: record.cardId,
    labelId: record.labelId,
    labelScope: record.labelScope,
    labelName: record.labelName,
    createdAt: record.createdAt,
  };
}

function readLabelIdField(body: unknown): string {
  const raw = readJsonObject(body).labelId;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new PipelineError("VALIDATION_ERROR", "Field labelId wajib string non-kosong.", 400);
  }
  return raw;
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

// C.11 — assign/remove Label ke Card menumpang otorisasi card.update
// (Owner-only interim, Prinsip #4). BUKAN permission Label tersendiri.
export function createCardLabelsRouter(getDeps: () => CardLabelRoutesDeps): Hono {
  const router = new Hono();

  router.post("/v1/projects/:project_id/cards/:card_id/labels", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      await authorize(ctx, "card.update", projectId, { type: "card", id: c.req.param("card_id") });
      const labelId = readLabelIdField(await c.req.json().catch(() => null));
      const created = await assignLabelToCard(ctx.database, c.req.param("card_id"), labelId, ctx.userId);
      return { association: associationPayload(created) };
    }, 201);
  });

  router.post("/v1/projects/:project_id/cards/:card_id/labels/:label_id/remove", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      await authorize(ctx, "card.update", projectId, { type: "card", id: c.req.param("card_id") });
      const removed = await removeLabelFromCard(
        ctx.database,
        c.req.param("card_id"),
        c.req.param("label_id"),
        ctx.userId,
      );
      return { association: associationPayload(removed) };
    });
  });

  return router;
}
