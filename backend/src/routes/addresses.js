import { Router } from 'express'
import { findAddresses, upsertAddress } from '../db/database.js'

const router = Router()

// GET /api/addresses?q=стачки — автодополнение из истории
router.get('/', async (req, res) => {
  const rows = await findAddresses(req.query.q || '')
  res.json(rows)
})

// POST /api/addresses — сохранить адрес
router.post('/', async (req, res) => {
  const { raw, lat, lon } = req.body
  if (!raw) return res.status(400).json({ error: 'raw address is required' })
  await upsertAddress(raw, lat, lon)
  res.json({ ok: true })
})

export default router
