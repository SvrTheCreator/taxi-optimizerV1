import 'dotenv/config'
import supabase from '../db/supabase.js'
import { sendMessage } from '../lib/telegram.js'
import { shortAddr } from '../lib/address.js'

// Ежедневный список записавшихся на смены — тот же, что админ видит в приложении
// (время + имя + адрес). Уходит в Telegram всем админам с привязкой ровно в 18:00 МСК,
// когда запись на сегодня закрывается. Запускается systemd-таймером в 15:00 UTC.
// См. deploy/taxi-triplist.{service,timer}.
//
// Дата берётся как new Date().toISOString() (UTC) — совпадает с тем, как фронт
// вычисляет shift_date (WorkerPage/AdminPage todayStr). В 15:00 UTC UTC-дата и
// МСК-дата совпадают, так что список — ровно за сегодняшний рабочий день.

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function ddmm(iso) {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}`
}

function buildMessage(dateIso, entries) {
  const header = `🚕 <b>Поездки на ${ddmm(dateIso)}</b>`
  if (!entries.length) {
    return `${header}\n\nНа сегодня никто не записался.`
  }

  // Группируем по времени смены, сохраняя порядок (запрос уже .order('shift_time')).
  const byTime = new Map()
  for (const e of entries) {
    if (!byTime.has(e.time)) byTime.set(e.time, [])
    byTime.get(e.time).push(e)
  }

  const blocks = []
  for (const [time, list] of byTime) {
    const lines = list
      .map(e => {
        const addr = e.address ? esc(shortAddr(e.address)) : '<i>адрес не указан</i>'
        const temp = e.useTemp ? ' <i>(врем.)</i>' : ''
        return `• ${esc(e.name || 'Без имени')} — ${addr}${temp}`
      })
      .join('\n')
    blocks.push(`<b>${esc(time)}</b> — ${list.length} чел.\n${lines}`)
  }

  return `${header}\n\n${blocks.join('\n\n')}\n\nВсего: ${entries.length}`
}

async function main() {
  const today = new Date().toISOString().split('T')[0]

  // Список в приложении = зарегистрированные (shift_entries) + «кнопочные»
  // работники из ростера (manual_shift_entries). AdminPage сливает оба
  // источника, поэтому и здесь берём оба — иначе список будет неполным.
  const [regRes, manRes] = await Promise.all([
    supabase
      .from('shift_entries')
      .select('shift_time, use_temp, users(name, home_address, temp_address)')
      .eq('shift_date', today)
      .order('shift_time'),
    supabase
      .from('manual_shift_entries')
      .select('shift_time, manual_workers(name, address)')
      .eq('shift_date', today)
      .order('shift_time'),
  ])

  if (regRes.error) { console.error('[triplist] supabase:', regRes.error.message); process.exit(1) }
  if (manRes.error) { console.error('[triplist] supabase (manual):', manRes.error.message); process.exit(1) }

  const registered = (regRes.data || []).map(e => {
    const useTemp = e.use_temp && !!e.users?.temp_address
    return {
      name: e.users?.name,
      time: e.shift_time,
      address: useTemp ? e.users.temp_address : e.users?.home_address,
      useTemp,
    }
  })

  const manual = (manRes.data || []).map(e => ({
    name: e.manual_workers?.name,
    time: e.shift_time,
    address: e.manual_workers?.address,
    useTemp: false,
  }))

  // Общий список, отсортированный по времени смены ("HH:MM" сортируется строкой)
  const entries = [...registered, ...manual].sort((a, b) =>
    String(a.time).localeCompare(String(b.time))
  )

  const text = buildMessage(today, entries)

  // Получатели — все админы с привязанным Telegram (в т.ч. жена).
  // ALERT_ADMIN_PHONES тут НЕ применяем: это ежедневный отчёт «кто едет»,
  // он должен дойти до всех админов, а не только до узкого списка алертов.
  const { data: admins, error: adminErr } = await supabase
    .from('users')
    .select('telegram_chat_id')
    .eq('role', 'admin')
    .not('telegram_chat_id', 'is', null)

  if (adminErr) { console.error('[triplist] admins:', adminErr.message); process.exit(1) }
  if (!admins?.length) { console.log('[triplist] нет админов с привязанным Telegram'); return }

  let ok = 0, fail = 0
  for (const a of admins) {
    try { await sendMessage(a.telegram_chat_id, text); ok++ }
    catch { fail++ }
    await new Promise(r => setTimeout(r, 60))
  }
  console.log(
    `[triplist] ${today}: записей ${entries.length} ` +
    `(зарегистр. ${registered.length} + кнопочных ${manual.length}), ` +
    `отправлено ${ok}, не доставлено ${fail}`
  )
}

main().then(() => process.exit(0)).catch(e => { console.error('[triplist]', e?.message); process.exit(1) })
