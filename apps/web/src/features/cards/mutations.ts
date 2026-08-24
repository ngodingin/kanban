import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest, newIdempotencyKey } from "@/lib/api/client";

export interface MoveCardInput {
  cardId: string;
  destinationListId: string;
  expectedVersion: number;
}

// Domain command Card move (02-SPEC C.8): JSON { destinationListId,
// expectedVersion } + Idempotency-Key per logical action (C.3).
// VERSION_CONFLICT (BR-021 / 04-DELIVERY A.3): TIDAK auto-overwrite dan TIDAK
// auto-retry — data di-invalidasi agar UI me-reload state terkini, lalu
// pengguna memutuskan langkah berikutnya (goal 7.5.4).
export function useMoveCard(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, destinationListId, expectedVersion }: MoveCardInput) =>
      apiRequest(`/api/v1/projects/${projectId}/cards/${cardId}/move`, {
        method: "POST",
        body: { destinationListId, expectedVersion },
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cards", projectId] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "VERSION_CONFLICT") {
        // Reload sumber kebenaran; jangan pernah menimpa state lokal diam-diam.
        void queryClient.invalidateQueries({ queryKey: ["cards", projectId] });
        void queryClient.invalidateQueries({ queryKey: ["card", projectId] });
      }
    },
  });
}
