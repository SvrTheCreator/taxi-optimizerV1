import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import AddressInput from '../components/AddressInput'
import DateSlider from '../components/DateSlider'
import { geocodeAddress } from '../utils/api'

const SHIFT_TIMES = ['20:00', '21:00', '21:15', '22:00', '22:15', '23:00']

export default function WorkerPage() {
  const { user, authFetch, logout } = useAuth()
  const toast = useToast()
  const [notifications, setNotifications] = useState([])
  const [profile, setProfile] = useState(null)
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [myShifts, setMyShifts] = useState([])
  const [loading, setLoading] = useState(false)
  const [addressLoading, setAddressLoading] = useState(false)
  const [addressMsg, setAddressMsg] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [tempAddress, setTempAddress] = useState('')
  const [tempMsg, setTempMsg] = useState('')
  const [tempLoading, setTempLoading] = useState(false)
  const [useTemp, setUseTemp] = useState(false)
  const [showAddresses, setShowAddresses] = useState(false)

  // (даты берутся из DateSlider)

  const loadProfile = useCallback(async () => {
    const res = await authFetch('/api/users/me')
    if (res?.ok) setProfile(await res.json())
  }, [authFetch])

  const loadShifts = useCallback(async () => {
    const res = await authFetch(`/api/shifts?date=${selectedDate}`)
    if (res?.ok) setMyShifts(await res.json())
  }, [authFetch, selectedDate])

  const loadNotifications = useCallback(async () => {
    const res = await authFetch('/api/notifications')
    if (res?.ok) setNotifications(await res.json())
  }, [authFetch])

  useEffect(() => { loadProfile() }, [loadProfile])
  useEffect(() => { loadShifts() }, [loadShifts])
  useEffect(() => { loadNotifications() }, [loadNotifications])

  // Автообновление каждые 15 секунд
  useEffect(() => {
    const interval = setInterval(() => { loadShifts(); loadProfile(); loadNotifications() }, 10000)
    return () => clearInterval(interval)
  }, [loadShifts, loadProfile, loadNotifications])

  const [shiftMsg, setShiftMsg] = useState('')

  // Выбрать время смены (одно на день) или отменить
  async function selectShift(time) {
    setLoading(true)
    setShiftMsg('')
    const current = myShifts[0] // максимум одна запись на день

    if (current?.shift_time === time) {
      await authFetch(`/api/shifts/${current.id}`, { method: 'DELETE' })
      toast('Запись отменена', 'info')
    } else {
      const res = await authFetch('/api/shifts', {
        method: 'POST',
        body: JSON.stringify({ date: selectedDate, time }),
      })
      if (res?.ok) {
        const data = await res.json()
        if (data.requested) {
          toast(`Запрос на перенос ${data.from} → ${data.to} отправлен`, 'info')
        } else {
          toast(`Записан на ${time}`, 'success')
        }
      } else {
        const data = await res?.json()
        toast(data?.error || 'Ошибка', 'error')
      }
    }
    await Promise.all([loadShifts(), loadNotifications()])
    setLoading(false)
  }

  // Сохранить или подать заявку на смену адреса
  async function submitAddress() {
    if (!newAddress) return
    setAddressLoading(true)
    setAddressMsg('')
    try {
      const coords = await geocodeAddress(newAddress)

      if (!hasAddress) {
        // Первый адрес — сохраняем напрямую через заявку с автоутверждением
        const res = await authFetch('/api/address-requests', {
          method: 'POST',
          body: JSON.stringify({ address: newAddress, lat: coords.lat, lon: coords.lon, autoApprove: true }),
        })
        if (res?.ok) {
          toast('Адрес сохранён!', 'success')
          setNewAddress('')
          loadProfile()
        } else {
          const data = await res?.json()
          toast(data?.error || 'Ошибка', 'error')
        }
      } else {
        // Смена адреса — через заявку админу
        const res = await authFetch('/api/address-requests', {
          method: 'POST',
          body: JSON.stringify({ address: newAddress, lat: coords.lat, lon: coords.lon }),
        })
        if (res?.ok) {
          toast('Заявка отправлена! Ожидайте подтверждения.', 'info')
          setNewAddress('')
        } else {
          const data = await res?.json()
          toast(data?.error || 'Ошибка', 'error')
        }
      }
    } catch (err) {
      setAddressMsg('Ошибка геокодирования: ' + err.message)
    }
    setAddressLoading(false)
  }

  // Сохранить временный адрес
  async function submitTempAddress() {
    if (!tempAddress) return
    setTempLoading(true)
    setTempMsg('')
    try {
      const coords = await geocodeAddress(tempAddress)
      const res = await authFetch('/api/users/me/temp-address', {
        method: 'PATCH',
        body: JSON.stringify({ address: tempAddress, lat: coords.lat, lon: coords.lon }),
      })
      if (res?.ok) {
        setTempMsg('Временный адрес сохранён!')
        setTempAddress('')
        loadProfile()
      } else {
        const data = await res?.json()
        setTempMsg(data?.error || 'Ошибка')
      }
    } catch (err) {
      setTempMsg('Ошибка: ' + err.message)
    }
    setTempLoading(false)
  }

  // Можно ли установить временный адрес (раз в месяц)
  const canSetTemp = !profile?.temp_used_at ||
    new Date(profile.temp_used_at).getMonth() !== new Date().getMonth() ||
    new Date(profile.temp_used_at).getFullYear() !== new Date().getFullYear()

  // Первый ввод адреса — всегда можно. Смена — раз в 30 дней через заявку.
  const hasAddress = !!profile?.home_address
  const canChangeAddress = !hasAddress || !profile?.home_updated ||
    (Date.now() - new Date(profile.home_updated).getTime()) > 30 * 24 * 60 * 60 * 1000

  const nextChangeDate = profile?.home_updated
    ? new Date(new Date(profile.home_updated).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('ru')
    : null

  const unreadNotifs = notifications.filter(n => !n.is_read)

  return (
    <div className="worker-page">
      <header className="page-header">
        <h1>Привет, {user.name}!</h1>
        <button onClick={logout} className="btn-small">Выйти</button>
      </header>

      {/* Уведомления от админа */}
      {unreadNotifs.length > 0 && (
        <section className="worker-notifs">
          {unreadNotifs.map(n => (
            <div key={n.id} className={`worker-notif ${n.status === 'approved' ? 'notif-good' : n.status === 'rejected' ? 'notif-bad' : 'notif-info'}`}>
              <span>{n.message}</span>
              <button onClick={async () => {
                await authFetch(`/api/notifications/${n.id}/read`, { method: 'POST' })
                loadNotifications()
              }}>Ок</button>
            </div>
          ))}
        </section>
      )}

      {/* Если нет адреса — показать форму сразу */}
      {!hasAddress && (
        <section className="profile-section">
          <h2>Укажите домашний адрес</h2>
          <p className="no-address">Нужен адрес для записи на смены</p>
          <div className="address-change">
            <AddressInput value={newAddress} onChange={setNewAddress} placeholder="Ваш домашний адрес" />
            <button onClick={submitAddress} disabled={addressLoading || !newAddress}>
              {addressLoading ? 'Сохраняем...' : 'Сохранить адрес'}
            </button>
          </div>
        </section>
      )}

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

        {profile?.temp_address && myShifts[0] && (
          <label className={`temp-toggle ${!canSetTemp && !useTemp ? 'temp-toggle-disabled' : ''}`}>
            <input
              type="checkbox"
              checked={useTemp}
              disabled={!canSetTemp && !useTemp}
              onChange={async (e) => {
                const val = e.target.checked
                if (val && !useTemp) {
                  const ok = window.confirm('Использовать временный адрес? Эта возможность даётся 1 раз в месяц.')
                  if (!ok) return
                }
                setUseTemp(val)
                if (myShifts[0]) {
                  await authFetch('/api/shifts', {
                    method: 'POST',
                    body: JSON.stringify({ date: selectedDate, time: myShifts[0].shift_time, useTemp: val }),
                  })
                  loadShifts()
                  toast(val ? 'Временный адрес активирован' : 'Вернулись на основной адрес', 'info')
                }
              }}
            />
            {!canSetTemp && !useTemp
              ? `Временный адрес недоступен до следующего месяца`
              : `Ехать по временному адресу (${profile.temp_address})`
            }
          </label>
        )}

        {shiftMsg && <p className="address-msg">{shiftMsg}</p>}

        {!profile?.home_address && (
          <p className="hint">Укажите домашний адрес, чтобы записываться на смены</p>
        )}
      </section>

      {/* Аккордеон: адреса */}
      {hasAddress && (
        <section className="accordion-section">
          <button className="accordion-toggle" onClick={() => setShowAddresses(!showAddresses)}>
            <span>Мои адреса</span>
            <span className={`accordion-arrow ${showAddresses ? 'open' : ''}`}>▼</span>
          </button>
            <div className={`accordion-body ${showAddresses ? 'open' : ''}`}>
              {/* Основной адрес */}
              <div className="accordion-block">
                <h3>Домашний адрес</h3>
                <p className="current-address">{profile.home_address}</p>
                {canChangeAddress ? (
                  <div className="address-change">
                    <AddressInput value={newAddress} onChange={setNewAddress} placeholder="Новый адрес" />
                    <button onClick={submitAddress} disabled={addressLoading || !newAddress}>
                      {addressLoading ? 'Сохраняем...' : 'Сменить'}
                    </button>
                  </div>
                ) : (
                  <p className="address-cooldown">Смена доступна: {nextChangeDate}</p>
                )}
              </div>

              {/* Временный адрес */}
              <div className="accordion-block">
                <h3>Временный адрес</h3>
                <p className="hint" style={{ textAlign: 'left', padding: 0, marginBottom: 8 }}>
                  Один раз в месяц для другого маршрута
                </p>
                {profile?.temp_address && (
                  <p className="current-address">{profile.temp_address}</p>
                )}
                {canSetTemp ? (
                  <div className="address-change">
                    <AddressInput value={tempAddress} onChange={setTempAddress} placeholder="Адрес для разовой поездки" />
                    <button onClick={submitTempAddress} disabled={tempLoading || !tempAddress}>
                      {tempLoading ? 'Сохраняем...' : 'Установить'}
                    </button>
                    {tempMsg && <p className="address-msg">{tempMsg}</p>}
                  </div>
                ) : (
                  <p className="address-cooldown">Использован в этом месяце</p>
                )}
              </div>
            </div>
        </section>
      )}
    </div>
  )
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}
