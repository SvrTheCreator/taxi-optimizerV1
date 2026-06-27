import { getUpdates, deleteWebhook } from './telegram.js'
import { handleUpdate } from '../routes/telegram.js'

// Long-polling вместо webhook: сервер сам опрашивает Telegram (getUpdates).
// Нужно на РФ-VPS, куда входящие webhook'и от Telegram не доходят (таймаутят),
// а исходящие к api.telegram.org работают (IP закреплён в /etc/hosts).
export function startTelegramPolling() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log('[tg-poll] TELEGRAM_BOT_TOKEN не задан — поллинг не запускаю')
    return
  }

  let offset = 0
  let stopped = false

  async function loop() {
    // Снимаем webhook, иначе getUpdates вернёт 409 Conflict
    try {
      await deleteWebhook()
      console.log('[tg-poll] webhook снят, запускаю long-polling')
    } catch (e) {
      console.error('[tg-poll] deleteWebhook:', e?.message)
    }

    while (!stopped) {
      try {
        const updates = await getUpdates(offset, 50)
        for (const u of updates) {
          offset = u.update_id + 1
          try {
            await handleUpdate(u)
          } catch (e) {
            console.error('[tg-poll] handleUpdate:', e?.message)
          }
        }
      } catch (e) {
        // сеть/таймаут/Telegram недоступен — ждём и пробуем снова
        console.error('[tg-poll] getUpdates:', e?.message)
        await new Promise(r => setTimeout(r, 5000))
      }
    }
  }

  loop()
  return () => { stopped = true }
}
