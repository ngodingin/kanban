/**
 * Kontrak repository domain List (TASK-2.6).
 * Ancestor chain List: Board → Milestone → Project (3 level, INV-LIFE-001/002).
 * List TIDAK punya field status (FR-023); archive/delete MUST NOT cascade
 * ke Card descendant (FR-022/BR-013) — Card non-operational efektif via 2.1.
 */
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
  /** FR-021 — title bebas tanpa semantic bawaan. */
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

  createList(projectId: string, input: CreateListInput): Promise<ListRecord>;
  updateList(projectId: string, input: UpdateListInput): Promise<ListRecord>;
  archiveList(projectId: string, input: ListLifecycleInput): Promise<ListRecord>;
  restoreList(projectId: string, input: ListLifecycleInput): Promise<ListRecord>;
  deleteList(projectId: string, input: ListLifecycleInput): Promise<ListRecord>;
}
