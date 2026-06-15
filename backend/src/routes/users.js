import { Router } from 'express'
import supabase from '../db/supabase.js'
import { authMiddleware, adminOnly } from '../auth.js'
import { isAfterDeadline, DEADLINE_MESSAGE } from '../lib/deadline.js'
import { notifyAdmins } from '../lib/notifyAdmin.js'

const router = Router()
router.use(authMiddleware)

// GET /api/users/me — свой профиль
router.get('/me', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, phone, name, home_address, home_lat, home_lon, home_updated, temp_address, temp_lat, temp_lon, temp_used_at, role, created_at')
    .eq('id', req.user.userId)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// PATCH /api/users/me/address — админ обновляет свой адрес напрямую
router.patch('/me/address', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Только для администратора' })
  }
  const { address, lat, lon } = req.body
  if (!address || lat == null || lon == null) {
    return res.status(400).json({ error: 'Нужны address, lat и lon' })
  }

  const { error } = await supabase
    .from('users')
    .update({ home_address: address, home_lat: lat, home_lon: lon, home_updated: new Date().toISOString() })
    .eq('id', req.user.userId)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// PATCH /api/users/me/temp-address — установить временный адрес (раз в месяц)
router.patch('/me/temp-address', async (req, res) => {
  const { address, lat, lon } = req.body
  if (!address || lat == null || lon == null) {
    return res.status(400).json({ error: 'Нужны address, lat и lon' })
  }

  // Дедлайн 18:00 МСК — для работников
  if (req.user.role !== 'admin' && isAfterDeadline()) {
    return res.status(403).json({ error: DEADLINE_MESSAGE })
  }

  // Проверяем: использовался ли временный адрес в этом месяце
  const { data: user } = await supabase
    .from('users')
    .select('temp_used_at, name')
    .eq('id', req.user.userId)
    .single()

  if (user?.temp_used_at) {
    const lastUsed = new Date(user.temp_used_at)
    const now = new Date()
    if (lastUsed.getMonth() === now.getMonth() && lastUsed.getFullYear() === now.getFullYear()) {
      return res.status(409).json({ error: 'Временный адрес уже использован в этом месяце' })
    }
  }

  const { error } = await supabase
    .from('users')
    .update({ temp_address: address, temp_lat: lat, temp_lon: lon })
    .eq('id', req.user.userId)

  if (error) return res.status(500).json({ error: error.message })

  // Уведомляем админа
  await supabase.from('notifications').insert({
    user_id: req.user.userId,
    message: `${user?.name || 'Работник'} установил временный адрес: ${address}`,
    is_read: false,
    status: 'pending',
  })

  await notifyAdmins(
    `📍 <b>Временный адрес</b>\n` +
    `${user?.name || 'Работник'}: ${address}`
  )

  res.json({ ok: true })
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
  // Очищаем ссылки в invite_codes перед удалением
  await supabase.from('invite_codes').update({ used_by: null }).eq('used_by', req.params.id)
  await supabase.from('invite_codes').update({ created_by: null }).eq('created_by', req.params.id)

  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

export default router
