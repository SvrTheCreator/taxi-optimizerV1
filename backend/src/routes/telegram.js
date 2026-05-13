import { Router } from 'express'
import crypto from 'crypto'
import supabase from '../db/supabase.js'
import { authMiddleware } from '../auth.js'
import { sendMessage, botUsername } from '../lib/telegram.js'

function publicUrl() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://taxi-optimizer-v1.vercel.app'
}

const router = Router()

const BINDING_TTL_MIN = 15
const REGISTRATION_TTL_MIN = 30

function genToken() {
  return crypto.randomBytes(16).toString('hex') // 32 hex chars
}

function normalizePhone(phone) {
  let cleaned = String(phone).replace(/[\s\-()]/g, '')
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1)
  const digits = cleaned.replace(/\D/g, '')
  if (digits.startsWith('8') && digits.length === 11) return '7' + digits.slice(1)
  return digits
}

// POST /api/telegram/bind/start — авторизованный юзер начинает привязку
// Возвращает deep-link, по которому юзер открывает бота
router.post('/bind/start', authMiddleware, async (req, res) => {
  const userId = req.user.userId
  const token = genToken()
  const expiresAt = new Date(Date.now() + BINDING_TTL_MIN * 60 * 1000).toISOString()

  const { error } = await supabase
    .from('telegram_binding_tokens')
    .insert({ token, user_id: userId, expires_at: expiresAt })

  if (error) return res.status(500).json({ error: error.message })

  const username = botUsername()
  if (!username) {
    return res.status(500).json({ error: 'TELEGRAM_BOT_USERNAME not configured' })
  }

  res.json({
    url: `https://t.me/${username}?start=${token}`,
    expiresInMinutes: BINDING_TTL_MIN,
  })
})

// GET /api/telegram/me — статус привязки текущего юзера
router.get('/me', authMiddleware, async (req, res) => {
  const { data } = await supabase
    .from('users')
    .select('telegram_chat_id')
    .eq('id', req.user.userId)
    .single()

  res.json({ linked: !!data?.telegram_chat_id })
})

// DELETE /api/telegram/me — отвязать (юзер сам)
router.delete('/me', authMiddleware, async (req, res) => {
  const { error } = await supabase
    .from('users')
    .update({ telegram_chat_id: null })
    .eq('id', req.user.userId)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// POST /api/telegram/webhook — приёмник апдейтов от Telegram
// Защищено заголовком X-Telegram-Bot-Api-Secret-Token (выставляется в setWebhook)
router.post('/webhook', async (req, res) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const update = req.body
  const message = update?.message
  if (!message) {
    return res.json({ ok: true })
  }

  const chatId = message.chat.id

  // Юзер поделился контактом (после кнопки request_contact) → создаём сессию регистрации
  if (message.contact) {
    const c = message.contact
    // Безопасность: принимаем только контакт самого пользователя, не чужой
    if (c.user_id && c.user_id !== message.from?.id) {
      await sendMessage(chatId, '❌ Можно поделиться только своим контактом.')
      return res.json({ ok: true })
    }

    const phone = normalizePhone(c.phone_number)
    if (phone.length !== 11 || !phone.startsWith('7')) {
      await sendMessage(chatId, '❌ Поддерживаются только российские номера (+7).')
      return res.json({ ok: true })
    }

    const name = (c.first_name || message.from?.first_name || 'Пользователь').trim()

    // Если юзер с таким телефоном уже есть — либо привязываем TG, либо сообщаем что уже всё привязано
    const { data: existing } = await supabase
      .from('users')
      .select('id, telegram_chat_id, name')
      .eq('phone', phone)
      .single()

    if (existing) {
      if (existing.telegram_chat_id) {
        // Уже привязан — ничего не делаем
        if (existing.telegram_chat_id === chatId) {
          await sendMessage(chatId,
            '✅ Этот аккаунт уже привязан к твоему Telegram.\n\nЕсли забыл PIN — на сайте нажми <b>«Забыл PIN»</b>.',
            { reply_markup: { remove_keyboard: true } }
          )
        } else {
          await sendMessage(chatId,
            '❗️ К этому номеру уже привязан другой Telegram.\n\nЕсли это твой аккаунт — обратись к админу.',
            { reply_markup: { remove_keyboard: true } }
          )
        }
        return res.json({ ok: true })
      }

      // Аккаунт есть, TG не привязан — привязываем сейчас
      await supabase.from('users').update({ telegram_chat_id: chatId }).eq('id', existing.id)
      await sendMessage(chatId,
        `✅ Привет, ${existing.name}! Я привязал твой Telegram к существующему аккаунту.\n\n` +
        'Теперь на сайте нажми <b>«Забыл PIN»</b> на странице входа — я пришлю сюда код для смены PIN.',
        { reply_markup: { remove_keyboard: true } }
      )
      return res.json({ ok: true })
    }

    // Инвалидируем старые сессии этого телефона
    await supabase
      .from('registration_sessions')
      .update({ used_at: new Date().toISOString() })
      .eq('phone', phone)
      .is('used_at', null)

    const token = genToken()
    const expiresAt = new Date(Date.now() + REGISTRATION_TTL_MIN * 60 * 1000).toISOString()

    const { error } = await supabase
      .from('registration_sessions')
      .insert({ token, phone, name, telegram_chat_id: chatId, expires_at: expiresAt })

    if (error) {
      await sendMessage(chatId, '❌ Ошибка сервера. Попробуй ещё раз.')
      return res.json({ ok: true })
    }

    const link = `${publicUrl()}/?regToken=${token}`
    await sendMessage(chatId,
      `✅ Получил контакт.\n\nОткрой ссылку, чтобы придумать PIN и закончить регистрацию:\n${link}\n\nСсылка действует ${REGISTRATION_TTL_MIN} минут.`,
      { reply_markup: { remove_keyboard: true } }
    )
    return res.json({ ok: true })
  }

  if (!message.text) {
    return res.json({ ok: true })
  }

  const text = message.text.trim()

  // /start <payload> — варианты:
  //   /start register — начало регистрации (просим контакт)
  //   /start <hex32>  — привязка существующего аккаунта
  //   /start          — справка
  const startMatch = text.match(/^\/start(?:\s+(\S+))?$/)
  if (startMatch) {
    const token = startMatch[1]

    // Регистрация — просим контакт через keyboard
    if (token === 'register') {
      await sendMessage(chatId,
        'Привет! Чтобы зарегистрироваться, поделись своим номером — нажми кнопку внизу.\n\n' +
        '<i>Бот увидит только твой номер, имя и Telegram ID — больше ничего.</i>',
        {
          reply_markup: {
            keyboard: [[{ text: '📱 Поделиться контактом', request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      )
      return res.json({ ok: true })
    }

    if (!token) {
      await sendMessage(chatId,
        'Привет! Я бот «Такси Оптимизатор».\n\n' +
        '• <b>Регистрация</b> — открой сайт и нажми «Регистрация через Telegram»\n' +
        '• <b>Восстановление PIN</b> — на странице входа нажми «Забыл PIN»\n' +
        '• <b>Привязка существующего аккаунта</b> — в профиле нажми «Привязать Telegram»'
      )
      return res.json({ ok: true })
    }

    const { data: binding } = await supabase
      .from('telegram_binding_tokens')
      .select('*')
      .eq('token', token)
      .single()

    if (!binding) {
      await sendMessage(chatId, '❌ Ссылка не найдена. Запроси новую в приложении.')
      return res.json({ ok: true })
    }

    if (binding.used_at) {
      await sendMessage(chatId, '❌ Эта ссылка уже использована. Запроси новую в приложении.')
      return res.json({ ok: true })
    }

    if (new Date(binding.expires_at) < new Date()) {
      await sendMessage(chatId, '❌ Срок действия ссылки истёк. Запроси новую в приложении.')
      return res.json({ ok: true })
    }

    // Привязываем
    await supabase.from('users').update({ telegram_chat_id: chatId }).eq('id', binding.user_id)
    await supabase
      .from('telegram_binding_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('token', token)

    await sendMessage(chatId,
      '✅ Telegram привязан!\n\n' +
      'Теперь если забудешь PIN — на странице входа нажми «Забыли PIN?» и получишь код сюда.'
    )
    return res.json({ ok: true })
  }

  // Остальное игнорируем, но дружелюбно отвечаем
  await sendMessage(chatId, 'Я понимаю только команду /start. Зайди в приложение, чтобы начать привязку.')
  res.json({ ok: true })
})

export default router
