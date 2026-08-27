import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, newIdempotencyKey } from "@/lib/api/client";

export interface Permission {
  id: string;
  key: string;
  description: string;
}

export interface PermissionGroup {
  id: string;
  name: string;
  permissions: Array<{ permissionId: string; key: string; cardReadVisibility?: string | null }>;
}

export interface GroupAssignment {
  id: string;
  groupId: string;
  scopeType: string;
  scopeId: string;
}

export interface PermissionAssignment {
  id: string;
  permissionId: string;
  scopeType: string;
  scopeId: string;
}

const SCOPES = ["project", "milestone", "board", "list", "card"] as const;

export function usePermissions(projectId: string | undefined) {
  return useQuery({
    queryKey: ["permissions", projectId],
    enabled: Boolean(projectId),
    queryFn: () =>
      apiRequest<{ permissions: Permission[] }>(
        `/api/v1/projects/${projectId}/permissions`,
      ),
    select: (d) => d.permissions,
  });
}

export function usePermissionGroupsList(projectId: string | undefined) {
  return useQuery({
    queryKey: ["permission-groups", projectId],
    enabled: Boolean(projectId),
    queryFn: () =>
      apiRequest<{ groups: PermissionGroup[] }>(
        `/api/v1/projects/${projectId}/permission-groups`,
      ),
    select: (d) => d.groups,
  });
}

export function useCreatePermissionGroup(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; permissions: Array<{ permissionId: string; cardReadVisibility?: string | null }> }) =>
      apiRequest<{ group: PermissionGroup }>(
        `/api/v1/projects/${projectId}/permission-groups`,
        {
          method: "POST",
          body: payload,
          idempotencyKey: newIdempotencyKey(),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permission-groups", projectId] });
    },
  });
}

export function useUpdatePermissionGroup(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      payload,
    }: {
      groupId: string;
      payload: { name?: string; permissions?: Array<{ permissionId: string; cardReadVisibility?: string | null }> };
    }) =>
      apiRequest<{ group: PermissionGroup }>(
        `/api/v1/projects/${projectId}/permission-groups/${groupId}`,
        {
          method: "PATCH",
          body: payload,
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permission-groups", projectId] });
    },
  });
}

export function useDeletePermissionGroup(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) =>
      apiRequest<{ group: PermissionGroup }>(
        `/api/v1/projects/${projectId}/permission-groups/${groupId}/delete`,
        {
          method: "POST",
          idempotencyKey: newIdempotencyKey(),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permission-groups", projectId] });
    },
  });
}

export function useGroupAssignments(
  projectId: string | undefined,
  membershipId: string | undefined,
) {
  return useQuery({
    queryKey: ["group-assignments", projectId, membershipId],
    enabled: Boolean(projectId && membershipId),
    queryFn: () =>
      apiRequest<{ groupAssignments: GroupAssignment[] }>(
        `/api/v1/projects/${projectId}/members/${membershipId}/assignments`,
      ),
    select: (d) => d.groupAssignments,
  });
}

export function useCreateGroupAssignment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      membershipId,
      groupId,
      scopeType,
      scopeId,
    }: {
      membershipId: string;
      groupId: string;
      scopeType: string;
      scopeId: string;
    }) =>
      apiRequest<{ assignment: GroupAssignment }>(
        `/api/v1/projects/${projectId}/members/${membershipId}/group-assignments`,
        {
          method: "POST",
          body: { groupId, scopeType, scopeId },
          idempotencyKey: newIdempotencyKey(),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-assignments", projectId] });
    },
  });
}

export function useRevokeGroupAssignment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      membershipId,
      assignmentId,
    }: {
      membershipId: string;
      assignmentId: string;
    }) =>
      apiRequest<{ assignment: GroupAssignment }>(
        `/api/v1/projects/${projectId}/members/${membershipId}/group-assignments/${assignmentId}/revoke`,
        {
          method: "POST",
          idempotencyKey: newIdempotencyKey(),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-assignments", projectId] });
    },
  });
}

export { SCOPES };
