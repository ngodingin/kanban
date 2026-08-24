import type { Client } from "@libsql/client";
import { getProject, getMembership, type ProjectRecord, type ProjectMembershipRecord } from "../database/global-reads.ts";
import { PipelineError } from "./errors.ts";
export type ProjectStepResult = {
    project: ProjectRecord;
    membership: ProjectMembershipRecord;
};
export class LoadProjectStep {
    private readonly globalClient: Client;
    constructor(globalClient: Client) {
        this.globalClient = globalClient;
    }
    async run(input: {
        projectId: string;
        userId: string;
    }): Promise<ProjectStepResult> {
        const project = await getProject(this.globalClient, input.projectId);
        if (!project) {
            throw new PipelineError("RESOURCE_NOT_FOUND", `Project ${input.projectId} tidak ditemukan.`, 404);
        }
        const membership = await getMembership(this.globalClient, {
            projectId: input.projectId,
            userId: input.userId,
        });
        if (!membership) {
            throw new PipelineError("PROJECT_ACCESS_DENIED", "Anda bukan anggota Project ini.", 403);
        }
        return { project, membership };
    }
}
