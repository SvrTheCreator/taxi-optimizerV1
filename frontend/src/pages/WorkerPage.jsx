import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import AddressInput from '../components/AddressInput'
import DateSlider from '../components/DateSlider'
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

  // (даты берутся из DateSlider)

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

  const [shiftMsg, setShiftMsg] = useState('')

  // Выбрать время смены (одно на день) или отменить
  async function selectShift(time) {
    setLoading(true)
    setShiftMsg('')
    const current = myShifts[0] // максимум одна запись на день

    if (current?.shift_time === time) {
      // Нажал на уже выбранное — отменяем
      await authFetch(`/api/shifts/${current.id}`, { method: 'DELETE' })
    } else {
      const res = await authFetch('/api/shifts', {
        method: 'POST',
        body: JSON.stringify({ date: selectedDate, time }),
      })
      if (res?.ok) {
        const data = await res.json()
        if (data.requested) {
          setShiftMsg(`Запрос на перенос ${data.from} → ${data.to} отправлен администратору`)
        }
      } else {
        const data = await res?.json()
        setShiftMsg(data?.error || 'Ошибка')
      }
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

        <DateSlider selected={selectedDate} onChange={setSelectedDate} />

        <div className="shift-times">
          {SHIFT_TIMES.map(time => {
            const isActive = myShifts[0]?.shift_time === time
            return (
              <button
                key={time}
                className={`shift-btn ${isActive ? 'active' : ''}`}
                onClick={() => selectShift(time)}
                disabled={loading || (!profile?.home_address && !isActive)}
              >
                {time} {isActive ? '✓' : ''}
              </button>
            )
          })}
        </div>

        {shiftMsg && <p className="address-msg">{shiftMsg}</p>}

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
