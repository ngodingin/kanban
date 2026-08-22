import type { Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { and, eq, isNull } from "drizzle-orm";
import { projects, projectMemberships } from "./global-schema.ts";

export type ProjectRecord = {
  id: string;
  ownerUserId: string;
  provisioningState: "PROVISIONING" | "READY" | "FAILED";
  createdAt: string;
};

export type ProjectMembershipRecord = {
  id: string;
  projectId: string;
  userId: string;
  createdAt: string;
  revokedAt: string | null;
};

export async function getProject(client: Client, projectId: string): Promise<ProjectRecord | null> {
  const db = drizzle(client);
  const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1).run();
  const row = rows.rows[0] as unknown as
    | { id: string; owner_user_id: string; provisioning_state: string; created_at: string }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    provisioningState: row.provisioning_state as ProjectRecord["provisioningState"],
    createdAt: row.created_at,
  };
}

export async function listActiveMemberships(client: Client, userId: string): Promise<ProjectMembershipRecord[]> {
  const db = drizzle(client);
  const rows = await db
    .select()
    .from(projectMemberships)
    .where(and(eq(projectMemberships.userId, userId), isNull(projectMemberships.revokedAt)))
    .run();
  return rows.rows.map((row) => {
    const r = row as unknown as {
      id: string;
      project_id: string;
      user_id: string;
      created_at: string;
      revoked_at: string | null;
    };
    return {
      id: r.id,
      projectId: r.project_id,
      userId: r.user_id,
      createdAt: r.created_at,
      revokedAt: r.revoked_at,
    };
  });
}

export async function getMembership(
  client: Client,
  input: { projectId: string; userId: string },
): Promise<ProjectMembershipRecord | null> {
  const db = drizzle(client);
  const rows = await db
    .select()
    .from(projectMemberships)
    .where(and(eq(projectMemberships.projectId, input.projectId), eq(projectMemberships.userId, input.userId), isNull(projectMemberships.revokedAt)))
    .limit(1)
    .run();
  const row = rows.rows[0] as unknown as
    | { id: string; project_id: string; user_id: string; created_at: string; revoked_at: string | null }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}