import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ok } from "@kanban/contracts";
import {
  PipelineError,
  ResolveIdentityStep,
  type AcceptInvitationResult,
  type GroupAssignmentSummary,
  type MembershipAssignmentsList,
  type InvitationSummary,
  type InvitationListSummary,
  type PermissionAssignmentSummary,
  type PermissionGroupSummary,
  type ProjectMemberSummary,
  type ResolvedIdentity,
} from "@kanban/infrastructure";
import { toApiErrorResponse } from "./projects.ts";

// Wrapper untuk mengurangi duplikasi try/catch di semua handler endpoint.
async function withErrorHandling<T>(
  c: Context,
  handler: () => Promise<T>,
  successStatus: ContentfulStatusCode = 200,
): Promise<Response> {
  try {
    return c.json(ok(await handler()), successStatus);
  } catch (error) {
    const mapped = toApiErrorResponse(error);
    return c.json(mapped.body, mapped.status as ContentfulStatusCode);
  }
}

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
  acceptInvitation(invitationId: string, userId: string, userEmail: string): Promise<AcceptInvitationResult>;
  listMembers(
    projectId: string,
    requesterUserId: string,
    opts: { status?: Array<"active" | "revoked"> },
  ): Promise<ProjectMemberSummary[]>;
  assertPermissionKey(projectId: string, requesterUserId: string, key: string): Promise<void>;
  listMembershipAssignments(
    projectId: string,
    membershipId: string,
  ): Promise<MembershipAssignmentsList | null>;
  revokeMembership(projectId: string, membershipId: string, actorUserId?: string): Promise<ProjectMemberSummary>;
  listProjectInvitations(projectId: string): Promise<InvitationListSummary[]>;
  revokeInvitation(projectId: string, invitationId: string): Promise<InvitationListSummary>;
}

const MAX_GROUP_NAME_LENGTH = 255;

function readPermissionEntries(rawPermissions: unknown): Array<{ permissionId: string; cardReadVisibility?: string | null }> {
  if (!Array.isArray(rawPermissions)) throw new PipelineError("VALIDATION_ERROR", "Field permissions wajib array.", 400);
  const VISIBILITIES = ["CREATED_BY_ME", "ASSIGNED_TO_ME", "ALL"];
  const seen = new Set<string>();
  return rawPermissions.map((entry) => {
    if (typeof entry !== "object" || entry === null) {
      throw new PipelineError("VALIDATION_ERROR", "Item permissions wajib objek.", 400);
    }
    const item = entry as Record<string, unknown>;
    const permissionId = item.permission_id;
    if (typeof permissionId !== "string" || permissionId.length === 0) {
      throw new PipelineError("VALIDATION_ERROR", "Field permission_id wajib string non-kosong.", 400);
    }
    if (seen.has(permissionId)) {
      throw new PipelineError("VALIDATION_ERROR", `permission_id duplikat: ${permissionId}`, 400);
    }
    seen.add(permissionId);
    const visibility = item.card_read_visibility;
    if (visibility !== undefined && visibility !== null &&
        (typeof visibility !== "string" || !VISIBILITIES.includes(visibility))) {
      throw new PipelineError("VALIDATION_ERROR", `card_read_visibility tidak valid: ${String(visibility)}`, 400);
    }
    return {
      permissionId,
      cardReadVisibility: typeof visibility === "string" ? visibility : null,
    };
  });
}

function readCreateGroupBody(body: unknown): CreatePermissionGroupPayload {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PipelineError("VALIDATION_ERROR", "Body request wajib objek JSON.", 400);
  }
  const raw = body as Record<string, unknown>;
  const rawName = raw.name;
  if (typeof rawName !== "string") throw new PipelineError("VALIDATION_ERROR", "Field name wajib string.", 400);
  const name = rawName.trim();
  if (name.length === 0) throw new PipelineError("VALIDATION_ERROR", "Field name tidak boleh kosong.", 400);
  if (name.length > MAX_GROUP_NAME_LENGTH) {
    throw new PipelineError("VALIDATION_ERROR", `Field name maksimal ${MAX_GROUP_NAME_LENGTH} karakter.`, 400);
  }
  let description: string | null = null;
  if (raw.description !== undefined && raw.description !== null) {
    if (typeof raw.description !== "string") throw new PipelineError("VALIDATION_ERROR", "Field description wajib string atau null.", 400);
    description = raw.description.trim();
  }
  return { name, description, permissions: readPermissionEntries(raw.permissions ?? []) };
}

// Minimal satu field harus hadir; field tak dikenal ditolak agar client tidak
// mengira field lain ikut berubah (C.15 semangat: PATCH terkontrol).
function readUpdateGroupBody(body: unknown): UpdatePermissionGroupPayload {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PipelineError("VALIDATION_ERROR", "Body request wajib objek JSON.", 400);
  }
  const raw = body as Record<string, unknown>;
  const allowed = ["name", "description", "permissions"];
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) {
      throw new PipelineError("VALIDATION_ERROR", `Field tidak dikenal: ${key}`, 400);
    }
  }
  const payload: UpdatePermissionGroupPayload = {};
  if (raw.name !== undefined) {
    if (typeof raw.name !== "string" || raw.name.trim().length === 0 || raw.name.trim().length > MAX_GROUP_NAME_LENGTH) {
      throw new PipelineError("VALIDATION_ERROR", "Field name wajib string 1..255 karakter.", 400);
    }
    payload.name = raw.name.trim();
  }
  if (raw.description !== undefined) {
    if (raw.description !== null && typeof raw.description !== "string") {
      throw new PipelineError("VALIDATION_ERROR", "Field description wajib string atau null.", 400);
    }
    payload.description = raw.description === null ? null : (raw.description as string).trim();
  }
  if (raw.permissions !== undefined) {
    payload.permissions = readPermissionEntries(raw.permissions);
  }
  if (payload.name === undefined && payload.description === undefined && payload.permissions === undefined) {
    throw new PipelineError("VALIDATION_ERROR", "Minimal satu field (name/description/permissions) wajib ada.", 400);
  }
  return payload;
}

export function createProjectAdminRouter(getDeps: () => ProjectAdminRoutesDeps): Hono {
  const router = new Hono();

  router.get("/v1/projects/:project_id/permission-groups", (c) =>
    withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      // Default exclude soft-deleted; ?include_deleted=true untuk minta eksplisit.
      const includeDeleted = c.req.query("include_deleted") === "true";
      const groups = await deps.listPermissionGroups(projectId, identity.userId, { includeDeleted });
      return { groups };
    }),
  );

  router.post("/v1/projects/:project_id/permission-groups", (c) =>
    withErrorHandling(
      c,
      async () => {
        const deps = getDeps();
        const projectId = c.req.param("project_id");
        const identity = await new ResolveIdentityStep({
          resolveIdentity: deps.resolveIdentity,
        }).run(c.req.raw);
        // Authorization first (Implementation Rule 3): Owner-only interim.
        await deps.assertProjectOwner(projectId, identity.userId);
        const payload = readCreateGroupBody(await c.req.json().catch(() => null));
        const group = await deps.createPermissionGroup(projectId, payload);
        return { group };
      },
      201,
    ),
  );

  router.patch("/v1/projects/:project_id/permission-groups/:group_id", (c) =>
    withErrorHandling(c, async () => {
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
      return { group };
    }),
  );

  router.post("/v1/projects/:project_id/permission-groups/:group_id/delete", (c) =>
    withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const groupId = c.req.param("group_id");
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      // Authorization first (Implementation Rule 3): Owner-only interim.
      await deps.assertProjectOwner(projectId, identity.userId);
      const group = await deps.deletePermissionGroup(projectId, groupId);
      return { group };
    }),
  );

  router.post("/v1/projects/:project_id/members/:membership_id/group-assignments", (c) =>
    withErrorHandling(
      c,
      async () => {
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
          throw new PipelineError("VALIDATION_ERROR", "Body request wajib objek JSON.", 400);
        }
        const groupId = raw.group_id;
        const scopeType = raw.scope_type;
        const scopeId = raw.scope_id;
        if (typeof groupId !== "string" || groupId.length === 0) {
          throw new PipelineError("VALIDATION_ERROR", "Field group_id wajib string non-kosong.", 400);
        }
        if (typeof scopeType !== "string" || scopeType.length === 0) {
          throw new PipelineError("VALIDATION_ERROR", "Field scope_type wajib string non-kosong.", 400);
        }
        if (typeof scopeId !== "string" || scopeId.length === 0) {
          throw new PipelineError("VALIDATION_ERROR", "Field scope_id wajib string non-kosong.", 400);
        }
        const assignment = await deps.createGroupAssignment(projectId, membershipId, { groupId, scopeType, scopeId });
        return { assignment };
      },
      201,
    ),
  );

  router.post("/v1/projects/:project_id/members/:membership_id/group-assignments/:assignment_id/revoke", (c) =>
    withErrorHandling(c, async () => {
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
      return { assignment };
    }),
  );

  router.post("/v1/projects/:project_id/members/:membership_id/permission-assignments", async (c) => {
    return withErrorHandling(c, async () => {
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
        throw new PipelineError("VALIDATION_ERROR", "Body request wajib objek JSON.", 400);
      }
      const permissionId = raw.permission_id;
      const scopeType = raw.scope_type;
      const scopeId = raw.scope_id;
      const visibility = raw.card_read_visibility;
      if (typeof permissionId !== "string" || permissionId.length === 0) {
        throw new PipelineError("VALIDATION_ERROR", "Field permission_id wajib string non-kosong.", 400);
      }
      if (typeof scopeType !== "string" || scopeType.length === 0) {
        throw new PipelineError("VALIDATION_ERROR", "Field scope_type wajib string non-kosong.", 400);
      }
      if (typeof scopeId !== "string" || scopeId.length === 0) {
        throw new PipelineError("VALIDATION_ERROR", "Field scope_id wajib string non-kosong.", 400);
      }
      if (visibility !== undefined && visibility !== null && typeof visibility !== "string") {
        throw new PipelineError("VALIDATION_ERROR", "card_read_visibility wajib string atau null.", 400);
      }
      const assignment = await deps.createPermissionAssignment(projectId, membershipId, {
        permissionId,
        scopeType,
        scopeId,
        ...(visibility !== undefined ? { cardReadVisibility: visibility as string | null } : {}),
      });
      return { assignment };
    }, 201);
  });

  router.post("/v1/projects/:project_id/members/:membership_id/permission-assignments/:assignment_id/revoke", async (c) => {
    return withErrorHandling(c, async () => {
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
      return { assignment };
    });
  });

  router.post("/v1/projects/:project_id/invitations", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      // Authorization first (Implementation Rule 3): Owner-only interim.
      await deps.assertProjectOwner(projectId, identity.userId);
      const raw = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
      if (typeof raw !== "object" || raw === null) {
        throw new PipelineError("VALIDATION_ERROR", "Body request wajib objek JSON.", 400);
      }
      if (raw.expires_at !== undefined && raw.expires_at !== null && typeof raw.expires_at !== "string") {
        throw new PipelineError("VALIDATION_ERROR", "expires_at wajib string atau null.", 400);
      }
      if (!Array.isArray(raw.assignments)) {
        throw new PipelineError("VALIDATION_ERROR", "Field assignments wajib array (minimal satu item — BR-051).", 400);
      }
      const assignments = raw.assignments.map((item) => {
        const entry = item as Record<string, unknown>;
        if (typeof entry.group_id !== "string" || entry.group_id.length === 0) {
          throw new PipelineError("VALIDATION_ERROR", "Setiap assignment wajib memiliki group_id string non-kosong.", 400);
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
      return { invitation };
    }, 201);
  });

  router.get("/v1/projects/:project_id/members", async (c) => {
    return withErrorHandling(c, async () => {
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
            throw new PipelineError("VALIDATION_ERROR", `Nilai status '${s}' tidak valid (hanya 'active', 'revoked').`, 400);
          }
        }
      }
      const members = await deps.listMembers(projectId, identity.userId, { ...(status !== undefined ? { status } : {}) });
      return { members };
    });
  });

  router.get("/v1/projects/:project_id/members/:membership_id/assignments", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const membershipId = c.req.param("membership_id");
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      // Authorization first (Implementation Rule 3) — member.read via engine
      // TASK-4.1/4.4 (bukan Owner-only interim).
      await deps.assertPermissionKey(projectId, identity.userId, "member.read");
      const data = await deps.listMembershipAssignments(projectId, membershipId);
      if (data === null) {
        throw new PipelineError(
          "RESOURCE_NOT_FOUND",
          `Membership ${membershipId} tidak ditemukan di Project ini.`,
          404,
        );
      }
      return {
        group_assignments: data.groupAssignments,
        permission_assignments: data.permissionAssignments,
      };
    });
  });

  router.post("/v1/projects/:project_id/members/:membership_id/revoke", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      // Authorization first (Implementation Rule 3): member.remove interim
      // = Owner-only (CL-25).
      await deps.assertProjectOwner(projectId, identity.userId);
      const membership = await deps.revokeMembership(projectId, c.req.param("membership_id"), identity.userId);
      return { membership };
    });
  });

  router.post("/v1/invitations/:invitation_id/accept", (c) =>
    withErrorHandling(c, async () => {
      const deps = getDeps();
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      // Accept tidak Owner-only — pemanggil adalah invitee yang terautentikasi.
      return await deps.acceptInvitation(c.req.param("invitation_id"), identity.userId, identity.email);
    }),
  );

  router.get("/v1/projects/:project_id/invitations", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      const projectId = c.req.param("project_id");
      await deps.assertProjectOwner(projectId, identity.userId);
      return await deps.listProjectInvitations(projectId);
    });
  });

  router.post("/v1/projects/:project_id/invitations/:invitation_id/revoke", async (c) => {
    return withErrorHandling(c, async () => {
      const deps = getDeps();
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      const projectId = c.req.param("project_id");
      await deps.assertProjectOwner(projectId, identity.userId);
      return await deps.revokeInvitation(projectId, c.req.param("invitation_id"));
    });
  });

  return router;
}
