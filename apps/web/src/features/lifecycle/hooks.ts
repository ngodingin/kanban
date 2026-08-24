import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, newIdempotencyKey } from "@/lib/api/client";

// Domain command lifecycle (02-SPEC A.3/A.4, Implementation Rule 2): archive/
// restore/delete adalah operasi eksplisit — BUKAN generic field update. Tidak
// ada child handling: server hanya mengubah local state entity + Activity-nya
// (A.16 #9 atomic), descendant mempertahankan local state.

export type LifecycleEntityKind = "project" | "milestone" | "board" | "list" | "card";
export type LifecycleAction = "archive" | "restore" | "delete";

function endpoint(
  projectId: string,
  kind: LifecycleEntityKind,
  entityId: string,
  action: LifecycleAction,
): string {
  if (kind === "project") {
    return `/api/v1/projects/${projectId}/${action}`;
  }
  const segment =
    kind === "milestone"
      ? "milestones"
      : kind === "board"
        ? "boards"
        : kind === "list"
          ? "lists"
          : "cards";
  return `/api/v1/projects/${projectId}/${segment}/${entityId}/${action}`;
}

export function useLifecycleMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      kind,
      entityId,
      action,
      expectedVersion,
    }: {
      kind: LifecycleEntityKind;
      entityId: string;
      action: LifecycleAction;
      expectedVersion: number;
    }) =>
      apiRequest(endpoint(projectId, kind, entityId, action), {
        method: "POST",
        body: { expectedVersion },
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: (_data, variables) => {
      // Reload sumber data terdampak; local state descendant TIDAK disentuh UI.
      void queryClient.invalidateQueries({ queryKey: ["cards", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["lists", projectId] });
      void queryClient.invalidateQueries({ queryKey: [variables.kind, projectId] });
      void queryClient.invalidateQueries({ queryKey: ["activities", projectId] });
    },
  });
}
