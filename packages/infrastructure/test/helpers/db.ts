import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyProjectMigrations } from "../../src/database/migrate.ts";

export const PROJECT_TABLES = [
  "card_board_labels",
  "card_milestone_labels",
  "board_labels",
  "milestone_labels",
  "cards",
  "lists",
  "boards",
  "milestones",
  "activities",
  "project_state",
] as const;

export interface TestDb {
  client: Client;
  dir: string;
  cleanup(): Promise<void>;
  truncateAll(): Promise<void>;
}

export async function createTestProjectDb(): Promise<TestDb> {
  const dir = mkdtempSync(join(tmpdir(), "kanban-testdb-"));
  const client = createClient({ url: `file:${join(dir, "project.db")}` });
  await applyProjectMigrations(client);
  return {
    client,
    dir,
    async cleanup() {
      await client.close();
      rmSync(dir, { recursive: true, force: true });
    },
    async truncateAll() {
      for (const table of PROJECT_TABLES) {
        await client.execute(`DELETE FROM ${table}`);
      }
    },
  };
}