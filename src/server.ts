import express from 'express'
import bodyParser from 'body-parser'
import morgan from 'morgan'
import { seedSampleData, getCard } from './infrastructure/in_memory_db.ts'
import { moveCard, ConflictError, NotFoundError, InvalidDestinationError } from './modules/card/service'

const app = express()
app.use(bodyParser.json())
app.use(morgan('dev'))

seedSampleData()

app.post('/api/v1/projects/:projectId/cards/:cardId/move', async (req, res) => {
  const { projectId, cardId } = req.params
  const { destination_list_id, expected_version, actor_user_id } = req.body

  try {
    if (!destination_list_id || expected_version == null) {
      return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'destination_list_id and expected_version required' } })
    }

    const updated = await moveCard({ projectId, cardId, destinationListId: destination_list_id, expected_version, actor_user_id: actor_user_id || 'system' })
    return res.json({ data: updated })
  } catch (err: any) {
    if (err instanceof ConflictError) return res.status(409).json({ error: { code: 'VERSION_CONFLICT', message: err.message } })
    if (err instanceof NotFoundError) return res.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: err.message } })
    if (err instanceof InvalidDestinationError) return res.status(400).json({ error: { code: 'INVALID_DESTINATION', message: err.message } })
    console.error(err)
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'internal error' } })
  }
})

app.get('/api/v1/projects/:projectId/cards/:cardId', (req, res) => {
  const { cardId } = req.params
  const card = getCard(cardId)
  if (!card) return res.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND' } })
  return res.json({ data: card })
})

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`Scaffold server running on http://localhost:${port}`))
