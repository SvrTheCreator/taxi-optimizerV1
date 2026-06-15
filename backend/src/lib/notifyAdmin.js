import supabase from '../db/supabase.js'
import { sendMessage } from './telegram.js'

// Необязательный список телефонов-получателей оповещений (через запятую).
// Если задан — шлём только этим админам; если пусто — всем админам с привязкой.
// Телефоны в БД хранятся нормализованными (79XXXXXXXXX), поэтому здесь оставляем только цифры.
const ALERT_PHONES = (process.env.ALERT_ADMIN_PHONES || '')
  .split(',')
  .map(p => p.replace(/\D/g, ''))
  .filter(Boolean)

// Шлёт сообщение в Telegram админам-получателям, у кого привязан чат.
// opts.excludeUserId — не слать этому пользователю (чтобы не пинговать самого себя).
// Никогда не роняет основной запрос — оповещение не критично.
// ВАЖНО: на Vercel (serverless) вызывать с await ДО res.json(),
// иначе функция может «заснуть» и сообщение не уйдёт.
export async function notifyAdmins(text, opts = {}) {
  try {
    let query = supabase
      .from('users')
      .select('telegram_chat_id, phone')
      .eq('role', 'admin')
      .not('telegram_chat_id', 'is', null)

    if (ALERT_PHONES.length) query = query.in('phone', ALERT_PHONES)
    if (opts.excludeUserId) query = query.neq('id', opts.excludeUserId)

    const { data: admins } = await query
    if (!admins?.length) return

    await Promise.all(
      admins.map(a => sendMessage(a.telegram_chat_id, text).catch(() => {}))
    )
  } catch {
    // молча игнорируем — сбой оповещения не должен ломать действие пользователя
  }
}
