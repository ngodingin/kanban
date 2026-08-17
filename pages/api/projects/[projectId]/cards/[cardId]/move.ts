import type { NextApiRequest, NextApiResponse } from 'next'
import { moveCard } from '../../../../../../src/modules/card/service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } })

  const { projectId, cardId } = req.query
  const { destination_list_id, expected_version, actor_user_id } = req.body

  try {
    if (!destination_list_id || expected_version == null) {
      return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'destination_list_id and expected_version required' } })
    }

    const updated = await moveCard({ projectId: String(projectId), cardId: String(cardId), destinationListId: destination_list_id, expected_version, actor_user_id: actor_user_id || 'system' })
    return res.status(200).json({ data: updated })
  } catch (err: any) {
    if (err.message && err.message.includes('VERSION_CONFLICT')) return res.status(409).json({ error: { code: 'VERSION_CONFLICT', message: err.message } })
    if (err.message && err.message.includes('NOT_FOUND')) return res.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: err.message } })
    return res.status(400).json({ error: { code: 'INVALID_DESTINATION', message: err.message } })
  }
}
