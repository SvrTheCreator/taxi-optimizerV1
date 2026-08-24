import 'dotenv/config'
import supabase from '../db/supabase.js'

// Ежедневная чистка «Переносов» и «Заявок», чтобы списки не копились бесконечно.
// Запускается systemd-таймером рано утром (см. deploy/taxi-cleanup.*).
//
// Логика (чистим ТОЛЬКО обработанное, непрочитанное/pending не трогаем):
//  - notifications — удаляем только ПРОЧИТАННЫЕ (is_read=true), созданные до
//    начала текущего дня по МСК. Непрочитанные остаются, пока админ не глянет.
//  - address_requests — удаляем только те, на которые ОТРЕАГИРОВАЛИ
//    (approved/rejected), старше начала дня. PENDING оставляем — терять нельзя.

function mskMidnightIso() {
  const now = new Date()
  const msk = new Date(now.getTime() + 3 * 3600 * 1000) // сдвиг в МСК
  // 00:00 МСК текущего дня, выраженные в UTC = Date.UTC(дата МСК) - 3ч
  const ms = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate()) - 3 * 3600 * 1000
  return new Date(ms).toISOString()
}

async function main() {
  const cutoff = mskMidnightIso()
  console.log('[cleanup] cutoff (МСК 00:00):', cutoff)

  const { data: n, error: ne } = await supabase
    .from('notifications')
    .delete()
    .lt('created_at', cutoff)
    .eq('is_read', true)          // только прочитанные
    .select('id')
  if (ne) console.error('[cleanup] notifications:', ne.message)
  else console.log(`[cleanup] notifications (прочитанные) удалено: ${n?.length ?? 0}`)

  const { data: r, error: re } = await supabase
    .from('address_requests')
    .delete()
    .lt('created_at', cutoff)
    .neq('status', 'pending')
    .select('id')
  if (re) console.error('[cleanup] address_requests:', re.message)
  else console.log(`[cleanup] address_requests (обработанные) удалено: ${r?.length ?? 0}`)

  // Авто-удаление неактивных работников (не админов): нет захода 21 день.
  // last_seen обновляется в /api/users/me при каждом открытии приложения.
  // Колонка backfilled на сегодня, поэтому первые 3 недели никого не тронет.
  const INACTIVE_DAYS = 21
  const staleCut = new Date(Date.now() - INACTIVE_DAYS * 24 * 3600 * 1000).toISOString()
  const { data: stale, error: se } = await supabase
    .from('users')
    .select('id, name, phone, last_seen')
    .neq('role', 'admin')
    .lt('last_seen', staleCut)   // NULL сюда не попадёт — безопасно
  if (se) { console.error('[cleanup] неактивные:', se.message); return }
  for (const u of stale || []) {
    // сначала следы (FK), потом сам юзер
    await supabase.from('shift_entries').delete().eq('user_id', u.id)
    await supabase.from('address_requests').delete().eq('user_id', u.id)
    await supabase.from('notifications').delete().eq('user_id', u.id)
    await supabase.from('invite_codes').update({ used_by: null }).eq('used_by', u.id)
    await supabase.from('invite_codes').update({ created_by: null }).eq('created_by', u.id)
    const { error: de } = await supabase.from('users').delete().eq('id', u.id)
    console.log(`[cleanup] неактивный ${de ? 'НЕ удалён (' + de.message + ')' : 'удалён'}: ${u.name} ${u.phone} (last_seen ${u.last_seen?.slice(0, 10)})`)
  }
  console.log(`[cleanup] неактивных под удаление: ${stale?.length ?? 0}`)
}

main().then(() => process.exit(0)).catch(e => { console.error('[cleanup]', e?.message); process.exit(1) })
