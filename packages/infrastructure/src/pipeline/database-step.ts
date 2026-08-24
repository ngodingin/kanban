import type { Client } from "@libsql/client";
import { resolveOrThrow, type ProjectDatabaseResolver, } from "../database/project-resolver.ts";
import { PipelineError } from "./errors.ts";
export interface ProjectClientFactory {
    create(databaseId: string): Client | Promise<Client>;
}
export class ResolveDatabaseStep {
    private readonly resolver: ProjectDatabaseResolver;
    private readonly clientFactory: ProjectClientFactory;
    constructor(resolver: ProjectDatabaseResolver, clientFactory: ProjectClientFactory) {
        this.resolver = resolver;
        this.clientFactory = clientFactory;
    }
    async run(projectId: string): Promise<Client> {
        let mapping;
        try {
            mapping = await resolveOrThrow(this.resolver, projectId);
        }
        catch {
            throw new PipelineError("RESOURCE_NOT_FOUND", `Project DB ${projectId} belum tersedia.`, 404);
        }
        return await this.clientFactory.create(mapping.databaseId);
    }
}
