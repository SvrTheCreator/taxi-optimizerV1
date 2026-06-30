import { Router } from 'express'
import supabase from '../db/supabase.js'
import { authMiddleware, adminOnly } from '../auth.js'
import { isAfterDeadline, DEADLINE_MESSAGE } from '../lib/deadline.js'
import { notifyAdmins } from '../lib/notifyAdmin.js'

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
      .select('id, shift_time, use_temp, user_id, users(name, phone, home_address, home_lat, home_lon, temp_address)')
      .eq('shift_date', date)
      .order('shift_time')

    if (error) return res.status(500).json({ error: error.message })
    // Показываем актуальный адрес (временный или основной)
    const enriched = data.map(s => ({
      ...s,
      display_address: (s.use_temp && s.users?.temp_address) ? s.users.temp_address : s.users?.home_address,
    }))
    return res.json(enriched)
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
  const { date, time, useTemp } = req.body
  if (!date || !time) return res.status(400).json({ error: 'Нужны date и time' })

  const isWorker = req.user.role !== 'admin'

  // Проверяем: есть ли уже запись на этот день
  const { data: existing } = await supabase
    .from('shift_entries')
    .select('id, shift_time, use_temp')
    .eq('user_id', req.user.userId)
    .eq('shift_date', date)
    .single()

  if (existing) {
    // Обновление use_temp без смены времени (прямое изменение — под дедлайн 18:00)
    if (existing.shift_time === time && useTemp !== undefined && existing.use_temp !== useTemp) {
      if (isWorker && isAfterDeadline()) {
        return res.status(403).json({ error: DEADLINE_MESSAGE })
      }
      const update = { use_temp: useTemp }
      // При включении temp — отмечаем использование
      if (useTemp) {
        await supabase.from('users').update({ temp_used_at: new Date().toISOString() }).eq('id', req.user.userId)
      }
      const { data, error } = await supabase
        .from('shift_entries').update(update).eq('id', existing.id).select().single()
      if (error) return res.status(500).json({ error: error.message })
      return res.json(data)
    }

    if (existing.shift_time === time) {
      return res.json(existing)
    }

    // Админ меняет время напрямую
    if (req.user.role === 'admin') {
      const { data, error } = await supabase
        .from('shift_entries')
        .update({ shift_time: time, use_temp: useTemp || false })
        .eq('id', existing.id)
        .select()
        .single()
      if (error) return res.status(500).json({ error: error.message })
      return res.json(data)
    }

    // Работник переносит свою смену — применяем СРАЗУ, без подтверждения
    // админа. Админ лишь получает информационное уведомление.
    const [y, m, d] = date.split('-')
    const ruDate = `${d}.${m}.${y}`
    const fromTime = existing.shift_time

    const { data: user } = await supabase
      .from('users')
      .select('name, home_address, temp_address')
      .eq('id', req.user.userId)
      .single()

    const name = user?.name || 'Работник'
    // Адрес посадки для этой поездки: временный (если включён), иначе домашний
    const address = (existing.use_temp ? user?.temp_address : user?.home_address)
      || user?.home_address || '—'

    // Применяем перенос времени
    const { data: updated, error: updErr } = await supabase
      .from('shift_entries')
      .update({ shift_time: time })
      .eq('id', existing.id)
      .select()
      .single()
    if (updErr) return res.status(500).json({ error: updErr.message })

    // Снимаем прежние непрочитанные уведомления о переносе за этот день,
    // чтобы у админа осталось только последнее.
    await supabase
      .from('notifications')
      .delete()
      .eq('user_id', req.user.userId)
      .eq('is_read', false)
      .like('message', `%${ruDate}%`)
      .like('message', '%→%')

    await supabase.from('notifications').insert({
      user_id: req.user.userId,
      message: `${name} перенёс смену ${ruDate}: ${fromTime} → ${time}\n🏠 ${address}`,
      is_read: false,
      status: 'pending',
    })

    await notifyAdmins(
      `🔄 <b>Перенос смены</b>\n` +
      `${name}\n` +
      `📞 ${req.user.phone}\n` +
      `🏠 ${address}\n` +
      `${ruDate}: ${fromTime} → ${time}`
    )

    return res.json(updated)
  }

  // Новая запись — для работника закрыта после 18:00 (перенос выше остаётся доступен)
  if (isWorker && isAfterDeadline()) {
    return res.status(403).json({ error: DEADLINE_MESSAGE })
  }

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

  // Уведомляем работника
  await supabase.from('notifications').insert({
    user_id: userId,
    message: `Ваш перенос на ${newTime} утверждён`,
    is_read: false,
    status: 'approved',
  })

  res.json({ ok: true })
})

// POST /api/shifts/reject-transfer — админ отклоняет перенос
router.post('/reject-transfer', adminOnly, async (req, res) => {
  const { notificationId } = req.body

  let userId = null
  if (notificationId) {
    const { data: notif } = await supabase
      .from('notifications')
      .select('user_id')
      .eq('id', notificationId)
      .single()
    userId = notif?.user_id

    await supabase
      .from('notifications')
      .update({ is_read: true, status: 'rejected' })
      .eq('id', notificationId)
  }

  // Уведомляем работника
  if (userId) {
    await supabase.from('notifications').insert({
      user_id: userId,
      message: 'Ваш запрос на перенос времени отклонён',
      is_read: false,
      status: 'rejected',
    })
  }

  res.json({ ok: true })
})

// DELETE /api/shifts/:id — отменить запись (разрешено всегда, в т.ч. после 18:00)
router.delete('/:id', async (req, res) => {
  const { id } = req.params

  // Сначала забираем запись (для оповещения админа), потом удаляем
  const { data: entry } = await supabase
    .from('shift_entries')
    .select('shift_date, shift_time, user_id, users(name, phone, home_address)')
    .eq('id', id)
    .single()

  const query = supabase.from('shift_entries').delete().eq('id', id)
  if (req.user.role !== 'admin') {
    query.eq('user_id', req.user.userId)
  }

  const { error } = await query
  if (error) return res.status(500).json({ error: error.message })

  // Если запись отменил сам работник — обязательно сообщаем админу
  if (entry && req.user.role !== 'admin' && entry.user_id === req.user.userId) {
    const [y, m, d] = String(entry.shift_date).split('-')
    const ruDate = `${d}.${m}.${y}`
    const u = entry.users
    const name = u?.name || 'Работник'
    const phone = u?.phone || '—'
    const address = u?.home_address || '—'

    await supabase.from('notifications').insert({
      user_id: req.user.userId,
      message: `${name} (${phone}) ОТМЕНИЛ(А) поездку ${ruDate} на ${entry.shift_time}`,
      is_read: false,
      status: 'pending',
    })

    await notifyAdmins(
      `❌ <b>Отмена поездки</b>\n` +
      `${name}\n` +
      `📞 ${phone}\n` +
      `🏠 ${address}\n` +
      `${ruDate}, было ${entry.shift_time}`
    )
  }

  res.json({ ok: true })
})

// GET /api/shifts/optimize-data?date=2026-04-02 — данные для оптимизатора (только админ)
router.get('/optimize-data', adminOnly, async (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'Нужен параметр date' })

  const { data, error } = await supabase
    .from('shift_entries')
    .select('shift_time, use_temp, users(name, home_address, home_lat, home_lon, temp_address, temp_lat, temp_lon)')
    .eq('shift_date', date)
    .order('shift_time')

  if (error) return res.status(500).json({ error: error.message })

  const entries = data
    .filter(e => e.users?.home_lat && e.users?.home_lon)
    .map((e, i) => {
      const useTemp = e.use_temp && e.users.temp_lat && e.users.temp_lon
      return {
        id: i + 1,
        address: useTemp ? e.users.temp_address : e.users.home_address,
        time: e.shift_time,
        lat: useTemp ? e.users.temp_lat : e.users.home_lat,
        lon: useTemp ? e.users.temp_lon : e.users.home_lon,
      }
    })

  res.json(entries)
})

export default router
