export interface ProjectStateRecord {
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
  version: number;
}

export interface UpdateProjectNameInput {
  projectId: string;
  expectedVersion: number;
  actorUserId: string;
  name: string;
}

export interface ProjectLifecycleInput {
  projectId: string;
  expectedVersion: number;
  actorUserId: string;
}

export interface ProjectRepository {
  getProjectState(projectId: string): Promise<ProjectStateRecord | undefined>;
  updateProjectName(input: UpdateProjectNameInput): Promise<ProjectStateRecord>;
  archiveProject(input: ProjectLifecycleInput): Promise<ProjectStateRecord>;
  restoreProject(input: ProjectLifecycleInput): Promise<ProjectStateRecord>;
  deleteProject(input: ProjectLifecycleInput): Promise<ProjectStateRecord>;
}