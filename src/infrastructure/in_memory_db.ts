export type LifeState = 'ACTIVE' | 'ARCHIVED' | 'DELETED'

export interface Project {
  id: string
  owner_user_id: string
  created_at: string
  archived_at?: string | null
  deleted_at?: string | null
}

export interface Board {
  id: string
  milestone_id: string
  title: string
  created_at: string
  archived_at?: string | null
  deleted_at?: string | null
  version: number
}

export interface List {
  id: string
  board_id: string
  title: string
  created_at: string
  archived_at?: string | null
  deleted_at?: string | null
  version: number
}

export interface Card {
  id: string
  list_id: string
  creator_user_id: string
  assignee_user_id?: string | null
  title: string
  created_at: string
  archived_at?: string | null
  deleted_at?: string | null
  version: number
}

export interface Activity {
  id: string
  entity_type: string
  entity_id: string
  entity_version: number
  actor_user_id: string
  action: string
  data: any
  created_at: string
}

// Very small in-memory store for scaffold/testing
export const db = {
  projects: new Map<string, Project>(),
  boards: new Map<string, Board>(),
  lists: new Map<string, List>(),
  cards: new Map<string, Card>(),
  activities: new Array<Activity>()
}

// Helper getters
export function getProject(projectId: string) {
  return db.projects.get(projectId) || null
}

export function getBoard(boardId: string) {
  return db.boards.get(boardId) || null
}

export function getList(listId: string) {
  return db.lists.get(listId) || null
}

export function getCard(cardId: string) {
  return db.cards.get(cardId) || null
}

export function appendActivity(a: Activity) {
  db.activities.push(a)
}

// Seed helper (optional)
export function seedSampleData() {
  const project = { id: 'proj_1', owner_user_id: 'user_1', created_at: new Date().toISOString() }
  db.projects.set(project.id, project)

  const board = { id: 'brd_1', milestone_id: 'ms_1', title: 'Sprint', created_at: new Date().toISOString(), version: 1 }
  const board2 = { id: 'brd_2', milestone_id: 'ms_1', title: 'Backlog', created_at: new Date().toISOString(), version: 1 }
  db.boards.set(board.id, board)
  db.boards.set(board2.id, board2)

  const listA = { id: 'list_a', board_id: board.id, title: 'Todo', created_at: new Date().toISOString(), version: 1 }
  const listB = { id: 'list_b', board_id: board.id, title: 'Done', created_at: new Date().toISOString(), version: 1 }
  const listC = { id: 'list_c', board_id: board2.id, title: 'Backlog', created_at: new Date().toISOString(), version: 1 }
  db.lists.set(listA.id, listA)
  db.lists.set(listB.id, listB)
  db.lists.set(listC.id, listC)

  const card = { id: 'card_1', list_id: listA.id, creator_user_id: 'user_1', title: 'Example card', created_at: new Date().toISOString(), version: 1 }
  db.cards.set(card.id, card)
}
