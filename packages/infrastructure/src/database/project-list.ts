import type { Client } from "@libsql/client";
import { listActiveMemberships } from "./global-reads.ts";
import { DrizzleProjectRepository } from "./project-repository.ts";
import { resolveOrThrow, type ProjectDatabaseResolver } from "./project-resolver.ts";
import { PipelineError } from "../pipeline/errors.ts";

export type ProjectStatus = "ACTIVE" | "ARCHIVED" | "DELETED";

export function deriveProjectStatus(state: {
  archivedAt: string | null;
  deletedAt: string | null;
}): ProjectStatus {
  if (state.deletedAt !== null) return "DELETED";
  if (state.archivedAt !== null) return "ARCHIVED";
  return "ACTIVE";
}

export interface ProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
}

export async function listProjectSummaries(
  globalClient: Client,
  databaseResolver: ProjectDatabaseResolver,
  clientFactory: { create(databaseId: string): Client | Promise<Client> },
  userId: string,
): Promise<ProjectSummary[]> {
  const memberships = await listActiveMemberships(globalClient, userId);
  const summaries: ProjectSummary[] = [];
  for (const membership of memberships) {
    const mapping = await resolveOrThrow(databaseResolver, membership.projectId);
    const repository = new DrizzleProjectRepository(await clientFactory.create(mapping.databaseId));
    const state = await repository.getProjectState(membership.projectId);
    if (!state) {
      throw new PipelineError(
        "RESOURCE_NOT_FOUND",
        `project_state ${membership.projectId} tidak ditemukan di Project DB.`,
        404,
      );
    }
    summaries.push({
      id: state.projectId,
      name: state.name,
      status: deriveProjectStatus({ archivedAt: state.archivedAt, deletedAt: state.deletedAt }),
    });
  }
  return summaries;
}
