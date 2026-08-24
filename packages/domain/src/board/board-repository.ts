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
    listBoards(milestoneId: string): Promise<BoardRecord[]>;
    createBoard(projectId: string, input: CreateBoardInput): Promise<BoardRecord>;
    updateBoard(projectId: string, input: UpdateBoardInput): Promise<BoardRecord>;
    archiveBoard(projectId: string, input: BoardLifecycleInput): Promise<BoardRecord>;
    restoreBoard(projectId: string, input: BoardLifecycleInput): Promise<BoardRecord>;
    deleteBoard(projectId: string, input: BoardLifecycleInput): Promise<BoardRecord>;
}
