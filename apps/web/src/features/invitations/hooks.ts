import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, newIdempotencyKey } from "@/lib/api/client";

export interface CreateInvitationInput {
  email: string;
  groupId: string;
  scopeType: "project" | "milestone" | "board" | "list" | "card";
  scopeId: string;
  expiresAt?: string;
}

// C.13 — create → 201 {invitation}; revoke → {invitation}; list → {invitations}
// (wrapper nama terkunci amandemen 4.0.0).
export function useCreateInvitation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInvitationInput) =>
      apiRequest(`/api/v1/projects/${projectId}/invitations`, {
        method: "POST",
        body: {
          email: input.email,
          assignments: [
            {
              groupId: input.groupId,
              scopeType: input.scopeType,
              scopeId: input.scopeId || projectId,
            },
          ],
          ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        },
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invitations", projectId] });
    },
  });
}

export function useRevokeInvitation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      apiRequest(`/api/v1/projects/${projectId}/invitations/${invitationId}/revoke`, {
        method: "POST",
        body: {},
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invitations", projectId] });
    },
  });
}
