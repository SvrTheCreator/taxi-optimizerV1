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
  const [tempAddress, setTempAddress] = useState('')
  const [tempMsg, setTempMsg] = useState('')
  const [tempLoading, setTempLoading] = useState(false)
  const [useTemp, setUseTemp] = useState(false)

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

  // Автообновление каждые 15 секунд
  useEffect(() => {
    const interval = setInterval(() => { loadShifts(); loadProfile() }, 15000)
    return () => clearInterval(interval)
  }, [loadShifts, loadProfile])

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
          setAddressMsg('Адрес сохранён!')
          setNewAddress('')
          loadProfile()
        } else {
          const data = await res?.json()
          setAddressMsg(data?.error || 'Ошибка')
        }
      } else {
        // Смена адреса — через заявку админу
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
            <button onClick={submitAddress} disabled={addressLoading || !newAddress}>
              {addressLoading ? 'Сохраняем...' : (hasAddress ? 'Сменить адрес' : 'Сохранить адрес')}
            </button>
            {addressMsg && <p className="address-msg">{addressMsg}</p>}
          </div>
        ) : (
          <p className="address-cooldown">
            Следующая смена адреса доступна: {nextChangeDate}
          </p>
        )}
      </section>

      {/* Временный адрес */}
      {hasAddress && (
        <section className="profile-section">
          <h2>Временный адрес</h2>
          <p className="hint" style={{ textAlign: 'left', padding: 0, marginBottom: 8 }}>
            Один раз в месяц можно указать другой адрес для поездки
          </p>
          {profile?.temp_address && (
            <p className="current-address">Текущий: {profile.temp_address}</p>
          )}
          {canSetTemp ? (
            <div className="address-change">
              <AddressInput
                value={tempAddress}
                onChange={setTempAddress}
                placeholder="Адрес для разовой поездки"
              />
              <button onClick={submitTempAddress} disabled={tempLoading || !tempAddress}>
                {tempLoading ? 'Сохраняем...' : 'Установить'}
              </button>
              {tempMsg && <p className="address-msg">{tempMsg}</p>}
            </div>
          ) : (
            <p className="address-cooldown">
              Временный адрес уже использован в этом месяце
            </p>
          )}
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
                setUseTemp(val)
                if (myShifts[0]) {
                  await authFetch('/api/shifts', {
                    method: 'POST',
                    body: JSON.stringify({ date: selectedDate, time: myShifts[0].shift_time, useTemp: val }),
                  })
                  loadShifts()
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
    </div>
  )
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}
