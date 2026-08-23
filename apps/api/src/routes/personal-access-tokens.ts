import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ok } from "@kanban/contracts";
import {
  PipelineError,
  ResolveIdentityStep,
  type PersonalAccessTokenSummary,
  type ResolvedIdentity,
} from "@kanban/infrastructure";
import { toApiErrorResponse } from "./projects.ts";

export interface PersonalAccessTokensRoutesDeps {
  resolveIdentity(request: Request): Promise<ResolvedIdentity | null>;
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

  router.post("/api/v1/me/personal-access-tokens", async (c) =>
    withErrorHandling(c, async () => {
      const deps = getDeps();
      const identity = await new ResolveIdentityStep({ resolveIdentity: deps.resolveIdentity }).run(c.req.raw);
      const body = readJsonObject(await c.req.json().catch(() => null));
      for (const key of Object.keys(body)) {
        if (key !== "name" && key !== "expires_at") {
          throw new PipelineError("VALIDATION_ERROR", `Field '${key}' tidak dikenal.`, 400);
        }
      }
      const name = readNameField(body);
      const expiresAtRaw = body.expires_at;
      if (expiresAtRaw !== undefined && expiresAtRaw !== null && typeof expiresAtRaw !== "string") {
        throw new PipelineError("VALIDATION_ERROR", "expires_at wajib string ISO date-time.", 400);
      }
      const created = await deps.createPersonalAccessToken({
        userId: identity.userId,
        name,
        ...(expiresAtRaw ? { expiresAt: expiresAtRaw as string } : {}),
      });
      return { personal_access_token: created };
    }, 201),
  );

  router.get("/api/v1/me/personal-access-tokens", async (c) =>
    withErrorHandling(c, async () => {
      const deps = getDeps();
      const identity = await new ResolveIdentityStep({ resolveIdentity: deps.resolveIdentity }).run(c.req.raw);
      const tokens = await deps.listPersonalAccessTokens(identity.userId);
      return { personal_access_tokens: tokens };
    }),
  );

  router.post("/api/v1/me/personal-access-tokens/:token_id/revoke", async (c) =>
    withErrorHandling(c, async () => {
      const deps = getDeps();
      const identity = await new ResolveIdentityStep({ resolveIdentity: deps.resolveIdentity }).run(c.req.raw);
      const revoked = await deps.revokePersonalAccessToken(identity.userId, c.req.param("token_id"));
      return { personal_access_token: revoked };
    }),
  );

  return router;
}
