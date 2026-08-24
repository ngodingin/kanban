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
import { toApiErrorResponse, ValidationCollector } from "./projects.ts";

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
    const permissionId = item.permissionId;
    if (typeof permissionId !== "string" || permissionId.length === 0) {
      throw new PipelineError("VALIDATION_ERROR", "Field permissionId wajib string non-kosong.", 400);
    }
    if (seen.has(permissionId)) {
      throw new PipelineError("VALIDATION_ERROR", `permissionId duplikat: ${permissionId}`, 400);
    }
    seen.add(permissionId);
    const visibility = item.cardReadVisibility;
    if (visibility !== undefined && visibility !== null &&
        (typeof visibility !== "string" || !VISIBILITIES.includes(visibility))) {
      throw new PipelineError("VALIDATION_ERROR", `cardReadVisibility tidak valid: ${String(visibility)}`, 400);
    }
    return {
      permissionId,
      cardReadVisibility: typeof visibility === "string" ? visibility : null,
    };
  });
}

function readGroupNameField(rawName: unknown): string {
  if (typeof rawName !== "string") throw new PipelineError("VALIDATION_ERROR", "Field name wajib string.", 400);
  const name = rawName.trim();
  if (name.length === 0) throw new PipelineError("VALIDATION_ERROR", "Field name tidak boleh kosong.", 400);
  if (name.length > MAX_GROUP_NAME_LENGTH) {
    throw new PipelineError("VALIDATION_ERROR", `Field name maksimal ${MAX_GROUP_NAME_LENGTH} karakter.`, 400);
  }
  return name;
}

function readGroupDescriptionField(rawDescription: unknown): string | null {
  if (rawDescription === undefined || rawDescription === null) return null;
  if (typeof rawDescription !== "string") {
    throw new PipelineError("VALIDATION_ERROR", "Field description wajib string atau null.", 400);
  }
  return rawDescription.trim();
}

function readCreateGroupBody(body: unknown): CreatePermissionGroupPayload {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PipelineError("VALIDATION_ERROR", "Body request wajib objek JSON.", 400);
  }
  const raw = body as Record<string, unknown>;
  const collector = new ValidationCollector();
  const name = collector.collect("name", () => readGroupNameField(raw.name));
  const description = collector.collect("description", () => readGroupDescriptionField(raw.description));
  const permissions = collector.collect("permissions", () => readPermissionEntries(raw.permissions ?? []));
  collector.throwIfAny();
  return { name: name!, description: description ?? null, permissions: permissions! };
}

// Minimal satu field harus hadir; field tak dikenal ditolak agar client tidak
// mengira field lain ikut berubah (C.15 semangat: PATCH terkontrol).
function readUpdateGroupBody(body: unknown): UpdatePermissionGroupPayload {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PipelineError("VALIDATION_ERROR", "Body request wajib objek JSON.", 400);
  }
  const raw = body as Record<string, unknown>;
  const collector = new ValidationCollector();
  const name = raw.name === undefined ? undefined : collector.collect("name", () => readGroupNameField(raw.name));
  const description = raw.description === undefined ? undefined : collector.collect("description", () => readGroupDescriptionField(raw.description));
  const permissions = raw.permissions === undefined ? undefined : collector.collect("permissions", () => readPermissionEntries(raw.permissions));
  collector.throwIfAny();
  const allowed = ["name", "description", "permissions"];
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) {
      throw new PipelineError("VALIDATION_ERROR", `Field tidak dikenal: ${key}`, 400);
    }
  }
  if (name === undefined && description === undefined && permissions === undefined) {
    throw new PipelineError("VALIDATION_ERROR", "Minimal satu field (name/description/permissions) wajib ada.", 400);
  }
  return {
    ...(name === undefined ? {} : { name }),
    ...(description === undefined ? {} : { description }),
    ...(permissions === undefined ? {} : { permissions }),
  };
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
        const collector = new ValidationCollector();
        const groupId = collector.collect("groupId", () => {
          if (typeof raw.groupId !== "string" || raw.groupId.length === 0) {
            throw new PipelineError("VALIDATION_ERROR", "Field groupId wajib string non-kosong.", 400);
          }
          return raw.groupId;
        });
        const scopeType = collector.collect("scopeType", () => {
          if (typeof raw.scopeType !== "string" || raw.scopeType.length === 0) {
            throw new PipelineError("VALIDATION_ERROR", "Field scopeType wajib string non-kosong.", 400);
          }
          return raw.scopeType;
        });
        const scopeId = collector.collect("scopeId", () => {
          if (typeof raw.scopeId !== "string" || raw.scopeId.length === 0) {
            throw new PipelineError("VALIDATION_ERROR", "Field scopeId wajib string non-kosong.", 400);
          }
          return raw.scopeId;
        });
        collector.throwIfAny();
        const assignment = await deps.createGroupAssignment(projectId, membershipId, { groupId: groupId!, scopeType: scopeType!, scopeId: scopeId! });
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
      const collector = new ValidationCollector();
      const permissionId = collector.collect("permissionId", () => {
        if (typeof raw.permissionId !== "string" || raw.permissionId.length === 0) {
          throw new PipelineError("VALIDATION_ERROR", "Field permissionId wajib string non-kosong.", 400);
        }
        return raw.permissionId;
      });
      const scopeType = collector.collect("scopeType", () => {
        if (typeof raw.scopeType !== "string" || raw.scopeType.length === 0) {
          throw new PipelineError("VALIDATION_ERROR", "Field scopeType wajib string non-kosong.", 400);
        }
        return raw.scopeType;
      });
      const scopeId = collector.collect("scopeId", () => {
        if (typeof raw.scopeId !== "string" || raw.scopeId.length === 0) {
          throw new PipelineError("VALIDATION_ERROR", "Field scopeId wajib string non-kosong.", 400);
        }
        return raw.scopeId;
      });
      const visibility = collector.collect("cardReadVisibility", () => {
        if (raw.cardReadVisibility !== undefined && raw.cardReadVisibility !== null && typeof raw.cardReadVisibility !== "string") {
          throw new PipelineError("VALIDATION_ERROR", "cardReadVisibility wajib string atau null.", 400);
        }
        return raw.cardReadVisibility as string | null | undefined;
      });
      collector.throwIfAny();
      const assignment = await deps.createPermissionAssignment(projectId, membershipId, {
        permissionId: permissionId!,
        scopeType: scopeType!,
        scopeId: scopeId!,
        ...(visibility !== undefined ? { cardReadVisibility: visibility } : {}),
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
      const collector = new ValidationCollector();
      const expiresAt = collector.collect("expiresAt", () => {
        if (raw.expiresAt !== undefined && raw.expiresAt !== null && typeof raw.expiresAt !== "string") {
          throw new PipelineError("VALIDATION_ERROR", "expiresAt wajib string atau null.", 400);
        }
        return raw.expiresAt as string | null | undefined;
      });
      const assignments = collector.collect("assignments", () => {
        if (!Array.isArray(raw.assignments)) {
          throw new PipelineError("VALIDATION_ERROR", "Field assignments wajib array (minimal satu item — BR-051).", 400);
        }
        return raw.assignments.map((item) => {
          const entry = item as Record<string, unknown>;
          if (typeof entry.groupId !== "string" || entry.groupId.length === 0) {
            throw new PipelineError("VALIDATION_ERROR", "Setiap assignment wajib memiliki groupId string non-kosong.", 400);
          }
          const scopeType = typeof entry.scopeType === "string" ? entry.scopeType : "project";
          const scopeId = typeof entry.scopeId === "string" ? entry.scopeId : projectId;
          return { groupId: entry.groupId, scopeType, scopeId };
        });
      });
      collector.throwIfAny();
      const invitation = await deps.createInvitation(projectId, identity.userId, {
        email: typeof raw.email === "string" ? raw.email : "",
        assignments: assignments!,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
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
      return data;
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
      const result = await deps.acceptInvitation(c.req.param("invitation_id"), identity.userId, identity.email);
      return { invitation: result.invitation };
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
      const invitations = await deps.listProjectInvitations(projectId);
      return { invitations };
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
      const invitation = await deps.revokeInvitation(projectId, c.req.param("invitation_id"));
      return { invitation };
    });
  });

  return router;
}
