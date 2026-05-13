import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import supabase from '../db/supabase.js'
import { createToken } from '../auth.js'
import { sendMessage } from '../lib/telegram.js'

const router = Router()

// Телефоны админов — через запятую в env
const ADMIN_PHONES = (process.env.ADMIN_PHONE || '79996958294').split(',').map(p => p.trim())

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

// POST /api/auth/register-via-tg — регистрация через TG-сессию (телефон+имя+chat_id из бота)
router.post('/register-via-tg', async (req, res) => {
  const { token, pin } = req.body
  if (!token || !pin) return res.status(400).json({ error: 'Нужны token и pin' })
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN должен быть 4 цифры' })

  const { data: session } = await supabase
    .from('registration_sessions')
    .select('*')
    .eq('token', token)
    .single()

  if (!session) return res.status(400).json({ error: 'Сессия не найдена' })
  if (session.used_at) return res.status(400).json({ error: 'Сессия уже использована' })
  if (new Date(session.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Сессия истекла, начни заново через бота' })
  }

  // Проверяем, что юзер ещё не создан (на случай гонок)
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('phone', session.phone)
    .single()

  if (existing) {
    return res.status(409).json({ error: 'Этот номер уже зарегистрирован' })
  }

  const isAdmin = ADMIN_PHONES.some(p => normalizePhone(p) === session.phone)
  const pinHash = await bcrypt.hash(pin, 10)

  const { data: user, error } = await supabase
    .from('users')
    .insert({
      phone: session.phone,
      name: session.name,
      pin_hash: pinHash,
      role: isAdmin ? 'admin' : 'worker',
      telegram_chat_id: session.telegram_chat_id,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: 'Ошибка регистрации: ' + error.message })

  await supabase
    .from('registration_sessions')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token)

  const authToken = await createToken(user)
  res.json({
    token: authToken,
    user: { id: user.id, phone: user.phone, name: user.name, role: user.role },
  })
})

// GET /api/auth/registration-session?token=... — публичная инфа о TG-сессии (для пред-заполнения формы)
router.get('/registration-session', async (req, res) => {
  const { token } = req.query
  if (!token) return res.status(400).json({ error: 'Нужен token' })

  const { data: session } = await supabase
    .from('registration_sessions')
    .select('phone, name, expires_at, used_at')
    .eq('token', token)
    .single()

  if (!session) return res.status(404).json({ error: 'Сессия не найдена' })
  if (session.used_at) return res.status(410).json({ error: 'Сессия уже использована' })
  if (new Date(session.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Сессия истекла' })
  }

  res.json({ phone: session.phone, name: session.name })
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

const PIN_RECOVERY_TTL_MIN = 10

function genRecoveryCode() {
  // 6 цифр — простой ввод, достаточно для краткоживущего кода
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

// POST /api/auth/forgot-pin/request — телефон → отправить 6-значный код в TG
router.post('/forgot-pin/request', async (req, res) => {
  const { phone } = req.body
  if (!phone) return res.status(400).json({ error: 'Нужен phone' })

  const normalizedPhone = normalizePhone(phone)

  const { data: user } = await supabase
    .from('users')
    .select('id, telegram_chat_id, name')
    .eq('phone', normalizedPhone)
    .single()

  // Намеренно отвечаем одинаково и при отсутствии юзера, и при отсутствии привязки,
  // чтобы не подсказывать атакующему какие телефоны зарегистрированы
  const genericOk = { ok: true, message: 'Если телефон зарегистрирован и привязан Telegram — код отправлен' }

  if (!user || !user.telegram_chat_id) {
    return res.json(genericOk)
  }

  // Инвалидируем предыдущие неиспользованные коды этого юзера
  await supabase
    .from('pin_recovery_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('used_at', null)

  const code = genRecoveryCode()
  const codeHash = await bcrypt.hash(code, 10)
  const expiresAt = new Date(Date.now() + PIN_RECOVERY_TTL_MIN * 60 * 1000).toISOString()

  const { error: insertErr } = await supabase
    .from('pin_recovery_codes')
    .insert({ user_id: user.id, code_hash: codeHash, expires_at: expiresAt })

  if (insertErr) return res.status(500).json({ error: insertErr.message })

  try {
    await sendMessage(user.telegram_chat_id,
      `🔐 Код восстановления PIN: <b>${code}</b>\n\nДействителен ${PIN_RECOVERY_TTL_MIN} минут.\n\nЕсли это не ты — игнорируй сообщение.`
    )
  } catch (err) {
    return res.status(500).json({ error: 'Не удалось отправить код в Telegram: ' + err.message })
  }

  res.json(genericOk)
})

// POST /api/auth/forgot-pin/verify — телефон + код + новый PIN → меняем pin_hash
router.post('/forgot-pin/verify', async (req, res) => {
  const { phone, code, newPin } = req.body
  if (!phone || !code || !newPin) {
    return res.status(400).json({ error: 'Нужны phone, code и newPin' })
  }
  if (!/^\d{4}$/.test(newPin)) {
    return res.status(400).json({ error: 'PIN должен быть 4 цифры' })
  }

  const normalizedPhone = normalizePhone(phone)

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('phone', normalizedPhone)
    .single()

  if (!user) return res.status(400).json({ error: 'Неверный код' })

  // Берём последний активный код юзера
  const { data: rec } = await supabase
    .from('pin_recovery_codes')
    .select('*')
    .eq('user_id', user.id)
    .is('used_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!rec) return res.status(400).json({ error: 'Неверный код' })
  if (new Date(rec.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Код просрочен' })
  }

  const valid = await bcrypt.compare(code, rec.code_hash)
  if (!valid) return res.status(400).json({ error: 'Неверный код' })

  // Помечаем код использованным и меняем PIN
  const newHash = await bcrypt.hash(newPin, 10)
  await supabase.from('users').update({ pin_hash: newHash }).eq('id', user.id)
  await supabase
    .from('pin_recovery_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', rec.id)

  res.json({ ok: true })
})

export default router
