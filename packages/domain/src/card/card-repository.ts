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
    assigneeUserId: string | null;
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
export interface MoveCardInput {
    cardId: string;
    destinationListId: string;
    expectedVersion: number;
    actorUserId: string;
}
export interface CardRepository {
    getCard(projectId: string, cardId: string): Promise<CardRecord | undefined>;
    listCards(listId: string): Promise<CardRecord[]>;
    createCard(projectId: string, input: CreateCardInput): Promise<CardRecord>;
    updateCard(projectId: string, input: UpdateCardInput): Promise<CardRecord>;
    archiveCard(projectId: string, input: CardLifecycleInput): Promise<CardRecord>;
    restoreCard(projectId: string, input: CardLifecycleInput): Promise<CardRecord>;
    deleteCard(projectId: string, input: CardLifecycleInput): Promise<CardRecord>;
    moveCard(projectId: string, input: MoveCardInput): Promise<CardRecord>;
}
