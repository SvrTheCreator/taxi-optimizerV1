import { Router } from 'express'
import supabase from '../db/supabase.js'
import { authMiddleware, adminOnly } from '../auth.js'

const router = Router()
router.use(authMiddleware)

// GET /api/users/me — свой профиль
router.get('/me', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, phone, name, home_address, home_lat, home_lon, home_updated, role, created_at')
    .eq('id', req.user.userId)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// GET /api/users — список всех (только админ)
router.get('/', adminOnly, async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, phone, name, home_address, role, created_at')
    .order('created_at')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /api/users/:id — удалить пользователя (только админ)
router.delete('/:id', adminOnly, async (req, res) => {
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

export default router
