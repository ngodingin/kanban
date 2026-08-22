import type { LifecycleState } from "../lifecycle/effective-state.ts";

export interface MilestoneRecord {
  id: string;
  title: string;
  description: string | null;
  progress: number;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
  version: number;
}

export interface CreateMilestoneInput {
  /** ULID digenerate caller (route) — repository tidak mengarang ID. */
  id: string;
  title: string;
  description: string | null;
  /** FR-014 — progress manual, integer 0–100. */
  progress: number;
  startDate: string | null;
  dueDate: string | null;
  actorUserId: string;
}

export interface UpdateMilestoneInput {
  milestoneId: string;
  expectedVersion: number;
  actorUserId: string;
  /** `undefined` = field tidak disentuh; `null` = hapus nilai (kecuali title). */
  title?: string;
  description?: string | null;
  progress?: number;
  startDate?: string | null;
  dueDate?: string | null;
}

export interface MilestoneLifecycleInput {
  milestoneId: string;
  expectedVersion: number;
  actorUserId: string;
}

/**
 * Kontrak repository domain Milestone (TASK-2.2).
 * Implementasi WAJIB menegakkan Project boundary di setiap query
 * (03-ENG A.4) dan menjalankan mutation + Activity dalam satu transaksi
 * (INV inti #8/#9, 03-ENG A.6).
 */
export interface MilestoneRepository {
  getMilestone(projectId: string, milestoneId: string): Promise<MilestoneRecord | undefined>;

  createMilestone(projectId: string, input: CreateMilestoneInput): Promise<MilestoneRecord>;
  updateMilestone(projectId: string, input: UpdateMilestoneInput): Promise<MilestoneRecord>;
  archiveMilestone(projectId: string, input: MilestoneLifecycleInput): Promise<MilestoneRecord>;
  restoreMilestone(projectId: string, input: MilestoneLifecycleInput): Promise<MilestoneRecord>;
  deleteMilestone(projectId: string, input: MilestoneLifecycleInput): Promise<MilestoneRecord>;
}

export type { LifecycleState };
