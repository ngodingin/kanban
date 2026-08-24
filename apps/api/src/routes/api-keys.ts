import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ok } from "@kanban/contracts";
import {
  PipelineError,
  ResolveIdentityStep,
  type ApiKeySummary,
  type ResolvedIdentity,
} from "@kanban/infrastructure";
import { toApiErrorResponse, ValidationCollector, withIdempotentHandling, type IdempotencyStoreLike } from "./projects.ts";

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

interface Body {
  [key: string]: unknown;
}

function readJsonObject(raw: unknown): Body {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new PipelineError("VALIDATION_ERROR", "Body wajib JSON object.", 400);
  }
  return raw as Body;
}

function readNameField(body: Body): string {
  const name = body.name;
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new PipelineError("VALIDATION_ERROR", "Field name wajib string non-kosong.", 400);
  }
  return name;
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
      const body = readJsonObject(await c.req.json().catch(() => null));
      const collector = new ValidationCollector();
      const name = collector.collect("name", () => readNameField(body));
      const expiresAtRaw = collector.collect("expiresAt", () => {
        if (body.expiresAt !== undefined && body.expiresAt !== null && typeof body.expiresAt !== "string") {
          throw new PipelineError("VALIDATION_ERROR", "expiresAt wajib string ISO date-time.", 400);
        }
        return body.expiresAt as string | null | undefined;
      });
      // C.2.1 — field tak dikenal ikut dikumpulkan collect-all, bukan fail-fast.
      for (const key of Object.keys(body)) {
        if (key !== "name" && key !== "expiresAt") {
          collector.collect(`unknownField:${key}`, () => {
            throw new PipelineError("VALIDATION_ERROR", `Field '${key}' tidak dikenal.`, 400);
          });
        }
      }
      collector.throwIfAny();
      const created = await deps.createApiKey({
        projectId,
        createdByUserId: identity.userId,
        name: name!,
        ...(expiresAtRaw ? { expiresAt: expiresAtRaw } : {}),
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
