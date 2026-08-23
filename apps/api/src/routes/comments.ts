import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ok } from "@kanban/contracts";
import {
  addComment,
  editComment,
  PipelineError,
  type CardCommentRecord,
  type EditCommentRecord,
  type ResolvedIdentity,
} from "@kanban/infrastructure";
import { authorize, readJsonObject, toApiErrorResponse, type OpenProjectContext } from "./projects.ts";

export interface CommentRoutesDeps {
  resolveIdentity(request: Request): Promise<ResolvedIdentity | null>;
  openProjectContext(request: Request, projectId: string): Promise<OpenProjectContext>;
}

function commentPayload(record: CardCommentRecord) {
  return {
    id: record.id,
    cardId: record.cardId,
    entityVersion: record.entityVersion,
    actorUserId: record.actorUserId,
    body: record.body,
    commentActivityId: record.commentActivityId,
    createdAt: record.createdAt,
  };
}

function editedCommentPayload(record: EditCommentRecord) {
  return {
    id: record.id,
    cardId: record.cardId,
    entityVersion: record.entityVersion,
    actorUserId: record.actorUserId,
    before: record.before,
    after: record.after,
    commentActivityId: record.commentActivityId,
    createdAt: record.createdAt,
  };
}

function readBodyField(body: unknown): string {
  const raw = readJsonObject(body).body;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new PipelineError("VALIDATION_ERROR", "Field body wajib string non-kosong.", 400);
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

// C.10 — Comment adalah Activity Card (BR-030), TIDAK ada tabel Comment
// terpisah, TIDAK ada DELETE. Otorisasi Owner-only interim (Prinsip #2);
// permission card.comment sudah ada di katalog sejak Phase 1.
export function createCommentsRouter(getDeps: () => CommentRoutesDeps): Hono {
  const router = new Hono();

  router.post("/v1/projects/:project_id/cards/:card_id/comments", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      await authorize(ctx, "card.comment", projectId, { type: "card", id: c.req.param("card_id") });
      const body = readBodyField(await c.req.json().catch(() => null));
      const created = await addComment(ctx.database, c.req.param("card_id"), body, ctx.userId);
      return { comment: commentPayload(created) };
    }, 201);
  });

  router.patch("/v1/projects/:project_id/cards/:card_id/comments/:activity_id", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      await authorize(ctx, "card.comment.update", projectId, { type: "card", id: c.req.param("card_id") });
      const body = readBodyField(await c.req.json().catch(() => null));
      const edited = await editComment(
        ctx.database,
        c.req.param("card_id"),
        c.req.param("activity_id"),
        body,
        ctx.userId,
      );
      return { comment: editedCommentPayload(edited) };
    });
  });

  return router;
}
