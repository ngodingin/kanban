import type { Client, InValue } from "@libsql/client";
export interface ActivityRecord {
    id: string;
    entityType: string;
    entityId: string;
    entityVersion: number;
    actorUserId: string;
    action: string;
    data: unknown;
    createdAt: string;
}
export interface ListActivitiesFilters {
    entityType?: string;
    entityId?: string;
    actor?: string;
    action?: string;
    from?: string;
    to?: string;
}
export async function listActivities(client: Client, filters: ListActivitiesFilters): Promise<ActivityRecord[]> {
    const conditions: string[] = [];
    const args: InValue[] = [];
    if (filters.entityType !== undefined) {
        conditions.push("entity_type = ?");
        args.push(filters.entityType);
    }
    if (filters.entityId !== undefined) {
        conditions.push("entity_id = ?");
        args.push(filters.entityId);
    }
    if (filters.actor !== undefined) {
        conditions.push("actor_user_id = ?");
        args.push(filters.actor);
    }
    if (filters.action !== undefined) {
        conditions.push("action = ?");
        args.push(filters.action);
    }
    if (filters.from !== undefined) {
        conditions.push("created_at >= ?");
        args.push(filters.from);
    }
    if (filters.to !== undefined) {
        conditions.push("created_at <= ?");
        args.push(filters.to);
    }
    const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
    const result = await client.execute({
        sql: `SELECT id, entity_type, entity_id, entity_version, actor_user_id, action, data, created_at FROM activities${where} ORDER BY created_at ASC, id ASC`,
        args,
    });
    return result.rows.map(mapActivityRow);
}
function mapActivityRow(row: Record<string, unknown>): ActivityRecord {
    return {
        id: String(row.id),
        entityType: String(row.entity_type),
        entityId: String(row.entity_id),
        entityVersion: Number(row.entity_version),
        actorUserId: String(row.actor_user_id),
        action: String(row.action),
        data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
        createdAt: String(row.created_at),
    };
}
