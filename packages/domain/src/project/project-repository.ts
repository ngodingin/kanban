export interface ProjectStateRecord {
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
  version: number;
}

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

export interface CardRecord {
  id: string;
  listId: string;
  creatorUserId: string;
  assigneeUserId: string | null;
  title: string;
  subtitle: string | null;
  description: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
  version: number;
}

export interface ProjectRepository {
  getProjectState(projectId: string): Promise<ProjectStateRecord | undefined>;
  createMilestone(input: {
    id: string;
    title: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
  }): Promise<void>;
  listMilestones(): Promise<MilestoneRecord[]>;
  getCard(id: string): Promise<CardRecord | undefined>;
}