import { strict as assert } from 'assert'
import { db, seedSampleData, getCard } from '../../infrastructure/in_memory_db'
import { moveCard, ConflictError, InvalidDestinationError } from './service'

describe('card.move - moveCard()', () => {
  beforeEach(() => {
    // Clear in-memory DB and seed fresh data
    db.projects.clear()
    db.boards.clear()
    db.lists.clear()
    db.cards.clear()
    db.activities.length = 0
    seedSampleData()
  })

  it('moves a card successfully when expected_version matches', async () => {
    const cardBefore = getCard('card_1')!
    assert.equal(cardBefore.list_id, 'list_a')

    const updated = await moveCard({ projectId: 'proj_1', cardId: 'card_1', destinationListId: 'list_b', expected_version: 1, actor_user_id: 'user_1' })

    assert.equal(updated.list_id, 'list_b')
    assert.equal(updated.version, 2)
    // Activity appended
    assert.equal(db.activities.length, 1)
  })

  it('throws VERSION_CONFLICT when expected_version mismatches', async () => {
    await assert.rejects(async () => {
      await moveCard({ projectId: 'proj_1', cardId: 'card_1', destinationListId: 'list_b', expected_version: 999, actor_user_id: 'user_1' })
    }, err => err instanceof ConflictError)
  })

  it('throws INVALID_DESTINATION when destination board milestone differs', async () => {
    // create a board with different milestone and a list under it
    const boardX = { id: 'brd_x', milestone_id: 'ms_other', title: 'Other', created_at: new Date().toISOString(), version: 1 }
    db.boards.set(boardX.id, boardX)
    const listX = { id: 'list_x', board_id: boardX.id, title: 'OtherList', created_at: new Date().toISOString(), version: 1 }
    db.lists.set(listX.id, listX)

    await assert.rejects(async () => {
      await moveCard({ projectId: 'proj_1', cardId: 'card_1', destinationListId: 'list_x', expected_version: 1, actor_user_id: 'user_1' })
    }, err => err instanceof InvalidDestinationError)
  })
})
