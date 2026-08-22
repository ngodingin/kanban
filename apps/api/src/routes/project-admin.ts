import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ok } from "@kanban/contracts";
import {
  PipelineError,
  ResolveIdentityStep,
  type AcceptInvitationResult,
  type GroupAssignmentSummary,
  type InvitationSummary,
  type PermissionAssignmentSummary,
  type PermissionGroupSummary,
  type ProjectMemberSummary,
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

export interface UpdatePermissionGroupPayload {
  name?: string;
  description?: string | null;
  permissions?: Array<{ permissionId: string; cardReadVisibility?: string | null }>;
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
  requireActiveMember(projectId: string, requesterUserId: string): Promise<void>;
  createPermissionGroup(projectId: string, input: CreatePermissionGroupPayload): Promise<PermissionGroupSummary>;
  updatePermissionGroup(
    projectId: string,
    groupId: string,
    input: UpdatePermissionGroupPayload,
  ): Promise<PermissionGroupSummary>;
  deletePermissionGroup(projectId: string, groupId: string): Promise<PermissionGroupSummary>;
  createGroupAssignment(
    projectId: string,
    membershipId: string,
    input: { groupId: string; scopeType: string; scopeId: string },
  ): Promise<GroupAssignmentSummary>;
  revokeGroupAssignment(
    projectId: string,
    membershipId: string,
    assignmentId: string,
  ): Promise<GroupAssignmentSummary>;
  createPermissionAssignment(
    projectId: string,
    membershipId: string,
    input: { permissionId: string; scopeType: string; scopeId: string; cardReadVisibility?: string | null },
  ): Promise<PermissionAssignmentSummary>;
  revokePermissionAssignment(
    projectId: string,
    membershipId: string,
    assignmentId: string,
  ): Promise<PermissionAssignmentSummary>;
  createInvitation(
    projectId: string,
    invitedByUserId: string,
    input: {
      email: string;
      assignments: Array<{ groupId: string; scopeType: string; scopeId: string }>;
      expiresAt?: string | null;
    },
  ): Promise<InvitationSummary>;
  acceptInvitation(invitationId: string, userId: string): Promise<AcceptInvitationResult>;
  listMembers(
    projectId: string,
    requesterUserId: string,
    opts: { status?: Array<"active" | "revoked"> },
  ): Promise<ProjectMemberSummary[]>;
}

const MAX_GROUP_NAME_LENGTH = 255;

function readPermissionEntries(rawPermissions: unknown): Array<{ permissionId: string; cardReadVisibility?: string | null }> {
  if (!Array.isArray(rawPermissions)) throw new PipelineError("INVALID_STATE", "Field permissions wajib array.", 409);
  const VISIBILITIES = ["CREATED_BY_ME", "ASSIGNED_TO_ME", "ALL"];
  const seen = new Set<string>();
  return rawPermissions.map((entry) => {
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
}

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
  return { name, description, permissions: readPermissionEntries(raw.permissions ?? []) };
}

// Minimal satu field harus hadir; field tak dikenal ditolak agar client tidak
// mengira field lain ikut berubah (C.15 semangat: PATCH terkontrol).
function readUpdateGroupBody(body: unknown): UpdatePermissionGroupPayload {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PipelineError("INVALID_STATE", "Body request wajib objek JSON.", 409);
  }
  const raw = body as Record<string, unknown>;
  const allowed = ["name", "description", "permissions"];
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) {
      throw new PipelineError("INVALID_STATE", `Field tidak dikenal: ${key}`, 409);
    }
  }
  const payload: UpdatePermissionGroupPayload = {};
  if (raw.name !== undefined) {
    if (typeof raw.name !== "string" || raw.name.trim().length === 0 || raw.name.trim().length > MAX_GROUP_NAME_LENGTH) {
      throw new PipelineError("INVALID_STATE", "Field name wajib string 1..255 karakter.", 409);
    }
    payload.name = raw.name.trim();
  }
  if (raw.description !== undefined) {
    if (raw.description !== null && typeof raw.description !== "string") {
      throw new PipelineError("INVALID_STATE", "Field description wajib string atau null.", 409);
    }
    payload.description = raw.description === null ? null : (raw.description as string).trim();
  }
  if (raw.permissions !== undefined) {
    payload.permissions = readPermissionEntries(raw.permissions);
  }
  if (payload.name === undefined && payload.description === undefined && payload.permissions === undefined) {
    throw new PipelineError("INVALID_STATE", "Minimal satu field (name/description/permissions) wajib ada.", 409);
  }
  return payload;
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

  router.patch("/v1/projects/:project_id/permission-groups/:group_id", async (c) => {
    try {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const groupId = c.req.param("group_id");
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      // Authorization first (Implementation Rule 3): Owner-only interim.
      await deps.assertProjectOwner(projectId, identity.userId);
      const payload = readUpdateGroupBody(await c.req.json().catch(() => null));
      const group = await deps.updatePermissionGroup(projectId, groupId, payload);
      return c.json(ok({ group }));
    } catch (error) {
      const mapped = toApiErrorResponse(error);
      return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    }
  });

  router.post("/v1/projects/:project_id/permission-groups/:group_id/delete", async (c) => {
    try {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const groupId = c.req.param("group_id");
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      // Authorization first (Implementation Rule 3): Owner-only interim.
      await deps.assertProjectOwner(projectId, identity.userId);
      const group = await deps.deletePermissionGroup(projectId, groupId);
      return c.json(ok({ group }));
    } catch (error) {
      const mapped = toApiErrorResponse(error);
      return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    }
  });

  router.post("/v1/projects/:project_id/members/:membership_id/group-assignments", async (c) => {
    try {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const membershipId = c.req.param("membership_id");
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      // Authorization first (Implementation Rule 3): Owner-only interim.
      await deps.assertProjectOwner(projectId, identity.userId);
      const raw = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
      if (typeof raw !== "object" || raw === null) {
        throw new PipelineError("INVALID_STATE", "Body request wajib objek JSON.", 409);
      }
      const groupId = raw.group_id;
      const scopeType = raw.scope_type;
      const scopeId = raw.scope_id;
      if (typeof groupId !== "string" || groupId.length === 0) {
        throw new PipelineError("INVALID_STATE", "Field group_id wajib string non-kosong.", 409);
      }
      if (typeof scopeType !== "string" || scopeType.length === 0) {
        throw new PipelineError("INVALID_STATE", "Field scope_type wajib string non-kosong.", 409);
      }
      if (typeof scopeId !== "string" || scopeId.length === 0) {
        throw new PipelineError("INVALID_STATE", "Field scope_id wajib string non-kosong.", 409);
      }
      const assignment = await deps.createGroupAssignment(projectId, membershipId, { groupId, scopeType, scopeId });
      return c.json(ok({ assignment }), 201);
    } catch (error) {
      const mapped = toApiErrorResponse(error);
      return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    }
  });

  router.post("/v1/projects/:project_id/members/:membership_id/group-assignments/:assignment_id/revoke", async (c) => {
    try {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      // Authorization first (Implementation Rule 3): Owner-only interim.
      await deps.assertProjectOwner(projectId, identity.userId);
      const assignment = await deps.revokeGroupAssignment(
        projectId,
        c.req.param("membership_id"),
        c.req.param("assignment_id"),
      );
      return c.json(ok({ assignment }));
    } catch (error) {
      const mapped = toApiErrorResponse(error);
      return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    }
  });

  router.post("/v1/projects/:project_id/members/:membership_id/permission-assignments", async (c) => {
    try {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const membershipId = c.req.param("membership_id");
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      // Authorization first (Implementation Rule 3): Owner-only interim.
      await deps.assertProjectOwner(projectId, identity.userId);
      const raw = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
      if (typeof raw !== "object" || raw === null) {
        throw new PipelineError("INVALID_STATE", "Body request wajib objek JSON.", 409);
      }
      const permissionId = raw.permission_id;
      const scopeType = raw.scope_type;
      const scopeId = raw.scope_id;
      const visibility = raw.card_read_visibility;
      if (typeof permissionId !== "string" || permissionId.length === 0) {
        throw new PipelineError("INVALID_STATE", "Field permission_id wajib string non-kosong.", 409);
      }
      if (typeof scopeType !== "string" || scopeType.length === 0) {
        throw new PipelineError("INVALID_STATE", "Field scope_type wajib string non-kosong.", 409);
      }
      if (typeof scopeId !== "string" || scopeId.length === 0) {
        throw new PipelineError("INVALID_STATE", "Field scope_id wajib string non-kosong.", 409);
      }
      if (visibility !== undefined && visibility !== null && typeof visibility !== "string") {
        throw new PipelineError("INVALID_STATE", "card_read_visibility wajib string atau null.", 409);
      }
      const assignment = await deps.createPermissionAssignment(projectId, membershipId, {
        permissionId,
        scopeType,
        scopeId,
        ...(visibility !== undefined ? { cardReadVisibility: visibility as string | null } : {}),
      });
      return c.json(ok({ assignment }), 201);
    } catch (error) {
      const mapped = toApiErrorResponse(error);
      return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    }
  });

  router.post("/v1/projects/:project_id/members/:membership_id/permission-assignments/:assignment_id/revoke", async (c) => {
    try {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      // Authorization first (Implementation Rule 3): Owner-only interim.
      await deps.assertProjectOwner(projectId, identity.userId);
      const assignment = await deps.revokePermissionAssignment(
        projectId,
        c.req.param("membership_id"),
        c.req.param("assignment_id"),
      );
      return c.json(ok({ assignment }));
    } catch (error) {
      const mapped = toApiErrorResponse(error);
      return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    }
  });

  router.post("/v1/projects/:project_id/invitations", async (c) => {
    try {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      // Authorization first (Implementation Rule 3): Owner-only interim.
      await deps.assertProjectOwner(projectId, identity.userId);
      const raw = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
      if (typeof raw !== "object" || raw === null) {
        throw new PipelineError("INVALID_STATE", "Body request wajib objek JSON.", 409);
      }
      if (raw.expires_at !== undefined && raw.expires_at !== null && typeof raw.expires_at !== "string") {
        throw new PipelineError("INVALID_STATE", "expires_at wajib string atau null.", 409);
      }
      if (!Array.isArray(raw.assignments)) {
        throw new PipelineError("INVALID_STATE", "Field assignments wajib array (minimal satu item — BR-051).", 409);
      }
      const assignments = raw.assignments.map((item) => {
        const entry = item as Record<string, unknown>;
        if (typeof entry.group_id !== "string" || entry.group_id.length === 0) {
          throw new PipelineError("INVALID_STATE", "Setiap assignment wajib memiliki group_id string non-kosong.", 409);
        }
        const scopeType = typeof entry.scope_type === "string" ? entry.scope_type : "project";
        const scopeId = typeof entry.scope_id === "string" ? entry.scope_id : projectId;
        return { groupId: entry.group_id, scopeType, scopeId };
      });
      const invitation = await deps.createInvitation(projectId, identity.userId, {
        email: typeof raw.email === "string" ? raw.email : "",
        assignments,
        ...(raw.expires_at !== undefined ? { expiresAt: raw.expires_at as string | null } : {}),
      });
      return c.json(ok({ invitation }), 201);
    } catch (error) {
      const mapped = toApiErrorResponse(error);
      return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    }
  });

  router.get("/v1/projects/:project_id/members", async (c) => {
    try {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      // Authorization first (Implementation Rule 3): member.read interim —
      // semua member aktif boleh melihat daftar membership.
      await deps.requireActiveMember(projectId, identity.userId);
      const statusParam = c.req.query("status");
      let status: Array<"active" | "revoked"> | undefined;
      if (statusParam !== undefined) {
        status = statusParam.split(",").map((s) => s.trim()).filter((s) => s.length > 0) as Array<"active" | "revoked">;
        for (const s of status) {
          if (s !== "active" && s !== "revoked") {
            throw new PipelineError("INVALID_STATE", `Nilai status '${s}' tidak valid (hanya 'active', 'revoked').`, 409);
          }
        }
      }
      const members = await deps.listMembers(projectId, identity.userId, { ...(status !== undefined ? { status } : {}) });
      return c.json(ok({ members }));
    } catch (error) {
      const mapped = toApiErrorResponse(error);
      return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    }
  });

  router.post("/v1/invitations/:invitation_id/accept", async (c) => {
    try {
      const deps = getDeps();
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      // Accept tidak Owner-only — pemanggil adalah invitee yang terautentikasi.
      const result = await deps.acceptInvitation(c.req.param("invitation_id"), identity.userId);
      return c.json(ok(result));
    } catch (error) {
      const mapped = toApiErrorResponse(error);
      return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    }
  });

  return router;
}
