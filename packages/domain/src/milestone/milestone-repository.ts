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
    id: string;
    title: string;
    description: string | null;
    progress: number;
    startDate: string | null;
    dueDate: string | null;
    actorUserId: string;
}
export interface UpdateMilestoneInput {
    milestoneId: string;
    expectedVersion: number;
    actorUserId: string;
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
export interface MilestoneRepository {
    getMilestone(projectId: string, milestoneId: string): Promise<MilestoneRecord | undefined>;
    listMilestones(projectId: string): Promise<MilestoneRecord[]>;
    createMilestone(projectId: string, input: CreateMilestoneInput): Promise<MilestoneRecord>;
    updateMilestone(projectId: string, input: UpdateMilestoneInput): Promise<MilestoneRecord>;
    archiveMilestone(projectId: string, input: MilestoneLifecycleInput): Promise<MilestoneRecord>;
    restoreMilestone(projectId: string, input: MilestoneLifecycleInput): Promise<MilestoneRecord>;
    deleteMilestone(projectId: string, input: MilestoneLifecycleInput): Promise<MilestoneRecord>;
}
export type { LifecycleState };
