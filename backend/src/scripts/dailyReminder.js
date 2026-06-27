import 'dotenv/config'
import supabase from '../db/supabase.js'
import { sendMessage } from '../lib/telegram.js'

// Ежедневное напоминание всем пользователям с привязанным Telegram:
// записаться на смену и внести адрес можно до 18:00 МСК.
// Запускается systemd-таймером в 13:00 UTC (= 16:00 МСК). См. deploy/taxi-reminder.*

const TEXT =
  '⏰ <b>Напоминание</b>\n\n' +
  'Записаться на смену и внести/поменять адрес на сегодня можно <b>до 18:00 по Москве</b>.\n' +
  'После 18:00 запись закрывается. Не забудь отметиться 🚕'

async function main() {
  const { data: users, error } = await supabase
    .from('users')
    .select('telegram_chat_id')
    .not('telegram_chat_id', 'is', null)

  if (error) { console.error('[reminder] supabase:', error.message); process.exit(1) }
  if (!users?.length) { console.log('[reminder] нет пользователей с TG'); return }

  let ok = 0, fail = 0
  for (const u of users) {
    try {
      await sendMessage(u.telegram_chat_id, TEXT)
      ok++
    } catch (e) {
      fail++
      // 403 = пользователь заблокировал бота — это нормально, не считаем ошибкой инфры
    }
    await new Promise(r => setTimeout(r, 60)) // ~16 msg/s, в пределах лимитов Telegram
  }
  console.log(`[reminder] отправлено: ${ok}, не доставлено: ${fail}`)
}

main().then(() => process.exit(0)).catch(e => { console.error('[reminder]', e?.message); process.exit(1) })
