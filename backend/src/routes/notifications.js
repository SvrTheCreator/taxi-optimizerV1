import { Router } from 'express'
import supabase from '../db/supabase.js'
import { authMiddleware, adminOnly } from '../auth.js'

const router = Router()
router.use(authMiddleware)

// GET /api/notifications — уведомления
// Админ: все (для переносов и т.д.), Работник: только свои
router.get('/', async (req, res) => {
  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (req.user.role !== 'admin') {
    // Работник видит только свои уведомления
    query = query.eq('user_id', req.user.userId)
  } else {
    // Админ не видит уведомления ДЛЯ работников (ответы на заявки)
    query = query.not('message', 'like', 'Ваш%')
  }

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/notifications/read-all — пометить все как прочитанные
router.post('/read-all', async (req, res) => {
  let query = supabase
    .from('notifications')
    .update({ is_read: true, status: 'read' })
    .eq('is_read', false)

  if (req.user.role !== 'admin') {
    query = query.eq('user_id', req.user.userId)
  }

  await query
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

// DELETE /api/notifications/:id — удалить уведомление (только админ)
router.delete('/:id', adminOnly, async (req, res) => {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

export default router
