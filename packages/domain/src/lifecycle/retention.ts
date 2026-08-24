export const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
export function isPruneEligible(deletedAt: string | null, now: Date): boolean {
    if (deletedAt === null)
        return false;
    const deletedMs = Date.parse(deletedAt);
    if (Number.isNaN(deletedMs))
        return false;
    return now.getTime() - deletedMs >= RETENTION_MS;
}
