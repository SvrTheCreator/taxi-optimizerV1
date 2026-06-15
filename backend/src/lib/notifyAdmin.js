import supabase from '../db/supabase.js'
import { sendMessage } from './telegram.js'

// Шлёт сообщение в Telegram всем админам, у кого привязан чат.
// Никогда не роняет основной запрос — оповещение не критично.
// ВАЖНО: на Vercel (serverless) вызывать с await ДО res.json(),
// иначе функция может «заснуть» и сообщение не уйдёт.
export async function notifyAdmins(text) {
  try {
    const { data: admins } = await supabase
      .from('users')
      .select('telegram_chat_id')
      .eq('role', 'admin')
      .not('telegram_chat_id', 'is', null)

    if (!admins?.length) return

    await Promise.all(
      admins.map(a => sendMessage(a.telegram_chat_id, text).catch(() => {}))
    )
  } catch {
    // молча игнорируем — сбой оповещения не должен ломать действие пользователя
  }
}
