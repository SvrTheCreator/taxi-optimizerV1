import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'

export default function TelegramBindButton({ compact = false }) {
  const { authFetch } = useAuth()
  const toast = useToast()
  const [linked, setLinked] = useState(null) // null | true | false
  const [busy, setBusy] = useState(false)

  const loadStatus = useCallback(async () => {
    const res = await authFetch('/api/telegram/me')
    if (!res) return
    const data = await res.json()
    setLinked(!!data.linked)
  }, [authFetch])

  useEffect(() => { loadStatus() }, [loadStatus])

  async function startBind() {
    setBusy(true)
    try {
      const res = await authFetch('/api/telegram/bind/start', { method: 'POST', body: JSON.stringify({}) })
      if (!res) return
      const data = await res.json()
      if (!res.ok) {
        toast(data.error || 'Не удалось начать привязку', 'error')
        return
      }
      window.open(data.url, '_blank')
      toast('Открой бота и нажми Start — ссылка действует 15 минут', 'info')
      // Переопрашиваем статус через несколько секунд (вдруг юзер быстрый)
      setTimeout(loadStatus, 5000)
      setTimeout(loadStatus, 15000)
    } finally {
      setBusy(false)
    }
  }

  async function unbind() {
    if (!confirm('Отвязать Telegram? Восстановить PIN через бота больше не получится.')) return
    setBusy(true)
    try {
      const res = await authFetch('/api/telegram/me', { method: 'DELETE' })
      if (!res) return
      if (res.ok) {
        setLinked(false)
        toast('Telegram отвязан', 'info')
      }
    } finally {
      setBusy(false)
    }
  }

  if (linked === null) return null

  if (linked) {
    return (
      <div className={`tg-bind tg-bind-linked ${compact ? 'tg-bind-compact' : ''}`}>
        <span>✅ Telegram привязан</span>
        <button type="button" onClick={unbind} disabled={busy} className="tg-bind-unlink">
          Отвязать
        </button>
      </div>
    )
  }

  return (
    <div className={`tg-bind ${compact ? 'tg-bind-compact' : ''}`}>
      <div className="tg-bind-text">
        <strong>Привяжи Telegram</strong>
        <span>Чтобы восстановить PIN, если вдруг забудешь</span>
      </div>
      <button type="button" onClick={startBind} disabled={busy} className="tg-bind-btn">
        {busy ? '...' : 'Привязать'}
      </button>
    </div>
  )
}
