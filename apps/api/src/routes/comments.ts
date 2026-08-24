import { Hono } from "hono";
import {
  addComment,
  editComment,
  PipelineError,
  type CardCommentRecord,
  type EditCommentRecord,
  type ResolvedIdentity,
} from "@kanban/infrastructure";
import { authorize, readJsonObject, type OpenProjectContext,
  withIdempotentHandling, type IdempotencyStoreLike,
} from "./projects.ts";
import { parseBody, commentCreateSchema } from "./core-schemas.ts";

export interface CommentRoutesDeps {
  resolveIdentity(request: Request): Promise<ResolvedIdentity | null>;
  idempotencyStore?: IdempotencyStoreLike;
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



// C.10 — Comment adalah Activity Card (BR-030), TIDAK ada tabel Comment
// terpisah, TIDAK ada DELETE. Otorisasi Owner-only interim (Prinsip #2);
// permission card.comment sudah ada di katalog sejak Phase 1.
export function createCommentsRouter(getDeps: () => CommentRoutesDeps): Hono {
  const router = new Hono();

  router.post("/v1/projects/:project_id/cards/:card_id/comments", async (c) => {
    return withIdempotentHandling(c, getDeps(), async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      await authorize(ctx, "card.comment", projectId, { type: "card", id: c.req.param("card_id") });
      const rawBody = await c.req.json().catch(() => null);
      const { body } = parseBody(commentCreateSchema, rawBody);
      const created = await addComment(ctx.database, c.req.param("card_id"), body, ctx.userId);
      return { comment: commentPayload(created) };
    }, 201, getDeps().idempotencyStore);
  });

  router.patch("/v1/projects/:project_id/cards/:card_id/comments/:activity_id", async (c) => {
    return withIdempotentHandling(c, getDeps(), async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const ctx = await deps.openProjectContext(c.req.raw, projectId);
      await authorize(ctx, "card.comment.update", projectId, { type: "card", id: c.req.param("card_id") });
      const rawBody = await c.req.json().catch(() => null);
      const { body } = parseBody(commentCreateSchema, rawBody);
      const edited = await editComment(
        ctx.database,
        c.req.param("card_id"),
        c.req.param("activity_id"),
        body!,
        ctx.userId,
      );
      return { comment: editedCommentPayload(edited) };
    }, 200, getDeps().idempotencyStore);
  });

  return router;
}
