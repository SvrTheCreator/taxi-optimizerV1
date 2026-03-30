import { getSessions, saveSession } from './_db.js'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.json(getSessions())
  }

  if (req.method === 'POST') {
    const { data } = req.body
    if (!data) return res.status(400).json({ error: 'data is required' })
    const id = saveSession(data)
    return res.json({ id })
  }

  res.status(405).json({ error: 'Method not allowed' })
}
