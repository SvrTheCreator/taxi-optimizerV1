import { Router } from 'express'
import supabase from '../db/supabase.js'
import { authMiddleware, adminOnly } from '../auth.js'

const router = Router()
router.use(authMiddleware)

// GET /api/shifts?date=2026-04-02 — список записей на дату
// Работник видит только свои, админ видит все (с именами и адресами)
router.get('/', async (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'Нужен параметр date' })

  if (req.user.role === 'admin') {
    // Админ видит всех записавшихся с их адресами
    const { data, error } = await supabase
      .from('shift_entries')
      .select('id, shift_time, user_id, users(name, phone, home_address, home_lat, home_lon)')
      .eq('shift_date', date)
      .order('shift_time')

    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  // Работник видит только свои записи
  const { data, error } = await supabase
    .from('shift_entries')
    .select('id, shift_time')
    .eq('shift_date', date)
    .eq('user_id', req.user.userId)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/shifts — записаться на смену
router.post('/', async (req, res) => {
  const { date, time } = req.body
  if (!date || !time) return res.status(400).json({ error: 'Нужны date и time' })

  const { data, error } = await supabase
    .from('shift_entries')
    .insert({ user_id: req.user.userId, shift_date: date, shift_time: time })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Вы уже записаны на эту смену' })
    return res.status(500).json({ error: error.message })
  }

  res.json(data)
})

// DELETE /api/shifts/:id — отменить запись
router.delete('/:id', async (req, res) => {
  const { id } = req.params

  // Работник может удалить только свою запись
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

  // Преобразуем в формат для optimizer.js: [{ address, time, lat, lon }]
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
