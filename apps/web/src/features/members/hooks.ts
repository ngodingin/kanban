import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";

// Kontrak nyata C.12/C.13 (diverifikasi dari source route):
// - GET /members → { members: [{membershipId, userId, email, name, createdAt, revokedAt}] }
// - GET /invitations → { invitations: [{id, email, expiresAt, acceptedAt, revokedAt, createdAt}] }
//   (tanpa filter server-side; status diturunkan client)
// - GET .../members/:m/assignments → { groupAssignments, permissionAssignments }
// - GET /permission-groups → { groups: [{id, name, ...}] }

export interface MemberSummary {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface InvitationSummary {
  id: string;
  email: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface GroupAssignmentSummary {
  id: string;
  groupId: string;
  scopeType: string;
  scopeId: string;
}

export function useMembers(projectId: string | undefined) {
  return useQuery({
    queryKey: ["members", projectId],
    enabled: Boolean(projectId),
    queryFn: () =>
      apiRequest<{ members: MemberSummary[] }>(`/api/v1/projects/${projectId}/members`),
    select: (d) => d.members,
  });
}

export function useInvitations(projectId: string | undefined) {
  return useQuery({
    queryKey: ["invitations", projectId],
    enabled: Boolean(projectId),
    queryFn: () =>
      apiRequest<{ invitations: InvitationSummary[] }>(
        `/api/v1/projects/${projectId}/invitations`,
      ),
    select: (d) => d.invitations,
  });
}

export function usePermissionGroups(projectId: string | undefined) {
  return useQuery({
    queryKey: ["permission-groups", projectId],
    enabled: Boolean(projectId),
    queryFn: () =>
      apiRequest<{
        groups: Array<{ id: string; name: string; permissions: Array<{ permissionId: string; key: string }> }>;
      }>(`/api/v1/projects/${projectId}/permission-groups`),
    select: (d) => d.groups,
  });
}

export function useMemberGroupAssignments(
  projectId: string | undefined,
  membershipId: string | undefined,
) {
  return useQuery({
    queryKey: ["member-assignments", projectId, membershipId],
    enabled: Boolean(projectId && membershipId),
    queryFn: () =>
      apiRequest<{ groupAssignments: GroupAssignmentSummary[] }>(
        `/api/v1/projects/${projectId}/members/${membershipId}/assignments`,
      ),
    select: (d) => d.groupAssignments,
  });
}

/** Invitation masih PENDING bila belum di-accept dan belum di-revoke dan belum expired. */
export function isPendingInvitation(inv: {
  acceptedAt: string | null;
  revokedAt: string | null;
  expiresAt: string;
}, now = new Date()): boolean {
  return inv.acceptedAt === null && inv.revokedAt === null && new Date(inv.expiresAt) > now;
}
