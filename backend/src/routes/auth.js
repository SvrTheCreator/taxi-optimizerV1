import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import supabase from '../db/supabase.js'
import { createToken, authMiddleware, adminOnly } from '../auth.js'

const router = Router()

// Телефон админа — задаётся через env
const ADMIN_PHONE = process.env.ADMIN_PHONE || '79996958294'

// Нормализуем телефон: +79991234567 / 89991234567 / 79991234567 → 79991234567
function normalizePhone(phone) {
  let cleaned = phone.replace(/[\s\-()]/g, '')
  // Убираем ведущий +
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1)
  const digits = cleaned.replace(/\D/g, '')
  if (digits.startsWith('8') && digits.length === 11) {
    return '7' + digits.slice(1)
  }
  return digits
}

// Генерация 4-символьного кода (буквы + цифры, без путаницы O/0, I/1)
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  const bytes = crypto.randomBytes(4)
  for (let i = 0; i < 4; i++) {
    code += chars[bytes[i] % chars.length]
  }
  return code
}

// POST /api/auth/register — регистрация (нужен инвайт-код, кроме админа)
router.post('/register', async (req, res) => {
  const { phone, name, pin, inviteCode } = req.body

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

  const isAdmin = normalizedPhone === normalizePhone(ADMIN_PHONE)

  // Работнику нужен инвайт-код, админу — нет
  let invite = null
  if (!isAdmin) {
    if (!inviteCode) {
      return res.status(400).json({ error: 'Нужен код приглашения' })
    }

    const { data } = await supabase
      .from('invite_codes')
      .select('*')
      .eq('code', inviteCode.toUpperCase())
      .is('used_by', null)
      .single()

    if (!data) {
      return res.status(400).json({ error: 'Неверный или использованный код' })
    }
    invite = data
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
  const role = isAdmin ? 'admin' : 'worker'

  const { data: user, error } = await supabase
    .from('users')
    .insert({ phone: normalizedPhone, name, pin_hash: pinHash, role })
    .select()
    .single()

  if (error) {
    return res.status(500).json({ error: 'Ошибка регистрации: ' + error.message })
  }

  // Помечаем инвайт-код как использованный
  if (invite) {
    await supabase
      .from('invite_codes')
      .update({ used_by: user.id, used_at: new Date().toISOString() })
      .eq('id', invite.id)
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

// POST /api/auth/invite — сгенерировать инвайт-код (только админ)
router.post('/invite', authMiddleware, adminOnly, async (req, res) => {
  const code = generateCode()

  const { data, error } = await supabase
    .from('invite_codes')
    .insert({ code, created_by: req.user.userId })
    .select()
    .single()

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  res.json({ code: data.code })
})

// GET /api/auth/invites — список кодов (только админ)
router.get('/invites', authMiddleware, adminOnly, async (req, res) => {
  const { data, error } = await supabase
    .from('invite_codes')
    .select('code, created_at, used_by, used_at, users:used_by(name, phone)')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

export default router
