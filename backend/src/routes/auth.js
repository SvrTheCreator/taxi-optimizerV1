import { Router } from 'express'
import bcrypt from 'bcryptjs'
import supabase from '../db/supabase.js'
import { createToken } from '../auth.js'

const router = Router()

// Телефон админа — задаётся через env, по умолчанию номер жены
const ADMIN_PHONE = process.env.ADMIN_PHONE || '79996958294'

// Нормализуем телефон: 89991234567 → 79991234567
function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('8') && digits.length === 11) {
    return '7' + digits.slice(1)
  }
  return digits
}

// POST /api/auth/register — регистрация нового пользователя
router.post('/register', async (req, res) => {
  const { phone, name, pin } = req.body

  if (!phone || !name || !pin) {
    return res.status(400).json({ error: 'Нужны phone, name и pin' })
  }

  if (!/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'ПИН должен быть 4 цифры' })
  }

  const normalizedPhone = normalizePhone(phone)
  if (normalizedPhone.length !== 11) {
    return res.status(400).json({ error: 'Некорректный номер телефона' })
  }

  // Проверяем что телефон не занят
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('phone', normalizedPhone)
    .single()

  if (existing) {
    return res.status(409).json({ error: 'Этот номер уже зарегистрирован' })
  }

  // Хэшируем ПИН
  const pinHash = await bcrypt.hash(pin, 10)

  // Определяем роль: если телефон совпадает с ADMIN_PHONE → админ
  const role = normalizedPhone === normalizePhone(ADMIN_PHONE) ? 'admin' : 'worker'

  const { data: user, error } = await supabase
    .from('users')
    .insert({ phone: normalizedPhone, name, pin_hash: pinHash, role })
    .select()
    .single()

  if (error) {
    return res.status(500).json({ error: 'Ошибка регистрации: ' + error.message })
  }

  const token = await createToken(user)
  res.json({ token, user: { id: user.id, phone: user.phone, name: user.name, role: user.role } })
})

// POST /api/auth/login — вход по телефону + ПИН
router.post('/login', async (req, res) => {
  const { phone, pin } = req.body

  if (!phone || !pin) {
    return res.status(400).json({ error: 'Нужны phone и pin' })
  }

  const normalizedPhone = normalizePhone(phone)

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('phone', normalizedPhone)
    .single()

  if (!user) {
    return res.status(401).json({ error: 'Пользователь не найден' })
  }

  const pinValid = await bcrypt.compare(pin, user.pin_hash)
  if (!pinValid) {
    return res.status(401).json({ error: 'Неверный ПИН' })
  }

  const token = await createToken(user)
  res.json({ token, user: { id: user.id, phone: user.phone, name: user.name, role: user.role } })
})

export default router
