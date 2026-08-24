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
    includeDeleted?: boolean;
}
export interface MilestoneLabelRepository {
    listMilestoneLabels(projectId: string, milestoneId: string, opts?: ListLabelsOptions): Promise<MilestoneLabelRecord[]>;
    createMilestoneLabel(projectId: string, milestoneId: string, input: CreateLabelInput): Promise<MilestoneLabelRecord>;
    updateMilestoneLabel(projectId: string, input: UpdateLabelInput): Promise<MilestoneLabelRecord>;
    archiveMilestoneLabel(projectId: string, input: LabelLifecycleInput): Promise<MilestoneLabelRecord>;
    restoreMilestoneLabel(projectId: string, input: LabelLifecycleInput): Promise<MilestoneLabelRecord>;
    deleteMilestoneLabel(projectId: string, input: LabelLifecycleInput): Promise<MilestoneLabelRecord>;
}
export interface BoardLabelRepository {
    listBoardLabels(projectId: string, boardId: string, opts?: ListLabelsOptions): Promise<BoardLabelRecord[]>;
    createBoardLabel(projectId: string, boardId: string, input: CreateLabelInput): Promise<BoardLabelRecord>;
    updateBoardLabel(projectId: string, input: UpdateLabelInput): Promise<BoardLabelRecord>;
    archiveBoardLabel(projectId: string, input: LabelLifecycleInput): Promise<BoardLabelRecord>;
    restoreBoardLabel(projectId: string, input: LabelLifecycleInput): Promise<BoardLabelRecord>;
    deleteBoardLabel(projectId: string, input: LabelLifecycleInput): Promise<BoardLabelRecord>;
}
