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

export async function seedPermissionCatalog(client: Client): Promise<{ inserted: number }> {
  let inserted = 0;
  for (const entry of PERMISSION_CATALOG) {
    const existing = await client.execute({
      sql: "SELECT id FROM permissions WHERE key = ? LIMIT 1",
      args: [entry.key],
    });
    if (existing.rows.length > 0) continue;
    await client.execute({
      sql: "INSERT INTO permissions (id, key, description) VALUES (?, ?, ?)",
      args: [ulid(), entry.key, entry.description],
    });
    inserted++;
  }
  return { inserted };
}
