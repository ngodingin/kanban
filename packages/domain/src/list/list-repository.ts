export interface ListRecord {
    id: string;
    boardId: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    archivedAt: string | null;
    deletedAt: string | null;
    version: number;
}
export interface CreateListInput {
    id: string;
    boardId: string;
    title: string;
    actorUserId: string;
}
export interface UpdateListInput {
    listId: string;
    expectedVersion: number;
    actorUserId: string;
    title?: string;
}
export interface ListLifecycleInput {
    listId: string;
    expectedVersion: number;
    actorUserId: string;
}
export interface ListRepository {
    getList(projectId: string, listId: string): Promise<ListRecord | undefined>;
    listLists(boardId: string): Promise<ListRecord[]>;
    createList(projectId: string, input: CreateListInput): Promise<ListRecord>;
    updateList(projectId: string, input: UpdateListInput): Promise<ListRecord>;
    archiveList(projectId: string, input: ListLifecycleInput): Promise<ListRecord>;
    restoreList(projectId: string, input: ListLifecycleInput): Promise<ListRecord>;
    deleteList(projectId: string, input: ListLifecycleInput): Promise<ListRecord>;
}
