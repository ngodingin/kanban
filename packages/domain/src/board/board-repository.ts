/**
 * Kontrak repository domain Board (TASK-2.4).
 * Ancestor chain Board: Milestone → Project (2 level, INV-LIFE-001/002).
 * Implementasi WAJIB atomik mutation+Activity dan menjaga Project boundary.
 */
export interface BoardRecord {
  id: string;
  milestoneId: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
  version: number;
}

export interface CreateBoardInput {
  id: string;
  milestoneId: string;
  title: string;
  /** FR-019 — Board TIDAK punya status/warna/ikon/WIP limit. */
  description: string | null;
  actorUserId: string;
}

export interface UpdateBoardInput {
  boardId: string;
  expectedVersion: number;
  actorUserId: string;
  title?: string;
  description?: string | null;
}

export interface BoardLifecycleInput {
  boardId: string;
  expectedVersion: number;
  actorUserId: string;
}

export interface BoardRepository {
  getBoard(projectId: string, boardId: string): Promise<BoardRecord | undefined>;

  createBoard(projectId: string, input: CreateBoardInput): Promise<BoardRecord>;
  updateBoard(projectId: string, input: UpdateBoardInput): Promise<BoardRecord>;
  archiveBoard(projectId: string, input: BoardLifecycleInput): Promise<BoardRecord>;
  restoreBoard(projectId: string, input: BoardLifecycleInput): Promise<BoardRecord>;
  deleteBoard(projectId: string, input: BoardLifecycleInput): Promise<BoardRecord>;
}
