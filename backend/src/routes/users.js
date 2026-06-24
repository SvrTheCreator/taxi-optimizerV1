import { Router } from 'express'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import supabase from '../db/supabase.js'
import { authMiddleware, adminOnly } from '../auth.js'
import { isAfterDeadline, DEADLINE_MESSAGE } from '../lib/deadline.js'
import { notifyAdmins } from '../lib/notifyAdmin.js'

const router = Router()
router.use(authMiddleware)

const REG_CODE_TTL_DAYS = 14
const PIN_RESET_TTL_HOURS = 24

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

  // Оповещаем других админов в Telegram (себя — исключаем)
  const { data: me } = await supabase
    .from('users')
    .select('name')
    .eq('id', req.user.userId)
    .single()
  await notifyAdmins(
    `🏠 <b>Админ сменил адрес</b>\n` +
    `${me?.name || 'Админ'}: ${address}`,
    { excludeUserId: req.user.userId }
  )

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

// POST /api/users/registration-code — админ генерит код регистрации для работника без TG
router.post('/registration-code', adminOnly, async (req, res) => {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  const expiresAt = new Date(Date.now() + REG_CODE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('registration_codes')
    .insert({ code, created_by: req.user.userId, expires_at: expiresAt })
    .select('code, expires_at')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// GET /api/users/registration-codes — активные (неиспользованные, не просроченные) коды
router.get('/registration-codes', adminOnly, async (req, res) => {
  const { data, error } = await supabase
    .from('registration_codes')
    .select('id, code, expires_at, created_at')
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /api/users/registration-code/:id — отозвать неиспользованный код
router.delete('/registration-code/:id', adminOnly, async (req, res) => {
  const { error } = await supabase
    .from('registration_codes')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// POST /api/users/:id/reset-pin-code — админ генерит код сброса PIN для работника без TG.
// Работник вводит его в «Забыл PIN» и сам задаёт новый PIN (переиспользуем pin_recovery_codes).
router.post('/:id/reset-pin-code', adminOnly, async (req, res) => {
  const { data: user } = await supabase
    .from('users')
    .select('id, name')
    .eq('id', req.params.id)
    .single()

  if (!user) return res.status(404).json({ error: 'Пользователь не найден' })

  // Гасим прежние активные коды этого юзера
  await supabase
    .from('pin_recovery_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('used_at', null)

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  const codeHash = await bcrypt.hash(code, 10)
  const expiresAt = new Date(Date.now() + PIN_RESET_TTL_HOURS * 60 * 60 * 1000).toISOString()

  const { error } = await supabase
    .from('pin_recovery_codes')
    .insert({ user_id: user.id, code_hash: codeHash, expires_at: expiresAt })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ code, name: user.name, ttlHours: PIN_RESET_TTL_HOURS })
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
