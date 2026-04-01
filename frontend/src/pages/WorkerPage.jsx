import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import AddressInput from '../components/AddressInput'
import { geocodeAddress } from '../utils/api'

const SHIFT_TIMES = ['20:00', '21:00', '21:15', '22:00', '22:15', '23:00']

export default function WorkerPage() {
  const { user, authFetch, logout } = useAuth()
  const [profile, setProfile] = useState(null)
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [myShifts, setMyShifts] = useState([])
  const [loading, setLoading] = useState(false)
  const [addressLoading, setAddressLoading] = useState(false)
  const [addressMsg, setAddressMsg] = useState('')
  const [newAddress, setNewAddress] = useState('')

  // Ближайшие 7 дней для выбора
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return d.toISOString().split('T')[0]
  })

  const loadProfile = useCallback(async () => {
    const res = await authFetch('/api/users/me')
    if (res?.ok) setProfile(await res.json())
  }, [authFetch])

  const loadShifts = useCallback(async () => {
    const res = await authFetch(`/api/shifts?date=${selectedDate}`)
    if (res?.ok) setMyShifts(await res.json())
  }, [authFetch, selectedDate])

  useEffect(() => { loadProfile() }, [loadProfile])
  useEffect(() => { loadShifts() }, [loadShifts])

  // Записаться / отписаться от смены
  async function toggleShift(time) {
    setLoading(true)
    const existing = myShifts.find(s => s.shift_time === time)
    if (existing) {
      await authFetch(`/api/shifts/${existing.id}`, { method: 'DELETE' })
    } else {
      await authFetch('/api/shifts', {
        method: 'POST',
        body: JSON.stringify({ date: selectedDate, time }),
      })
    }
    await loadShifts()
    setLoading(false)
  }

  // Подать заявку на смену адреса
  async function submitAddressRequest() {
    if (!newAddress) return
    setAddressLoading(true)
    setAddressMsg('')
    try {
      const coords = await geocodeAddress(newAddress)
      const res = await authFetch('/api/address-requests', {
        method: 'POST',
        body: JSON.stringify({ address: newAddress, lat: coords.lat, lon: coords.lon }),
      })
      if (res?.ok) {
        setAddressMsg('Заявка отправлена! Ожидайте подтверждения.')
        setNewAddress('')
      } else {
        const data = await res?.json()
        setAddressMsg(data?.error || 'Ошибка')
      }
    } catch (err) {
      setAddressMsg('Ошибка геокодирования: ' + err.message)
    }
    setAddressLoading(false)
  }

  // Можно ли менять адрес (раз в 30 дней)
  const canChangeAddress = !profile?.home_updated ||
    (Date.now() - new Date(profile.home_updated).getTime()) > 30 * 24 * 60 * 60 * 1000

  const nextChangeDate = profile?.home_updated
    ? new Date(new Date(profile.home_updated).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('ru')
    : null

  return (
    <div className="worker-page">
      <header className="page-header">
        <h1>Привет, {user.name}!</h1>
        <button onClick={logout} className="btn-small">Выйти</button>
      </header>

      {/* Профиль и адрес */}
      <section className="profile-section">
        <h2>Мой адрес</h2>
        {profile?.home_address ? (
          <p className="current-address">{profile.home_address}</p>
        ) : (
          <p className="no-address">Адрес не указан — укажите для записи на смены</p>
        )}

        {canChangeAddress ? (
          <div className="address-change">
            <AddressInput
              value={newAddress}
              onChange={setNewAddress}
              placeholder="Новый домашний адрес"
            />
            <button onClick={submitAddressRequest} disabled={addressLoading || !newAddress}>
              {addressLoading ? 'Отправляем...' : 'Сменить адрес'}
            </button>
            {addressMsg && <p className="address-msg">{addressMsg}</p>}
          </div>
        ) : (
          <p className="address-cooldown">
            Следующая смена адреса доступна: {nextChangeDate}
          </p>
        )}
      </section>

      {/* Запись на смены */}
      <section className="shifts-section">
        <h2>Запись на смены</h2>

        <div className="date-picker">
          {dates.map(d => (
            <button
              key={d}
              className={`date-btn ${d === selectedDate ? 'active' : ''}`}
              onClick={() => setSelectedDate(d)}
            >
              {formatDate(d)}
            </button>
          ))}
        </div>

        <div className="shift-times">
          {SHIFT_TIMES.map(time => {
            const isActive = myShifts.some(s => s.shift_time === time)
            return (
              <button
                key={time}
                className={`shift-btn ${isActive ? 'active' : ''}`}
                onClick={() => toggleShift(time)}
                disabled={loading || (!profile?.home_address && !isActive)}
              >
                {time} {isActive ? '✓' : ''}
              </button>
            )
          })}
        </div>

        {!profile?.home_address && (
          <p className="hint">Укажите домашний адрес, чтобы записываться на смены</p>
        )}
      </section>
    </div>
  )
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
  return `${days[d.getDay()]} ${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`
}
