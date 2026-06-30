import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import AddressInput from '../components/AddressInput'
import DateSlider from '../components/DateSlider'
import TelegramBindButton from '../components/TelegramBindButton'
import { geocodeAddress } from '../utils/api'
import { isAfterDeadline, DEADLINE_HOUR_MSK } from '../utils/deadline'

const SHIFT_TIMES = ['20:00', '21:00', '21:15', '22:00', '22:15', '23:00']

function AutoDismissNotif({ notif, authFetch, onDismiss }) {
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setFading(true)
      setTimeout(async () => {
        await authFetch(`/api/notifications/${notif.id}/read`, { method: 'POST' })
        onDismiss()
      }, 500)
    }, 10000)
    return () => clearTimeout(timer)
  }, [notif.id, authFetch, onDismiss])

  const dismiss = async () => {
    setFading(true)
    setTimeout(async () => {
      await authFetch(`/api/notifications/${notif.id}/read`, { method: 'POST' })
      onDismiss()
    }, 300)
  }

  const cls = notif.status === 'approved' ? 'notif-good' : notif.status === 'rejected' ? 'notif-bad' : 'notif-info'
  return (
    <div className={`worker-notif ${cls} ${fading ? 'notif-fade' : ''}`}>
      <span>{notif.message}</span>
      <button onClick={dismiss}>Ок</button>
    </div>
  )
}

export default function WorkerPage() {
  const { user, authFetch, logout } = useAuth()
  const toast = useToast()
  const [notifications, setNotifications] = useState([])
  // Профиль кешируем по пользователю: при сбое сети (частом на мобильном в РФ,
  // отключения света) приложение не должно «забывать» уже введённый адрес и
  // заново показывать онбординг.
  const profileCacheKey = `profile_cache_${user.id}`
  const [profile, setProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem(profileCacheKey)) } catch { return null }
  })
  const [profileLoaded, setProfileLoaded] = useState(false)
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
  const [movingMode, setMovingMode] = useState(false) // режим «я переехал» — открыт намеренно

  // (даты берутся из DateSlider)

  const loadProfile = useCallback(async () => {
    const res = await authFetch('/api/users/me')
    if (res?.ok) {
      const data = await res.json()
      setProfile(data)
      setProfileLoaded(true)
      try { localStorage.setItem(profileCacheKey, JSON.stringify(data)) } catch { /* нет места — не критично */ }
    }
    // при неуспехе профиль НЕ обнуляем — остаётся последний известный (из кеша)
  }, [authFetch, profileCacheKey])

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
    const current = myShifts[0] // максимум одна запись на день

    // Повторный тап по уже выбранному времени отменяет поездку — спрашиваем
    // подтверждение, чтобы случайным тапом не сбросить запись.
    if (current?.shift_time === time && !window.confirm('Отменить поездку?')) return

    setLoading(true)
    setShiftMsg('')

    if (current?.shift_time === time) {
      await authFetch(`/api/shifts/${current.id}`, { method: 'DELETE' })
      toast('Запись отменена', 'info')
    } else {
      const res = await authFetch('/api/shifts', {
        method: 'POST',
        body: JSON.stringify({ date: selectedDate, time }),
      })
      if (res?.ok) {
        await res.json()
        if (current) {
          toast(`Время изменено на ${time}`, 'success')
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

  // Отменить свою поездку — разрешено всегда (в т.ч. после 18:00); админу уйдёт оповещение
  async function cancelShift() {
    const current = myShifts[0]
    if (!current) return
    if (!window.confirm('Отменить поездку? Админ получит уведомление.')) return
    setLoading(true)
    await authFetch(`/api/shifts/${current.id}`, { method: 'DELETE' })
    toast('Поездка отменена', 'info')
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
          setMovingMode(false)
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
  // Онбординг-форму показываем ТОЛЬКО когда есть с чем сравнивать (профиль
  // загрузился сейчас ИЛИ поднят из кеша) и адреса в нём нет. Иначе при упавшем
  // запросе профиля (мобильный/отключения) приложение ложно просило адрес заново.
  const showAddressOnboarding = !hasAddress && (profileLoaded || profile != null)
  // Смена адреса («Я переехал») доступна всегда — фильтр это одобрение админа,
  // а не таймер. 30-дневный кулдаун убрали.

  // Дедлайн 18:00 МСК — пересчитывается при каждом автообновлении (раз в 10 сек)
  const afterDeadline = isAfterDeadline()

  const unreadNotifs = notifications.filter(n => !n.is_read)

  return (
    <div className="worker-page">
      <header className="page-header">
        <h1>Привет, {user.name}!</h1>
        <button onClick={logout} className="btn-small">Выйти</button>
      </header>

      <TelegramBindButton compact />

      {afterDeadline && (
        <div className="deadline-banner">
          ⏰ После {DEADLINE_HOUR_MSK}:00 МСК новая запись и смена адреса закрыты.
          Если уже записан — можно перенести время или отменить поездку.
        </div>
      )}

      {/* Уведомления от админа — автоскрытие через 10 сек */}
      {unreadNotifs.length > 0 && (
        <section className="worker-notifs">
          {unreadNotifs.map(n => (
            <AutoDismissNotif key={n.id} notif={n} authFetch={authFetch} onDismiss={loadNotifications} />
          ))}
        </section>
      )}

      {/* Форму показываем только когда профиль подтверждён и адреса нет */}
      {showAddressOnboarding && (
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
                disabled={loading || (!profile?.home_address && !isActive) || (afterDeadline && !myShifts[0])}
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
              disabled={afterDeadline || (!canSetTemp && !useTemp)}
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

        {myShifts[0] && (
          <button className="cancel-shift-btn" onClick={cancelShift} disabled={loading}>
            Отменить поездку ({myShifts[0].shift_time})
          </button>
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
                {!movingMode ? (
                  <button
                    className="moved-btn"
                    disabled={afterDeadline}
                    onClick={() => {
                      if (window.confirm('Сменить домашний адрес? Делай это, только если действительно переехал — заявка уйдёт админу на подтверждение.')) {
                        setMovingMode(true)
                      }
                    }}
                  >
                    🏠 Я переехал на новый адрес
                  </button>
                ) : (
                  <div className="address-change">
                    <AddressInput value={newAddress} onChange={setNewAddress} placeholder="Новый адрес" />
                    <button onClick={submitAddress} disabled={addressLoading || !newAddress || afterDeadline}>
                      {addressLoading ? 'Отправляем...' : 'Отправить заявку админу'}
                    </button>
                    <button type="button" className="link-btn" onClick={() => { setMovingMode(false); setNewAddress('') }}>
                      Отмена
                    </button>
                  </div>
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
                    <button onClick={submitTempAddress} disabled={tempLoading || !tempAddress || afterDeadline}>
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
