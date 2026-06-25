import { Router } from 'express'
import supabase from '../db/supabase.js'
import { authMiddleware, adminOnly } from '../auth.js'
import { isAfterDeadline, DEADLINE_MESSAGE } from '../lib/deadline.js'
import { notifyAdmins } from '../lib/notifyAdmin.js'

const router = Router()
router.use(authMiddleware)

// POST /api/address-requests — подать заявку на смену адреса
// autoApprove: true — для первого адреса (сразу сохраняем, без одобрения)
router.post('/', async (req, res) => {
  const { address, lat, lon, autoApprove } = req.body
  if (!address || lat == null || lon == null) {
    return res.status(400).json({ error: 'Нужны address, lat и lon' })
  }

  // Если autoApprove — сразу записываем адрес пользователю.
  // ПЕРВЫЙ ввод адреса НЕ подпадает под дедлайн 18:00 (нужен для онбординга/регистрации).
  if (autoApprove) {
    const { data: user } = await supabase
      .from('users')
      .select('home_address')
      .eq('id', req.user.userId)
      .single()

    // autoApprove только если у юзера ещё нет адреса
    if (user?.home_address) {
      return res.status(400).json({ error: 'Адрес уже установлен, используйте заявку' })
    }

    const { error: updErr } = await supabase
      .from('users')
      .update({ home_address: address, home_lat: lat, home_lon: lon, home_updated: new Date().toISOString() })
      .eq('id', req.user.userId)

    if (updErr) return res.status(500).json({ error: updErr.message })

    return res.json({ ok: true, autoApproved: true })
  }

  // Дедлайн 18:00 МСК — на СМЕНУ адреса (первый ввод выше уже разрешён всегда).
  // Админ вносит изменения в любое время.
  if (req.user.role !== 'admin' && isAfterDeadline()) {
    return res.status(403).json({ error: DEADLINE_MESSAGE })
  }

  // Проверяем: нет ли уже pending заявки
  const { data: pending } = await supabase
    .from('address_requests')
    .select('id')
    .eq('user_id', req.user.userId)
    .eq('status', 'pending')
    .single()

  if (pending) {
    return res.status(409).json({ error: 'У вас уже есть заявка на рассмотрении' })
  }

  const { data, error } = await supabase
    .from('address_requests')
    .insert({
      user_id: req.user.userId,
      new_address: address,
      new_lat: lat,
      new_lon: lon,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Оповещаем админа в Telegram (имя берём из БД — в токене его нет)
  const { data: applicant } = await supabase
    .from('users')
    .select('name, home_address')
    .eq('id', req.user.userId)
    .single()
  await notifyAdmins(
    `🏠 <b>Заявка на смену адреса</b>\n` +
    `От: ${applicant?.name || 'работник'}\n` +
    `Было: ${applicant?.home_address || '—'}\n` +
    `Новый: ${address}`
  )

  res.json(data)
})

// GET /api/address-requests — список заявок
// Админ: все pending, работник: свои
router.get('/', async (req, res) => {
  let query = supabase
    .from('address_requests')
    .select('*, users(name, phone, home_address)')
    .order('created_at', { ascending: false })

  if (req.user.role !== 'admin') {
    query = query.eq('user_id', req.user.userId)
  } else {
    // Админ видит в первую очередь pending
    query = query.order('status', { ascending: true })
  }

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// PATCH /api/address-requests/:id — утвердить или отклонить (только админ)
router.patch('/:id', adminOnly, async (req, res) => {
  const { status, comment } = req.body
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status должен быть approved или rejected' })
  }

  // Получаем заявку
  const { data: request } = await supabase
    .from('address_requests')
    .select('*')
    .eq('id', req.params.id)
    .eq('status', 'pending')
    .single()

  if (!request) {
    return res.status(404).json({ error: 'Заявка не найдена или уже обработана' })
  }

  // Обновляем статус заявки
  await supabase
    .from('address_requests')
    .update({ status, admin_comment: comment || null, resolved_at: new Date().toISOString() })
    .eq('id', req.params.id)

  // Если утверждено — обновляем адрес пользователя
  if (status === 'approved') {
    await supabase
      .from('users')
      .update({
        home_address: request.new_address,
        home_lat: request.new_lat,
        home_lon: request.new_lon,
        home_updated: new Date().toISOString(),
      })
      .eq('id', request.user_id)
  }

  // Уведомляем работника о решении
  const statusText = status === 'approved' ? 'утверждена' : 'отклонена'
  await supabase.from('notifications').insert({
    user_id: request.user_id,
    message: `Ваша заявка на смену адреса (${request.new_address}) ${statusText}`,
    is_read: false,
    status: status === 'approved' ? 'approved' : 'rejected',
  })

  res.json({ ok: true, status })
})

// DELETE /api/address-requests/:id — удалить заявку (только админ)
router.delete('/:id', adminOnly, async (req, res) => {
  const { error } = await supabase
    .from('address_requests')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

export default router
