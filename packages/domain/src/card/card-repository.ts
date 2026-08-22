/**
 * Kontrak repository domain Card (TASK-2.8) — CRUD saja tanpa move
 * (move = domain command terpisah TASK-2.10 via /cards/:id/move, BR-017).
 * Ancestor chain Card: List → Board → Milestone → Project (4 level).
 * creator_user_id historis & tidak berubah (FR-025); assignee maks 1 dan
 * wajib member aktif Project (FR-026, 03-ENG A.5 app-level FK).
 */
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

export interface CreateCardInput {
  id: string;
  listId: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  dueDate: string | null;
  /** Opsional, maks 1 (FR-026); divalidasi member aktif oleh implementasi. */
  assigneeUserId: string | null;
  /** FR-025 — actor saat ini menjadi creator_user_id historis. */
  actorUserId: string;
}

export interface UpdateCardInput {
  cardId: string;
  expectedVersion: number;
  actorUserId: string;
  title?: string;
  subtitle?: string | null;
  description?: string | null;
  dueDate?: string | null;
  assigneeUserId?: string | null;
}

export interface CardLifecycleInput {
  cardId: string;
  expectedVersion: number;
  actorUserId: string;
}

/** BR-017 — perpindahan Card HANYA via domain command move ini. */
export interface MoveCardInput {
  cardId: string;
  destinationListId: string;
  expectedVersion: number;
  actorUserId: string;
}

export interface CardRepository {
  getCard(projectId: string, cardId: string): Promise<CardRecord | undefined>;

  createCard(projectId: string, input: CreateCardInput): Promise<CardRecord>;
  updateCard(projectId: string, input: UpdateCardInput): Promise<CardRecord>;
  archiveCard(projectId: string, input: CardLifecycleInput): Promise<CardRecord>;
  restoreCard(projectId: string, input: CardLifecycleInput): Promise<CardRecord>;
  deleteCard(projectId: string, input: CardLifecycleInput): Promise<CardRecord>;
  moveCard(projectId: string, input: MoveCardInput): Promise<CardRecord>;
}
