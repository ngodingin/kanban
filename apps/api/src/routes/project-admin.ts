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
import { toApiErrorResponse, withIdempotentHandling, type IdempotencyStoreLike } from "./projects.ts";
import {
  parseBody,
  groupCreateSchema,
  groupUpdateSchema,
  groupAssignmentCreateSchema,
  permissionAssignmentCreateSchema,
  invitationCreateSchema,
} from "./core-schemas.ts";

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
  listPermissions(): Promise<Array<{ id: string; key: string; description: string | null }>>;
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
  idempotencyStore?: IdempotencyStoreLike;
  listMembershipAssignments(
    projectId: string,
    membershipId: string,
  ): Promise<MembershipAssignmentsList | null>;
  revokeMembership(projectId: string, membershipId: string, actorUserId?: string): Promise<ProjectMemberSummary>;
  listProjectInvitations(projectId: string): Promise<InvitationListSummary[]>;
  revokeInvitation(projectId: string, invitationId: string): Promise<InvitationListSummary>;
}




function readCreateGroupBody(body: unknown): CreatePermissionGroupPayload {
  // TASK-6.2.3 — parsing manual diganti skema Zod (paritas pesan dipertahankan).
  const parsed = parseBody(groupCreateSchema, body);
  return {
    name: parsed.name,
    description: parsed.description ?? null,
    permissions: parsed.permissions ?? [],
  };
}

// Minimal satu field harus hadir; field tak dikenal ditolak agar client tidak
// mengira field lain ikut berubah (C.15 semangat: PATCH terkontrol).
function readUpdateGroupBody(body: unknown): UpdatePermissionGroupPayload {
  // TASK-6.2.3 — Zod untuk struktur + pesan; aturan allowed-keys & minimal
  // satu field tetap diverifikasi di sini (pesan persis versi lama).
  const parsed = parseBody(groupUpdateSchema, body);
  const raw = (body ?? {}) as Record<string, unknown>;
  const allowed = ["name", "description", "permissions"];
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) {
      throw new PipelineError("VALIDATION_ERROR", `Field tidak dikenal: ${key}`, 400);
    }
  }
  if (parsed.name === undefined && parsed.description === undefined && parsed.permissions === undefined) {
    throw new PipelineError(
      "VALIDATION_ERROR",
      "Minimal satu field (name/description/permissions) wajib ada.",
      400,
    );
  }
  return {
    ...(parsed.name === undefined ? {} : { name: parsed.name }),
    ...(parsed.description === undefined ? {} : { description: parsed.description }),
    ...(parsed.permissions === undefined ? {} : { permissions: parsed.permissions }),
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

  router.get("/v1/projects/:project_id/permissions", (c) =>
    withErrorHandling(c, async () => {
      const deps = getDeps();
      const projectId = c.req.param("project_id");
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      // C.12 — Authorization: project member aktif (bukan Owner-only).
      await deps.requireActiveMember(projectId, identity.userId);
      const permissions = await deps.listPermissions();
      return { permissions };
    }),
  );

  router.post("/v1/projects/:project_id/permission-groups", (c) =>
    withIdempotentHandling(
      c,
      getDeps(),
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
      getDeps().idempotencyStore,
    ),
  );

  router.patch("/v1/projects/:project_id/permission-groups/:group_id", (c) =>
    withIdempotentHandling(c, getDeps(), async () => {
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
    }, 200, getDeps().idempotencyStore),
  );

  router.post("/v1/projects/:project_id/permission-groups/:group_id/delete", (c) =>
    withIdempotentHandling(c, getDeps(), async () => {
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
    }, 200, getDeps().idempotencyStore),
  );

  router.post("/v1/projects/:project_id/members/:membership_id/group-assignments", (c) =>
    withIdempotentHandling(
      c,
      getDeps(),
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
        const { groupId, scopeType, scopeId } = parseBody(groupAssignmentCreateSchema, raw);
        const assignment = await deps.createGroupAssignment(projectId, membershipId, { groupId: groupId!, scopeType: scopeType!, scopeId: scopeId! });
        return { assignment };
      },
      201,
      getDeps().idempotencyStore,
    ),
  );

  router.post("/v1/projects/:project_id/members/:membership_id/group-assignments/:assignment_id/revoke", (c) =>
    withIdempotentHandling(c, getDeps(), async () => {
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
    }, 200, getDeps().idempotencyStore),
  );

  router.post("/v1/projects/:project_id/members/:membership_id/permission-assignments", async (c) => {
    return withIdempotentHandling(c, getDeps(), async () => {
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
      const parsedAssign = parseBody(permissionAssignmentCreateSchema, raw);
      const assignment = await deps.createPermissionAssignment(projectId, membershipId, {
        permissionId: parsedAssign.permissionId,
        scopeType: parsedAssign.scopeType,
        scopeId: parsedAssign.scopeId,
        ...(parsedAssign.cardReadVisibility !== undefined ? { cardReadVisibility: parsedAssign.cardReadVisibility } : {}),
      });
      return { assignment };
    }, 201, getDeps().idempotencyStore);
  });

  router.post("/v1/projects/:project_id/members/:membership_id/permission-assignments/:assignment_id/revoke", async (c) => {
    return withIdempotentHandling(c, getDeps(), async () => {
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
    return withIdempotentHandling(c, getDeps(), async () => {
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
const invParsed = parseBody(invitationCreateSchema(projectId), raw);
      const invitation = await deps.createInvitation(projectId, identity.userId, {
        email: typeof raw.email === "string" ? raw.email : "",
        assignments: invParsed.assignments,
        ...(invParsed.expiresAt !== undefined ? { expiresAt: invParsed.expiresAt } : {}),
      });
      return { invitation };
    }, 201, getDeps().idempotencyStore);
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
    return withIdempotentHandling(c, getDeps(), async () => {
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
    }, 200, getDeps().idempotencyStore);
  });

  router.post("/v1/invitations/:invitation_id/accept", (c) =>
    withIdempotentHandling(c, getDeps(), async () => {
      const deps = getDeps();
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      // Accept tidak Owner-only — pemanggil adalah invitee yang terautentikasi.
      const result = await deps.acceptInvitation(c.req.param("invitation_id"), identity.userId, identity.email);
      return { invitation: result.invitation };
      }, 200, getDeps().idempotencyStore),
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
    return withIdempotentHandling(c, getDeps(), async () => {
      const deps = getDeps();
      const identity = await new ResolveIdentityStep({
        resolveIdentity: deps.resolveIdentity,
      }).run(c.req.raw);
      const projectId = c.req.param("project_id");
      await deps.assertProjectOwner(projectId, identity.userId);
      const invitation = await deps.revokeInvitation(projectId, c.req.param("invitation_id"));
      return { invitation };
    }, 200, getDeps().idempotencyStore);
  });

  return router;
}
