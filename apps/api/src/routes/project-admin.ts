import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ok } from "@kanban/contracts";
import {
  PipelineError,
  ResolveIdentityStep,
  type PermissionGroupSummary,
  type ResolvedIdentity,
} from "@kanban/infrastructure";
import { toApiErrorResponse } from "./projects.ts";

// Router untuk endpoint admin Project yang seluruh datanya di Global DB
// (permission groups, assignments, invitations, members) — 02-SPEC C.12/C.13.
// Otorisasi interim Phase 1 ditegakkan di lapisan operasi infrastruktur:
// mutasi Owner-only, read member aktif (lihat CL-25).

export interface CreatePermissionGroupPayload {
  name: string;
  description: string | null;
  permissions: Array<{ permissionId: string; cardReadVisibility?: string | null }>;
}

export interface ProjectAdminRoutesDeps {
  resolveIdentity(request: Request): Promise<ResolvedIdentity | null>;
  listPermissionGroups(
    projectId: string,
    requesterUserId: string,
    opts: { includeDeleted: boolean },
  ): Promise<PermissionGroupSummary[]>;
  // Otorisasi dieksplisitkan terpisah agar route dapat menegakkan
  // "authorization first" sebelum validasi body (Implementation Rule 3).
  assertProjectOwner(projectId: string, requesterUserId: string): Promise<void>;
  createPermissionGroup(projectId: string, input: CreatePermissionGroupPayload): Promise<PermissionGroupSummary>;
}

const MAX_GROUP_NAME_LENGTH = 255;

function readCreateGroupBody(body: unknown): CreatePermissionGroupPayload {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PipelineError("INVALID_STATE", "Body request wajib objek JSON.", 409);
  }
  const raw = body as Record<string, unknown>;
  const rawName = raw.name;
  if (typeof rawName !== "string") throw new PipelineError("INVALID_STATE", "Field name wajib string.", 409);
  const name = rawName.trim();
  if (name.length === 0) throw new PipelineError("INVALID_STATE", "Field name tidak boleh kosong.", 409);
  if (name.length > MAX_GROUP_NAME_LENGTH) {
    throw new PipelineError("INVALID_STATE", `Field name maksimal ${MAX_GROUP_NAME_LENGTH} karakter.`, 409);
  }
  let description: string | null = null;
  if (raw.description !== undefined && raw.description !== null) {
    if (typeof raw.description !== "string") throw new PipelineError("INVALID_STATE", "Field description wajib string atau null.", 409);
    description = raw.description.trim();
  }
  const VISIBILITIES = ["CREATED_BY_ME", "ASSIGNED_TO_ME", "ALL"];
  const rawPermissions = raw.permissions ?? [];
  if (!Array.isArray(rawPermissions)) throw new PipelineError("INVALID_STATE", "Field permissions wajib array.", 409);
  const seen = new Set<string>();
  const permissionList = rawPermissions.map((entry) => {
    if (typeof entry !== "object" || entry === null) {
      throw new PipelineError("INVALID_STATE", "Item permissions wajib objek.", 409);
    }
    const item = entry as Record<string, unknown>;
    const permissionId = item.permission_id;
    if (typeof permissionId !== "string" || permissionId.length === 0) {
      throw new PipelineError("INVALID_STATE", "Field permission_id wajib string non-kosong.", 409);
    }
    if (seen.has(permissionId)) {
      throw new PipelineError("INVALID_STATE", `permission_id duplikat: ${permissionId}`, 409);
    }
    seen.add(permissionId);
    const visibility = item.card_read_visibility;
    if (visibility !== undefined && visibility !== null &&
        (typeof visibility !== "string" || !VISIBILITIES.includes(visibility))) {
      throw new PipelineError("INVALID_STATE", `card_read_visibility tidak valid: ${String(visibility)}`, 409);
    }
    return {
      permissionId,
      cardReadVisibility: typeof visibility === "string" ? visibility : null,
    };
  });
  return { name, description, permissions: permissionList };
}

export function createProjectAdminRouter(getDeps: () => ProjectAdminRoutesDeps): Hono {
  const router = new Hono().basePath("/api");

  router.get("/v1/projects/:project_id/permission-groups", async (c) => {
    try {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      // Default exclude soft-deleted; ?include_deleted=true untuk minta eksplisit.
      const includeDeleted = c.req.query("include_deleted") === "true";
      const groups = await deps.listPermissionGroups(projectId, identity.userId, { includeDeleted });
      return c.json(ok({ groups }));
    } catch (error) {
      const mapped = toApiErrorResponse(error);
      return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    }
  });

  router.post("/v1/projects/:project_id/permission-groups", async (c) => {
    try {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      // Authorization first (Implementation Rule 3): Owner-only interim.
      await deps.assertProjectOwner(projectId, identity.userId);
      const payload = readCreateGroupBody(await c.req.json().catch(() => null));
      const group = await deps.createPermissionGroup(projectId, payload);
      return c.json(ok({ group }), 201);
    } catch (error) {
      const mapped = toApiErrorResponse(error);
      return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    }
  });

  return router;
}
