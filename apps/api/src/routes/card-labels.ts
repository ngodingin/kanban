import { Hono } from "hono";
import { assignLabelToCard, PipelineError, removeLabelFromCard, type CardLabelAssociationRecord, type ResolvedIdentity, } from "@kanban/infrastructure";
import { authorize, readJsonObject, ValidationCollector, type OpenProjectContext, withIdempotentHandling, type IdempotencyStoreLike, } from "./projects.ts";
export interface CardLabelRoutesDeps {
    resolveIdentity(request: Request): Promise<ResolvedIdentity | null>;
    idempotencyStore?: IdempotencyStoreLike;
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
export function createCardLabelsRouter(getDeps: () => CardLabelRoutesDeps): Hono {
    const router = new Hono();
    router.post("/v1/projects/:project_id/cards/:card_id/labels", async (c) => {
        return withIdempotentHandling(c, getDeps(), async () => {
            const deps = getDeps();
            const projectId = c.req.param("project_id");
            const ctx = await deps.openProjectContext(c.req.raw, projectId);
            await authorize(ctx, "card.update", projectId, { type: "card", id: c.req.param("card_id") });
            const rawBody = await c.req.json().catch(() => null);
            const collector = new ValidationCollector();
            const labelId = collector.collect("labelId", () => readLabelIdField(rawBody));
            collector.throwIfAny();
            const created = await assignLabelToCard(ctx.database, c.req.param("card_id"), labelId!, ctx.userId);
            return { association: associationPayload(created) };
        }, 201, getDeps().idempotencyStore);
    });
    router.post("/v1/projects/:project_id/cards/:card_id/labels/:label_id/remove", async (c) => {
        return withIdempotentHandling(c, getDeps(), async () => {
            const deps = getDeps();
            const projectId = c.req.param("project_id");
            const ctx = await deps.openProjectContext(c.req.raw, projectId);
            await authorize(ctx, "card.update", projectId, { type: "card", id: c.req.param("card_id") });
            const removed = await removeLabelFromCard(ctx.database, c.req.param("card_id"), c.req.param("label_id"), ctx.userId);
            return { association: associationPayload(removed) };
        }, 200, getDeps().idempotencyStore);
    });
    return router;
}
