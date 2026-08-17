import type { Client } from "@libsql/client";

export type ProjectDatabaseMapping = {
  projectId: string;
  databaseId: string;
  createdAt: string;
};

export interface ProjectDatabaseResolver {
  resolve(projectId: string): Promise<ProjectDatabaseMapping | null>;
}

export class SqliteProjectDatabaseResolver implements ProjectDatabaseResolver {
  readonly #client: Client;

  constructor(client: Client) {
    this.#client = client;
  }

  async resolve(projectId: string): Promise<ProjectDatabaseMapping | null> {
    if (projectId.length === 0) return null;
    const res = await this.#client.execute({
      sql: "SELECT project_id, database_id, created_at FROM project_databases WHERE project_id = ? LIMIT 1",
      args: [projectId],
    });
    const row = res.rows[0];
    if (!row) return null;
    return {
      projectId: String(row.project_id),
      databaseId: String(row.database_id),
      createdAt: String(row.created_at),
    };
  }
}