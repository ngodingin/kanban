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
                for (let attempt = 0;; attempt++) {
                    try {
                        await client.execute(`DELETE FROM ${table}`);
                        break;
                    }
                    catch (error) {
                        const code = (error as {
                            code?: string;
                        }).code ?? "";
                        if (code === "SQLITE_BUSY" && attempt < 10) {
                            await new Promise((resolve) => setTimeout(resolve, 50));
                            continue;
                        }
                        throw error;
                    }
                }
            }
        },
    };
}
