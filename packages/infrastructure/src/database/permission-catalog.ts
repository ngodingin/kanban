import type { Client } from "@libsql/client";
import { ulid } from "ulid";
export interface PermissionCatalogEntry {
    key: string;
    description: string;
}
export const PERMISSION_CATALOG: readonly PermissionCatalogEntry[] = [
    { key: "project.read", description: "Melihat detail Project" },
    { key: "project.update", description: "Mengubah Project (nama)" },
    { key: "milestone.read", description: "Melihat Milestone" },
    { key: "milestone.create", description: "Membuat Milestone" },
    { key: "milestone.update", description: "Mengubah Milestone" },
    { key: "milestone.archive", description: "Mengarsipkan Milestone" },
    { key: "milestone.delete", description: "Menghapus Milestone" },
    { key: "milestone.restore", description: "Me-restore Milestone dari ARCHIVED" },
    { key: "board.read", description: "Melihat Board" },
    { key: "board.create", description: "Membuat Board" },
    { key: "board.update", description: "Mengubah Board" },
    { key: "board.archive", description: "Mengarsipkan Board" },
    { key: "board.delete", description: "Menghapus Board" },
    { key: "board.restore", description: "Me-restore Board dari ARCHIVED" },
    { key: "list.read", description: "Melihat List" },
    { key: "list.create", description: "Membuat List" },
    { key: "list.update", description: "Mengubah List" },
    { key: "list.archive", description: "Mengarsipkan List" },
    { key: "list.delete", description: "Menghapus List" },
    { key: "list.restore", description: "Me-restore List dari ARCHIVED" },
    { key: "card.read", description: "Melihat Card" },
    { key: "card.create", description: "Membuat Card" },
    { key: "card.update", description: "Mengubah Card" },
    { key: "card.move", description: "Memindahkan Card antar List/Board" },
    { key: "card.archive", description: "Mengarsipkan Card" },
    { key: "card.delete", description: "Menghapus Card" },
    { key: "card.restore", description: "Me-restore Card dari ARCHIVED" },
    { key: "card.comment", description: "Menambah komentar pada Card" },
    { key: "card.comment.update", description: "Mengedit komentar pada Card" },
    { key: "milestone_label.read", description: "Melihat Label Milestone" },
    { key: "milestone_label.create", description: "Membuat Label Milestone" },
    { key: "milestone_label.update", description: "Mengubah Label Milestone" },
    { key: "milestone_label.archive", description: "Mengarsipkan Label Milestone" },
    { key: "milestone_label.delete", description: "Menghapus Label Milestone" },
    { key: "milestone_label.restore", description: "Me-restore Label Milestone dari ARCHIVED" },
    { key: "board_label.read", description: "Melihat Label Board" },
    { key: "board_label.create", description: "Membuat Label Board" },
    { key: "board_label.update", description: "Mengubah Label Board" },
    { key: "board_label.archive", description: "Mengarsipkan Label Board" },
    { key: "board_label.delete", description: "Menghapus Label Board" },
    { key: "board_label.restore", description: "Me-restore Label Board dari ARCHIVED" },
    { key: "member.read", description: "Melihat daftar anggota Project" },
    { key: "member.invite", description: "Mengundang anggota baru" },
    { key: "member.update", description: "Mengubah assignment anggota" },
    { key: "member.remove", description: "Mencabut membership anggota" },
    { key: "permission_group.read", description: "Melihat Permission Group" },
    { key: "permission_group.create", description: "Membuat Permission Group" },
    { key: "permission_group.update", description: "Mengubah Permission Group beserta permissions-nya" },
    { key: "permission_group.delete", description: "Menghapus Permission Group" },
    { key: "api_key.read", description: "Melihat API Key" },
    { key: "api_key.create", description: "Membuat API Key" },
    { key: "api_key.revoke", description: "Mencabut API Key" },
] as const;
export function permissionCatalogKeys(): string[] {
    return PERMISSION_CATALOG.map((entry) => entry.key);
}
export const BASELINE_GROUP_NAMES = ["Co-Owner", "Manager", "Contributor", "Viewer"] as const;
export type BaselineGroupName = (typeof BASELINE_GROUP_NAMES)[number];
export const BASELINE_GROUP_DESCRIPTIONS: Record<BaselineGroupName, string> = {
    "Co-Owner": "Akses penuh setara Owner kecuali ownership (BR-035/BR-036)",
    Manager: "Kelola Milestone/Board/List/Card tanpa pengaturan Project",
    Contributor: "Kerjakan Card dengan baca terbatas",
    Viewer: "Hanya baca seluruh resource",
};
const RESOURCE_FULL_KEYS = (resource: string): string[] => [
    `${resource}.read`,
    `${resource}.create`,
    `${resource}.update`,
    `${resource}.archive`,
    `${resource}.delete`,
    `${resource}.restore`,
];
const CARD_CONTRIBUTOR_KEYS = [
    "card.read",
    "card.create",
    "card.update",
    "card.move",
    "card.archive",
    "card.delete",
    "card.comment",
];
export function baselineGroupPermissionKeys(group: BaselineGroupName): string[] {
    switch (group) {
        case "Co-Owner":
            return permissionCatalogKeys();
        case "Manager":
            return [
                "project.read",
                ...RESOURCE_FULL_KEYS("milestone"),
                ...RESOURCE_FULL_KEYS("board"),
                ...RESOURCE_FULL_KEYS("list"),
                ...RESOURCE_FULL_KEYS("milestone_label"),
                ...RESOURCE_FULL_KEYS("board_label"),
                ...CARD_CONTRIBUTOR_KEYS,
            ];
        case "Contributor":
            return [
                "project.read",
                "milestone.read",
                "board.read",
                "list.read",
                "card.read",
                "card.create",
                "card.update",
                "card.move",
                "card.archive",
                "card.delete",
                "card.comment",
            ];
        case "Viewer":
            return permissionCatalogKeys().filter((key) => key.endsWith(".read"));
    }
}
export async function seedPermissionCatalog(client: Client): Promise<{
    inserted: number;
}> {
    let inserted = 0;
    for (const entry of PERMISSION_CATALOG) {
        const result = await client.execute({
            sql: "INSERT INTO permissions (id, key, description) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING",
            args: [ulid(), entry.key, entry.description],
        });
        inserted += result.rowsAffected;
    }
    return { inserted };
}
