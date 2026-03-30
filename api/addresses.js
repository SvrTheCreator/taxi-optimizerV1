import { findAddresses, upsertAddress } from './_db.js'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const rows = findAddresses(req.query.q || '')
    return res.json(rows)
  }

  if (req.method === 'POST') {
    const { raw, lat, lon } = req.body
    if (!raw) return res.status(400).json({ error: 'raw address is required' })
    upsertAddress(raw, lat, lon)
    return res.json({ ok: true })
  }

  res.status(405).json({ error: 'Method not allowed' })
}
