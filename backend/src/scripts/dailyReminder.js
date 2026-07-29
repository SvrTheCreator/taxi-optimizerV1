import 'dotenv/config'
import supabase from '../db/supabase.js'
import { sendMessageRetry } from '../lib/telegram.js'

// Ежедневное напоминание всем пользователям с привязанным Telegram:
// записаться на смену и внести адрес можно до 18:00 МСК.
// Запускается systemd-таймером в 13:00 UTC (= 16:00 МСК). См. deploy/taxi-reminder.*

const TEXT =
  '⏰ <b>Напоминание</b>\n\n' +
  'Записаться на смену и внести/поменять адрес на сегодня можно <b>до 18:00 по Москве</b>.\n' +
  'После 18:00 запись закрывается. Не забудь отметиться 🚕'

// Supabase за границей — RU→заграница иногда моргает единичным "fetch failed".
// Без повтора напоминание за день пропало бы целиком. Повторяем несколько раз.
async function queryWithRetry(build, tries = 4) {
  let lastErr
  for (let i = 1; i <= tries; i++) {
    const res = await build()
    if (!res.error) return res
    lastErr = res.error
    console.error(`[reminder] supabase попытка ${i}/${tries}: ${res.error.message}`)
    if (i < tries) await new Promise(r => setTimeout(r, 1500 * i))
  }
  throw new Error(`[reminder] supabase: не удалось после ${tries} попыток — ${lastErr?.message}`)
}

async function main() {
  const { data: users } = await queryWithRetry(() => supabase
    .from('users')
    .select('telegram_chat_id')
    .not('telegram_chat_id', 'is', null))

  if (!users?.length) { console.log('[reminder] нет пользователей с TG'); return }

  let ok = 0, fail = 0
  for (const u of users) {
    try {
      await sendMessageRetry(u.telegram_chat_id, TEXT)
      ok++
    } catch (e) {
      fail++
      // 403 = пользователь заблокировал бота — это нормально (ретрай его не повторяет)
    }
    await new Promise(r => setTimeout(r, 60)) // ~16 msg/s, в пределах лимитов Telegram
  }
  console.log(`[reminder] отправлено: ${ok}, не доставлено: ${fail}`)
}

main().then(() => process.exit(0)).catch(e => { console.error('[reminder]', e?.message); process.exit(1) })
