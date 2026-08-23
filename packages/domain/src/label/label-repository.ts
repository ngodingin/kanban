/**
 * Kontrak repository domain Label (TASK-3.3/3.5, C.11).
 * Dua scope: Milestone Label (ancestor 2 level) dan Board Label (3 level).
 * Ancestor-check WAJIB di SEMUA operasi mutasi (INV-LIFE-001 — pelajaran
 * Review-CL-02 Phase 2). Label lifecycle penuh; Activity entity_type
 * 'milestone_label'/'board_label' (BR-025 amandemen 2.8.0).
 */
export interface MilestoneLabelRecord {
  id: string;
  milestoneId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
  version: number;
}

export interface BoardLabelRecord {
  id: string;
  boardId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
  version: number;
}

export interface CreateLabelInput {
  id: string;
  name: string;
  actorUserId: string;
}

export interface UpdateLabelInput {
  labelId: string;
  expectedVersion: number;
  actorUserId: string;
  name?: string;
}

export interface LabelLifecycleInput {
  labelId: string;
  expectedVersion: number;
  actorUserId: string;
}

export interface ListLabelsOptions {
  /** C.11 — default exclude soft-deleted; true = sertakan. */
  includeDeleted?: boolean;
}

/**
 * Pola identik antar scope — parameter generik hanya untuk binding tabel.
 * Implementasi WAJIB ancestor check di semua operasi mutasi + atomik
 * mutation+Activity (runInWriteTransaction).
 */
export interface MilestoneLabelRepository {
  listMilestoneLabels(
    projectId: string,
    milestoneId: string,
    opts?: ListLabelsOptions,
  ): Promise<MilestoneLabelRecord[]>;

  createMilestoneLabel(projectId: string, milestoneId: string, input: CreateLabelInput): Promise<MilestoneLabelRecord>;
  /** Mutasi tidak menerima milestoneId — parent di-resolve dari row Label (sumber kebenaran). */
  updateMilestoneLabel(projectId: string, input: UpdateLabelInput): Promise<MilestoneLabelRecord>;
  archiveMilestoneLabel(projectId: string, input: LabelLifecycleInput): Promise<MilestoneLabelRecord>;
  restoreMilestoneLabel(projectId: string, input: LabelLifecycleInput): Promise<MilestoneLabelRecord>;
  deleteMilestoneLabel(projectId: string, input: LabelLifecycleInput): Promise<MilestoneLabelRecord>;
}

export interface BoardLabelRepository {
  listBoardLabels(
    projectId: string,
    boardId: string,
    opts?: ListLabelsOptions,
  ): Promise<BoardLabelRecord[]>;

  createBoardLabel(projectId: string, boardId: string, input: CreateLabelInput): Promise<BoardLabelRecord>;
  /** Mutasi tidak menerima boardId — parent di-resolve dari row Label (sumber kebenaran). */
  updateBoardLabel(projectId: string, input: UpdateLabelInput): Promise<BoardLabelRecord>;
  archiveBoardLabel(projectId: string, input: LabelLifecycleInput): Promise<BoardLabelRecord>;
  restoreBoardLabel(projectId: string, input: LabelLifecycleInput): Promise<BoardLabelRecord>;
  deleteBoardLabel(projectId: string, input: LabelLifecycleInput): Promise<BoardLabelRecord>;
}
