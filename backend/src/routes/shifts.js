import { Router } from 'express'
import supabase from '../db/supabase.js'
import { authMiddleware, adminOnly } from '../auth.js'

const router = Router()
router.use(authMiddleware)

// GET /api/shifts?date=2026-04-02 — список записей на дату
// Работник видит только свою (одну), админ видит все (с именами и адресами)
router.get('/', async (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'Нужен параметр date' })

  if (req.user.role === 'admin') {
    const { data, error } = await supabase
      .from('shift_entries')
      .select('id, shift_time, user_id, users(name, phone, home_address, home_lat, home_lon)')
      .eq('shift_date', date)
      .order('shift_time')

    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  // Работник — одна запись на день
  const { data, error } = await supabase
    .from('shift_entries')
    .select('id, shift_time')
    .eq('shift_date', date)
    .eq('user_id', req.user.userId)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/shifts — записаться на смену (одна на день)
// Если уже есть запись на этот день — меняем время и уведомляем админа
router.post('/', async (req, res) => {
  const { date, time } = req.body
  if (!date || !time) return res.status(400).json({ error: 'Нужны date и time' })

  // Проверяем: есть ли уже запись на этот день
  const { data: existing } = await supabase
    .from('shift_entries')
    .select('id, shift_time')
    .eq('user_id', req.user.userId)
    .eq('shift_date', date)
    .single()

  if (existing) {
    if (existing.shift_time === time) {
      return res.json(existing) // уже записан на это время
    }

    // Уже есть смена — создаём запрос на перенос (не меняем сразу)
    const [y, m, d] = date.split('-')
    const ruDate = `${d}.${m}.${y}`

    const { data: user } = await supabase
      .from('users')
      .select('name')
      .eq('id', req.user.userId)
      .single()

    // Проверяем: нет ли уже pending запроса на эту дату
    const { data: pendingReq } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', req.user.userId)
      .eq('is_read', false)
      .like('message', `%${ruDate}%`)
      .like('message', '%→%')
      .limit(1)
      .single()

    if (pendingReq) {
      return res.status(409).json({ error: 'У вас уже есть запрос на перенос на этот день' })
    }

    await supabase.from('notifications').insert({
      user_id: req.user.userId,
      message: `${user?.name || 'Работник'} просит перенести ${ruDate}: ${existing.shift_time} → ${time}`,
      is_read: false,
    })

    return res.json({ requested: true, from: existing.shift_time, to: time })
  }

  // Новая запись
  const { data, error } = await supabase
    .from('shift_entries')
    .insert({ user_id: req.user.userId, shift_date: date, shift_time: time })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Вы уже записаны на этот день' })
    return res.status(500).json({ error: error.message })
  }

  res.json(data)
})

// POST /api/shifts/approve-transfer — админ утверждает перенос времени
router.post('/approve-transfer', adminOnly, async (req, res) => {
  const { userId, date, newTime, notificationId } = req.body

  // Обновляем время смены
  const { error } = await supabase
    .from('shift_entries')
    .update({ shift_time: newTime })
    .eq('user_id', userId)
    .eq('shift_date', date)

  if (error) return res.status(500).json({ error: error.message })

  if (notificationId) {
    await supabase
      .from('notifications')
      .update({ is_read: true, status: 'approved' })
      .eq('id', notificationId)
  }

  res.json({ ok: true })
})

// POST /api/shifts/reject-transfer — админ отклоняет перенос
router.post('/reject-transfer', adminOnly, async (req, res) => {
  const { notificationId } = req.body

  if (notificationId) {
    await supabase
      .from('notifications')
      .update({ is_read: true, status: 'rejected' })
      .eq('id', notificationId)
  }

  res.json({ ok: true })
})

// DELETE /api/shifts/:id — отменить запись
router.delete('/:id', async (req, res) => {
  const { id } = req.params

  const query = supabase.from('shift_entries').delete().eq('id', id)
  if (req.user.role !== 'admin') {
    query.eq('user_id', req.user.userId)
  }

  const { error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// GET /api/shifts/optimize-data?date=2026-04-02 — данные для оптимизатора (только админ)
router.get('/optimize-data', adminOnly, async (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'Нужен параметр date' })

  const { data, error } = await supabase
    .from('shift_entries')
    .select('shift_time, users(name, home_address, home_lat, home_lon)')
    .eq('shift_date', date)
    .order('shift_time')

  if (error) return res.status(500).json({ error: error.message })

  const entries = data
    .filter(e => e.users?.home_lat && e.users?.home_lon)
    .map((e, i) => ({
      id: i + 1,
      address: e.users.home_address,
      time: e.shift_time,
      lat: e.users.home_lat,
      lon: e.users.home_lon,
    }))

  res.json(entries)
})

export default router
