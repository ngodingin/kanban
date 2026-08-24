import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, newIdempotencyKey } from "@/lib/api/client";

// C.10 — add: POST {body} → Activity comment.added; edit: PATCH
// .../comments/:activity_id (activity_id = id activity original ATAU
// manapun di rantai) → Activity comment.edited baru. Tidak ada delete.
export function useAddComment(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ cardId, body }: { cardId: string; body: string }) => {
      const res = await apiRequest<{ comment: { id: string; commentActivityId: string } }>(
        `/api/v1/projects/${projectId}/cards/${cardId}/comments`,
        {
          method: "POST",
          body: { body },
          idempotencyKey: newIdempotencyKey(),
        },
      );
      return res.comment;
    },
    onSuccess: (_d, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["card-activities", projectId, vars.cardId] });
      void queryClient.invalidateQueries({ queryKey: ["activities", projectId] });
    },
  });
}

export function useEditComment(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      cardId,
      commentActivityId,
      body,
    }: {
      cardId: string;
      commentActivityId: string;
      body: string;
    }) => {
      const res = await apiRequest<{ comment: { id: string; after: string } }>(
        `/api/v1/projects/${projectId}/cards/${cardId}/comments/${commentActivityId}`,
        {
          method: "PATCH",
          body: { body },
          idempotencyKey: newIdempotencyKey(),
        },
      );
      return res.comment;
    },
    onSuccess: (_d, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["card-activities", projectId, vars.cardId] });
    },
  });
}
