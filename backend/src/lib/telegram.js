const TG_API = 'https://api.telegram.org/bot'

function token() {
  const t = process.env.TELEGRAM_BOT_TOKEN
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN not set')
  return t
}

export async function sendMessage(chatId, text, opts = {}) {
  const res = await fetch(`${TG_API}${token()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...opts }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Telegram sendMessage failed: ${data.description}`)
  return data.result
}

export async function setWebhook(url, secretToken) {
  const res = await fetch(`${TG_API}${token()}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      secret_token: secretToken,
      allowed_updates: ['message'],
    }),
  })
  return res.json()
}

export async function deleteWebhook() {
  // drop_pending_updates=false — НЕ теряем застрявшие апдейты: после старта polling
  // сервер их обработает (тем, кто пытался зарегаться, прилетит свежая ссылка).
  const res = await fetch(`${TG_API}${token()}/deleteWebhook?drop_pending_updates=false`)
  return res.json()
}

// Long-polling: один запрос ждёт до `timeout` секунд новых апдейтов.
export async function getUpdates(offset, timeout = 50) {
  const url = `${TG_API}${token()}/getUpdates?timeout=${timeout}` +
    (offset ? `&offset=${offset}` : '') +
    `&allowed_updates=${encodeURIComponent('["message"]')}`
  // фетч-таймаут чуть больше long-poll timeout, чтобы не рвать соединение раньше Telegram
  const res = await fetch(url, { signal: AbortSignal.timeout((timeout + 10) * 1000) })
  const data = await res.json()
  if (!data.ok) throw new Error(`getUpdates failed: ${data.description}`)
  return data.result
}

export function botUsername() {
  return process.env.TELEGRAM_BOT_USERNAME || ''
}
