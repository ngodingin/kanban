import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { timingSafeEqual } from "node:crypto";
import { ok } from "@kanban/contracts";
import { PipelineError, type CombinedPruneSummary, } from "@kanban/infrastructure";
import { toApiErrorResponse } from "./projects.ts";
export interface InternalRoutesDeps {
    cronSecret: string | undefined;
    pruneAll: () => Promise<CombinedPruneSummary>;
}
function constantTimeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length)
        return false;
    return timingSafeEqual(bufA, bufB);
}
export function createInternalRouter(getDeps: () => InternalRoutesDeps): Hono {
    const router = new Hono();
    router.post("/internal/prune", async (c) => {
        try {
            const deps = getDeps();
            const header = c.req.header("authorization") ?? "";
            const match = /^Bearer\s+(.+)$/i.exec(header.trim());
            const provided = match?.[1]?.trim() ?? "";
            const expected = deps.cronSecret ?? "";
            if (expected.length === 0 || provided.length === 0 || !constantTimeEquals(provided, expected)) {
                throw new PipelineError("TOKEN_EXPIRED", "Unauthorized.", 401);
            }
            const summary = await deps.pruneAll();
            return c.json(ok(summary), 200 as ContentfulStatusCode);
        }
        catch (error) {
            const response = toApiErrorResponse(error);
            return c.json(response.body, response.status as ContentfulStatusCode);
        }
    });
    return router;
}
