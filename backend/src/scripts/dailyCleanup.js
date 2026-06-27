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
}

main().then(() => process.exit(0)).catch(e => { console.error('[cleanup]', e?.message); process.exit(1) })
