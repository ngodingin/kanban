import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "./api/client";

export interface Project {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "ARCHIVED" | "DELETED";
  createdAt: string;
}

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => apiRequest<Project[]>("/api/v1/projects"),
    staleTime: 30_000,
  });
}
