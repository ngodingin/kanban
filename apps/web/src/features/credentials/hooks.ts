import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, newIdempotencyKey } from "@/lib/api/client";

// C.14 — create mengembalikan secret/token SEKALI; list hanya metadata
// (TIDAK PERNAH key_hash/token_hash). Revoke = POST nested /revoke.

export interface ApiKeySummary {
  id: string;
  name: string;
  expiresAt: string | null;
  createdAt: string;
}
export interface ApiKeyCreated extends ApiKeySummary {
  secret: string;
}

export function useApiKeys(projectId: string | undefined) {
  return useQuery({
    queryKey: ["api-keys", projectId],
    enabled: Boolean(projectId),
    queryFn: () =>
      apiRequest<{ apiKeys: ApiKeySummary[] }>(`/api/v1/projects/${projectId}/api-keys`),
    select: (d) => d.apiKeys,
  });
}

export function useCreateApiKey(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string }) => {
      const res = await apiRequest<{ apiKey: ApiKeyCreated }>(
        `/api/v1/projects/${projectId}/api-keys`,
        {
          method: "POST",
          body: { name: input.name },
          idempotencyKey: newIdempotencyKey(),
        },
      );
      return res.apiKey;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["api-keys", projectId] }),
  });
}

export function useRevokeApiKey(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) =>
      apiRequest(`/api/v1/projects/${projectId}/api-keys/${keyId}/revoke`, {
        method: "POST",
        body: {},
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["api-keys", projectId] }),
  });
}

export interface PatSummary {
  id: string;
  name: string;
  expiresAt: string | null;
  createdAt: string;
}
export interface PatCreated extends PatSummary {
  token: string;
}

export function usePersonalAccessTokens() {
  return useQuery({
    queryKey: ["pats"],
    queryFn: () => apiRequest<{ personalAccessTokens: PatSummary[] }>("/api/v1/me/personal-access-tokens"),
    select: (d) => d.personalAccessTokens,
  });
}

export function useCreatePat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string }) => {
      const res = await apiRequest<{ personalAccessToken: PatCreated }>(
        "/api/v1/me/personal-access-tokens",
        {
          method: "POST",
          body: { name: input.name },
          idempotencyKey: newIdempotencyKey(),
        },
      );
      return res.personalAccessToken;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pats"] }),
  });
}

export function useRevokePat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) =>
      apiRequest(`/api/v1/me/personal-access-tokens/${tokenId}/revoke`, {
        method: "POST",
        body: {},
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pats"] }),
  });
}
