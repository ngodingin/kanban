import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ok } from "@kanban/contracts";
import { listActivities, type ActivityRecord, type ListActivitiesFilters, type ResolvedIdentity, } from "@kanban/infrastructure";
import { toApiErrorResponse, type OpenProjectContext } from "./projects.ts";
export interface ActivityRoutesDeps {
    resolveIdentity(request: Request): Promise<ResolvedIdentity | null>;
    openProjectContext(request: Request, projectId: string): Promise<OpenProjectContext>;
}
function activityPayload(record: ActivityRecord) {
    return {
        id: record.id,
        entityType: record.entityType,
        entityId: record.entityId,
        entityVersion: record.entityVersion,
        actorUserId: record.actorUserId,
        action: record.action,
        data: record.data,
        createdAt: record.createdAt,
    };
}
async function withErrorHandling<T>(c: Context, handler: () => Promise<T>, successStatus: ContentfulStatusCode = 200): Promise<Response> {
    try {
        const result = await handler();
        return c.json(ok(result), successStatus);
    }
    catch (error) {
        const mapped = toApiErrorResponse(error);
        return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    }
}
function readOptionalQueryFilters(c: Context): ListActivitiesFilters {
    return {
        entityType: c.req.query("entity_type") ?? undefined,
        entityId: c.req.query("entity_id") ?? undefined,
        actor: c.req.query("actor") ?? undefined,
        action: c.req.query("action") ?? undefined,
        from: c.req.query("from") ?? undefined,
        to: c.req.query("to") ?? undefined,
    };
}
export function createActivitiesRouter(getDeps: () => ActivityRoutesDeps): Hono {
    const router = new Hono();
    router.get("/v1/projects/:project_id/activities", async (c) => {
        return withErrorHandling(c, async () => {
            const deps = getDeps();
            const projectId = c.req.param("project_id");
            const ctx = await deps.openProjectContext(c.req.raw, projectId);
            const records = await listActivities(ctx.database, readOptionalQueryFilters(c));
            return { activities: records.map(activityPayload) };
        });
    });
    const convenienceRoutes: Array<{
        path: string;
        entityType: string;
        param: string;
    }> = [
        { path: "cards", entityType: "card", param: "card_id" },
        { path: "milestones", entityType: "milestone", param: "milestone_id" },
        { path: "boards", entityType: "board", param: "board_id" },
        { path: "lists", entityType: "list", param: "list_id" },
    ];
    for (const route of convenienceRoutes) {
        router.get(`/v1/projects/:project_id/${route.path}/:${route.param}/activities`, async (c) => {
            return withErrorHandling(c, async () => {
                const deps = getDeps();
                const projectId = c.req.param("project_id");
                const ctx = await deps.openProjectContext(c.req.raw, projectId);
                const filters = readOptionalQueryFilters(c);
                const records = await listActivities(ctx.database, {
                    ...filters,
                    entityType: route.entityType,
                    entityId: c.req.param(route.param),
                });
                return { activities: records.map(activityPayload) };
            });
        });
    }
    return router;
}
