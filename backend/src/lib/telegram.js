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

export function botUsername() {
  return process.env.TELEGRAM_BOT_USERNAME || ''
}
