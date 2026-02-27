import { Router } from 'express'
import { getSessions, saveSession } from '../db/database.js'

const router = Router()

// GET /api/sessions — последние 10 сессий
router.get('/', async (req, res) => {
  const sessions = await getSessions()
  res.json(sessions)
})

// POST /api/sessions — сохранить результат оптимизации
router.post('/', async (req, res) => {
  const { data } = req.body
  if (!data) return res.status(400).json({ error: 'data is required' })
  const id = await saveSession(data)
  res.json({ id })
})

export default router
