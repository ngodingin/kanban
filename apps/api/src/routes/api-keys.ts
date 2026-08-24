import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ok } from "@kanban/contracts";
import {
  ResolveIdentityStep,
  type ApiKeySummary,
  type ResolvedIdentity,
} from "@kanban/infrastructure";
import { toApiErrorResponse, withIdempotentHandling, type IdempotencyStoreLike } from "./projects.ts";
import { parseCredentialBody, apiKeyCreateSchema } from "./core-schemas.ts";

export interface ApiKeysRoutesDeps {
  resolveIdentity(request: Request): Promise<ResolvedIdentity | null>;
  assertPermissionKey(projectId: string, requesterUserId: string, key: string): Promise<void>;
  createApiKey(input: {
    projectId: string;
    createdByUserId: string;
    name: string;
    expiresAt?: string | null;
  }): Promise<{ id: string; name: string; secret: string; expiresAt: string | null; createdAt: string }>;
  revokeApiKey(projectId: string, keyId: string): Promise<ApiKeySummary>;
  listApiKeys(projectId: string): Promise<ApiKeySummary[]>;
  idempotencyStore?: IdempotencyStoreLike;
}



async function withErrorHandling<T>(
  c: import("hono").Context,
  handler: () => Promise<T>,
  successStatus: ContentfulStatusCode = 200,
): Promise<Response> {
  try {
    const result = await handler();
    return c.json(ok(result), successStatus);
  } catch (error) {
    const response = toApiErrorResponse(error);
    return c.json(response.body, response.status as ContentfulStatusCode);
  }
}

export function createApiKeysRouter(getDeps: () => ApiKeysRoutesDeps): Hono {
  const router = new Hono();

  router.post("/v1/projects/:project_id/api-keys", async (c) =>
    withIdempotentHandling(c, getDeps(), async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const identity = await new ResolveIdentityStep({ resolveIdentity: deps.resolveIdentity }).run(c.req.raw);
      await deps.assertPermissionKey(projectId, identity.userId, "api_key.create");
      const body = parseCredentialBody(
        apiKeyCreateSchema,
        await c.req.json().catch(() => null),
        ["name", "expiresAt"],
      );
      const created = await deps.createApiKey({
        projectId,
        createdByUserId: identity.userId,
        name: body.name,
        ...(body.expiresAt ? { expiresAt: body.expiresAt } : {}),
      });
      return {
        apiKey: created,
      };
    }, 201, getDeps().idempotencyStore),
  );

  router.get("/v1/projects/:project_id/api-keys", async (c) =>
    withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const identity = await new ResolveIdentityStep({ resolveIdentity: deps.resolveIdentity }).run(c.req.raw);
      await deps.assertPermissionKey(projectId, identity.userId, "api_key.read");
      const keys = await deps.listApiKeys(projectId);
      return { apiKeys: keys };
    }),
  );

  router.post("/v1/projects/:project_id/api-keys/:key_id/revoke", async (c) =>
    withIdempotentHandling(c, getDeps(), async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const keyId = c.req.param("key_id");
      const identity = await new ResolveIdentityStep({ resolveIdentity: deps.resolveIdentity }).run(c.req.raw);
      await deps.assertPermissionKey(projectId, identity.userId, "api_key.revoke");
      const revoked = await deps.revokeApiKey(projectId, keyId);
      return { apiKey: revoked };
      }, 200, getDeps().idempotencyStore),
  );

  return router;
}
