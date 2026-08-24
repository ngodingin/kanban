import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ok } from "@kanban/contracts";
import {
  PipelineError,
  ResolveIdentityStep,
  type PersonalAccessTokenSummary,
  type ResolvedIdentity,
} from "@kanban/infrastructure";
import { toApiErrorResponse, ValidationCollector, withIdempotentHandling, type IdempotencyStoreLike } from "./projects.ts";

export interface PersonalAccessTokensRoutesDeps {
  resolveIdentity(request: Request): Promise<ResolvedIdentity | null>;
  idempotencyStore?: IdempotencyStoreLike;
  createPersonalAccessToken(input: {
    userId: string;
    name: string;
    expiresAt?: string | null;
  }): Promise<{ id: string; name: string; token: string; expiresAt: string | null; createdAt: string }>;
  revokePersonalAccessToken(userId: string, tokenId: string): Promise<PersonalAccessTokenSummary>;
  listPersonalAccessTokens(userId: string): Promise<PersonalAccessTokenSummary[]>;
}

function readJsonObject(raw: unknown): Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new PipelineError("VALIDATION_ERROR", "Body wajib JSON object.", 400);
  }
  return raw as Record<string, unknown>;
}

function readNameField(body: Record<string, unknown>): string {
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

/**
 * PAT self-managed (TASK-4.8, C.14/FR-052): User kelola PAT MILIKNYA
 * SELALU — bukan grant Permission Group; TIDAK ada key `pat.*` di D.1.
 */
export function createPersonalAccessTokensRouter(getDeps: () => PersonalAccessTokensRoutesDeps): Hono {
  const router = new Hono();

  router.post("/v1/me/personal-access-tokens", async (c) =>
    withIdempotentHandling(c, getDeps(), async () => {
      const deps = getDeps();
      const identity = await new ResolveIdentityStep({ resolveIdentity: deps.resolveIdentity }).run(c.req.raw);
      const body = readJsonObject(await c.req.json().catch(() => null));
      const collector = new ValidationCollector();
      const name = collector.collect("name", () => readNameField(body));
      const expiresAtRaw = collector.collect("expiresAt", () => {
        if (body.expiresAt !== undefined && body.expiresAt !== null && typeof body.expiresAt !== "string") {
          throw new PipelineError("VALIDATION_ERROR", "expiresAt wajib string ISO date-time.", 400);
        }
        return body.expiresAt as string | null | undefined;
      });
      // C.2.1 — unknown fields collect-all.
      for (const key of Object.keys(body)) {
        if (key !== "name" && key !== "expiresAt") {
          collector.collect(`unknownField:${key}`, () => {
            throw new PipelineError("VALIDATION_ERROR", `Field '${key}' tidak dikenal.`, 400);
          });
        }
      }
      collector.throwIfAny();
      const created = await deps.createPersonalAccessToken({
        userId: identity.userId,
        name: name!,
        ...(expiresAtRaw ? { expiresAt: expiresAtRaw } : {}),
      });
      return { personalAccessToken: created };
    }, 201, getDeps().idempotencyStore),
  );

  router.get("/v1/me/personal-access-tokens", async (c) =>
    withErrorHandling(c, async () => {
      const deps = getDeps();
      const identity = await new ResolveIdentityStep({ resolveIdentity: deps.resolveIdentity }).run(c.req.raw);
      const tokens = await deps.listPersonalAccessTokens(identity.userId);
      return { personalAccessTokens: tokens };
    }),
  );

  router.post("/v1/me/personal-access-tokens/:token_id/revoke", async (c) =>
    withIdempotentHandling(c, getDeps(), async () => {
      const deps = getDeps();
      const identity = await new ResolveIdentityStep({ resolveIdentity: deps.resolveIdentity }).run(c.req.raw);
      const revoked = await deps.revokePersonalAccessToken(identity.userId, c.req.param("token_id"));
      return { personalAccessToken: revoked };
      }, 200, getDeps().idempotencyStore),
  );

  return router;
}
