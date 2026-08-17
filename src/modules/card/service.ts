import { db, getCard, getList, getBoard, appendActivity } from '../../infrastructure/in_memory_db.ts'
import type { Card } from '../../infrastructure/in_memory_db.ts'

interface MoveParams {
  projectId: string
  cardId: string
  destinationListId: string
  expected_version: number
  actor_user_id: string
}

export class ConflictError extends Error {}
export class NotFoundError extends Error {}
export class InvalidDestinationError extends Error {}

export async function moveCard(params: MoveParams) {
  const { projectId, cardId, destinationListId, expected_version, actor_user_id } = params

  const card = getCard(cardId)
  if (!card) throw new NotFoundError('RESOURCE_NOT_FOUND')

  // Check version
  if (card.version !== expected_version) throw new ConflictError('VERSION_CONFLICT')

  const srcList = getList(card.list_id)
  if (!srcList) throw new NotFoundError('SOURCE_LIST_NOT_FOUND')

  const destList = getList(destinationListId)
  if (!destList) throw new InvalidDestinationError('INVALID_DESTINATION')

  // Simple project check: ensure both lists' boards exist and belong logically
  const srcBoard = getBoard(srcList.board_id)
  const destBoard = getBoard(destList.board_id)
  if (!srcBoard || !destBoard) throw new InvalidDestinationError('INVALID_DESTINATION')

  // Business invariant: card may move between boards only if milestone same
  if (srcBoard.milestone_id !== destBoard.milestone_id) {
    throw new InvalidDestinationError('INVALID_DESTINATION: different milestone')
  }

  // Destination must be ACTIVE (very simple check: not deleted)
  // In this in-memory store we consider presence as ACTIVE

  // Perform move: update list_id and increment version
  const newVersion = card.version + 1
  const updated: Card = { ...card, list_id: destinationListId, version: newVersion }
  db.cards.set(cardId, updated)

  // Append activity
  appendActivity({
    id: `act_${Date.now()}`,
    entity_type: 'card',
    entity_id: cardId,
    entity_version: newVersion,
    actor_user_id,
    action: 'card.moved',
    data: {
      from: { list_id: card.list_id },
      to: { list_id: destinationListId }
    },
    created_at: new Date().toISOString()
  })

  return updated
}
