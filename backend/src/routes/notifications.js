import { Router } from 'express'
import supabase from '../db/supabase.js'
import { authMiddleware, adminOnly } from '../auth.js'

const router = Router()
router.use(authMiddleware)
router.use(adminOnly)

// GET /api/notifications — непрочитанные уведомления (только админ)
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/notifications/read-all — пометить все как прочитанные
router.post('/read-all', async (req, res) => {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false)

  res.json({ ok: true })
})

// POST /api/notifications/:id/read — пометить как прочитанное
router.post('/:id/read', async (req, res) => {
  await supabase
    .from('notifications')
    .update({ is_read: true, status: 'read' })
    .eq('id', req.params.id)
  res.json({ ok: true })
})

// DELETE /api/notifications/:id — удалить уведомление
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

export default router
