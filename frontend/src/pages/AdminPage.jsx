import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import DateSlider from '../components/DateSlider'
import AddressInput from '../components/AddressInput'
import { optimize } from '../utils/optimizer'
import { geocodeAddress } from '../utils/api'
import { useToast } from '../components/Toast'
import TelegramBindButton from '../components/TelegramBindButton'
import { playBeep } from '../utils/sound'

const WORK_COORDS = { lat: 47.2358, lon: 39.7137 }

// Форматирование телефона: 79508641767 → +7 950 864 17 67
function formatPhone(phone) {
  if (!phone) return ''
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+7 ${digits.slice(1,4)} ${digits.slice(4,7)} ${digits.slice(7,9)} ${digits.slice(9)}`
  }
  return '+' + digits
}

export default function AdminPage() {
  const { user, authFetch, logout } = useAuth()
  const toast = useToast()
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [shifts, setShifts] = useState([])
  const [requests, setRequests] = useState([])
  const [workers, setWorkers] = useState([])
  const [tab, setTab] = useState('shifts') // 'shifts' | 'requests' | 'workers'
  const [loading, setLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [profile, setProfile] = useState(null)
  const [newAddress, setNewAddress] = useState('')
  const [addressLoading, setAddressLoading] = useState(false)
  const [addressMsg, setAddressMsg] = useState('')
  const [showAddressPopup, setShowAddressPopup] = useState(false)
  const [showTaxiPopup, setShowTaxiPopup] = useState(false)
  const [myShift, setMyShift] = useState(null)
  const [shiftLoading, setShiftLoading] = useState(false)
  // «Кнопочные» работники без приложения
  const [manualRoster, setManualRoster] = useState([])
  const [manualDay, setManualDay] = useState([])
  const [showManual, setShowManual] = useState(false)
  const [mwName, setMwName] = useState('')
  const [mwAddr, setMwAddr] = useState('')
  const [mwBusy, setMwBusy] = useState(false)

  // (даты берутся из DateSlider)

  const loadShifts = useCallback(async (silent) => {
    if (!silent) setLoading(true)
    const res = await authFetch(`/api/shifts?date=${selectedDate}`)
    if (res?.ok) setShifts(await res.json())
    if (!silent) setLoading(false)
  }, [authFetch, selectedDate])

  const prevReqPendingRef = useRef(null)
  const loadManualRoster = useCallback(async () => {
    const res = await authFetch('/api/manual-workers')
    if (res?.ok) setManualRoster(await res.json())
  }, [authFetch])
  const loadManualDay = useCallback(async () => {
    const res = await authFetch(`/api/manual-workers/day?date=${selectedDate}`)
    if (res?.ok) setManualDay(await res.json())
  }, [authFetch, selectedDate])

  async function addManualWorker() {
    if (!mwName.trim() || !mwAddr.trim()) return
    setMwBusy(true)
    try {
      const coords = await geocodeAddress(mwAddr)
      const res = await authFetch('/api/manual-workers', {
        method: 'POST',
        body: JSON.stringify({ name: mwName.trim(), address: mwAddr.trim(), lat: coords.lat, lon: coords.lon }),
      })
      if (res?.ok) { toast('Добавлен в список', 'success'); setMwName(''); setMwAddr(''); loadManualRoster() }
      else toast('Не удалось добавить', 'error')
    } catch { toast('Не удалось определить адрес', 'error') }
    setMwBusy(false)
  }
  async function deleteManualWorker(id) {
    await authFetch(`/api/manual-workers/${id}`, { method: 'DELETE' })
    loadManualRoster(); loadManualDay()
  }
  async function setManualAssign(workerId, time) {
    const cur = manualDay.find(d => d.workerId === workerId)
    if (!time) {
      if (cur) await authFetch(`/api/manual-workers/assign/${cur.assignId}`, { method: 'DELETE' })
    } else {
      await authFetch(`/api/manual-workers/${workerId}/assign`, {
        method: 'POST', body: JSON.stringify({ date: selectedDate, time }),
      })
    }
    loadManualDay()
  }

  const loadRequests = useCallback(async () => {
    const res = await authFetch('/api/address-requests')
    if (res?.ok) {
      const data = await res.json()
      const pending = data.filter(r => r.status === 'pending').length
      // Звук только при реальном росте (не на первой загрузке)
      if (prevReqPendingRef.current !== null && pending > prevReqPendingRef.current) {
        toast('Новая заявка на адрес!', 'info')
        playBeep()
      }
      prevReqPendingRef.current = pending
      setRequests(data)
    }
  }, [authFetch, toast])

  const loadWorkers = useCallback(async () => {
    const res = await authFetch('/api/users')
    if (res?.ok) setWorkers(await res.json())
  }, [authFetch])

  const [regCodes, setRegCodes] = useState([])
  const [codeBusy, setCodeBusy] = useState(false)
  const loadRegCodes = useCallback(async () => {
    const res = await authFetch('/api/users/registration-codes')
    if (res?.ok) setRegCodes(await res.json())
  }, [authFetch])

  async function generateRegCode() {
    if (codeBusy) return
    setCodeBusy(true)
    const res = await authFetch('/api/users/registration-code', { method: 'POST' })
    if (res?.ok) {
      const data = await res.json()
      toast(`Код создан: ${data.code}`, 'success')
      loadRegCodes()
    } else {
      toast('Не удалось создать код', 'error')
    }
    setCodeBusy(false)
  }

  async function deleteRegCode(id) {
    await authFetch(`/api/users/registration-code/${id}`, { method: 'DELETE' })
    loadRegCodes()
  }

  async function copyCode(code) {
    try { await navigator.clipboard.writeText(code); toast('Код скопирован', 'info') } catch { /* clipboard может быть недоступен */ }
  }

  const [lastResetCode, setLastResetCode] = useState(null) // { name, code, ttlHours }
  async function resetWorkerPin(id) {
    const res = await authFetch(`/api/users/${id}/reset-pin-code`, { method: 'POST' })
    if (res?.ok) {
      const data = await res.json()
      setLastResetCode(data)
      toast(`Код сброса PIN: ${data.code}`, 'success')
    } else {
      toast('Не удалось создать код', 'error')
    }
  }

  const SHIFT_TIMES = ['20:00', '21:00', '21:15', '22:00', '22:15', '23:00']

  // Загрузить свою смену на выбранную дату
  const loadMyShift = useCallback(async () => {
    // Используем отдельный запрос — GET /api/shifts возвращает все для админа
    // Фильтруем на клиенте
    const found = shifts.find(s => s.user_id === user.id)
    setMyShift(found || null)
  }, [shifts, user.id])

  useEffect(() => { loadMyShift() }, [loadMyShift])

  async function selectMyShift(time) {
    setShiftLoading(true)
    const current = myShift

    if (current?.shift_time === time) {
      await authFetch(`/api/shifts/${current.id}`, { method: 'DELETE' })
    } else {
      await authFetch('/api/shifts', {
        method: 'POST',
        body: JSON.stringify({ date: selectedDate, time }),
      })
    }
    await loadShifts()
    setShiftLoading(false)
  }

  const loadProfile = useCallback(async () => {
    const res = await authFetch('/api/users/me')
    if (res?.ok) setProfile(await res.json())
  }, [authFetch])

  const prevUnreadRef = useRef(null)
  const loadNotifications = useCallback(async () => {
    const res = await authFetch('/api/notifications')
    if (res?.ok) {
      const data = await res.json()
      const newUnread = data.filter(n => n.status === 'pending').length
      // Звук + тост только при реальном росте (не на первой загрузке страницы)
      if (prevUnreadRef.current !== null && newUnread > prevUnreadRef.current) {
        toast('Новый запрос!', 'info')
        playBeep()
      }
      prevUnreadRef.current = newUnread
      setNotifications(data)
    }
  }, [authFetch, toast])

  useEffect(() => { loadProfile() }, [loadProfile])
  useEffect(() => { loadShifts() }, [loadShifts])
  useEffect(() => { loadNotifications() }, [loadNotifications])
  useEffect(() => { loadManualRoster() }, [loadManualRoster])
  useEffect(() => { loadManualDay() }, [loadManualDay])
  useEffect(() => {
    if (tab === 'requests') loadRequests()
    if (tab === 'workers') { loadWorkers(); loadRegCodes() }
  }, [tab, loadRequests, loadWorkers, loadRegCodes])

  // Автообновление каждые 15 секунд (silent — без мерцания)
  useEffect(() => {
    const interval = setInterval(() => { loadShifts(true); loadNotifications(); loadRequests(); loadManualDay() }, 10000)
    return () => clearInterval(interval)
  }, [loadShifts, loadNotifications, loadRequests, loadManualDay])

  // Группируем смены по времени (зарегистрированные + «кнопочные» вручную)
  const shiftsByTime = {}
  for (const s of shifts) {
    if (!shiftsByTime[s.shift_time]) shiftsByTime[s.shift_time] = []
    shiftsByTime[s.shift_time].push(s)
  }
  for (const m of manualDay) {
    if (!shiftsByTime[m.time]) shiftsByTime[m.time] = []
    shiftsByTime[m.time].push({
      id: 'm_' + m.assignId, assignId: m.assignId, manual: true, shift_time: m.time,
      users: { name: m.name }, display_address: m.address,
    })
  }
  const totalCount = shifts.length + manualDay.length

  // Оптимизация
  async function handleOptimize() {
    setOptimizing(true)
    const res = await authFetch(`/api/shifts/optimize-data?date=${selectedDate}`)
    if (!res?.ok) { setOptimizing(false); return }
    const entries = await res.json()

    // Добавляем «кнопочных» вручную (с координатами) в оптимизацию
    const manualEntries = manualDay
      .filter(m => m.lat != null && m.lon != null)
      .map((m, i) => ({ id: 100000 + i, address: m.address, time: m.time, lat: m.lat, lon: m.lon }))
    const allEntries = [...entries, ...manualEntries]

    if (allEntries.length === 0) {
      alert('Нет записей с адресами на эту дату')
      setOptimizing(false)
      return
    }

    const result = optimize(allEntries, WORK_COORDS)
    dispatch({ type: 'SET_RESULT', payload: result })
    // Сохраняем дату оптимизации
    localStorage.setItem('taxi_result_date', selectedDate)
    setOptimizing(false)
    navigate('/result')
  }

  // Утвердить/отклонить заявку
  async function handleRequest(id, status) {
    if (actionBusy) return
    setActionBusy(true)
    await authFetch(`/api/address-requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    toast(status === 'approved' ? 'Заявка утверждена' : 'Заявка отклонена', status === 'approved' ? 'success' : 'info')
    loadRequests()
    setActionBusy(false)
  }

  // Удалить заявку
  async function handleDeleteRequest(id) {
    await authFetch(`/api/address-requests/${id}`, { method: 'DELETE' })
    loadRequests()
  }

  // Сохранить/сменить адрес админа
  async function submitAdminAddress() {
    if (!newAddress) return
    setAddressLoading(true)
    setAddressMsg('')
    try {
      const coords = await geocodeAddress(newAddress)
      const res = await authFetch('/api/address-requests', {
        method: 'POST',
        body: JSON.stringify({ address: newAddress, lat: coords.lat, lon: coords.lon, autoApprove: true }),
      })
      if (res?.ok) {
        setAddressMsg('Адрес сохранён!')
        setNewAddress('')
        loadProfile()
      } else {
        // Если autoApprove не сработал (адрес уже есть) — сохраняем напрямую
        await authFetch('/api/users/me/address', {
          method: 'PATCH',
          body: JSON.stringify({ address: newAddress, lat: coords.lat, lon: coords.lon }),
        })
        setAddressMsg('Адрес обновлён!')
        setNewAddress('')
        loadProfile()
      }
    } catch (err) {
      setAddressMsg('Ошибка: ' + err.message)
    }
    setAddressLoading(false)
  }

  // Удалить работника (два нажатия: первое — подтвердить, второе — удалить)
  async function handleDeleteWorker(id) {
    if (confirmDelete !== id) {
      setConfirmDelete(id)
      return
    }
    await authFetch(`/api/users/${id}`, { method: 'DELETE' })
    setConfirmDelete(null)
    loadWorkers()
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const unreadCount = notifications.filter(n => !n.is_read).length

  async function markAllRead() {
    await authFetch('/api/notifications/read-all', { method: 'POST' })
    loadNotifications()
  }

  return (
    <div className="admin-page">
      <header className="page-header">
        <h1>Админ: {user.name}</h1>
        <div className="header-actions">
          {profile?.home_address && (
            <button
              className={`btn-icon ${myShift ? 'btn-icon-active' : ''}`}
              onClick={() => setShowTaxiPopup(true)}
              title={myShift ? `Записан на ${myShift.shift_time}` : 'Вызвать такси'}
            >
              <span>&#x1F696;</span>
            </button>
          )}
          <button
            className="btn-icon"
            onClick={() => setShowAddressPopup(true)}
            title={profile?.home_address || 'Указать адрес'}
          >
            <span className="icon-home">&#x1F3E0;</span>
          </button>
          <button onClick={logout} className="btn-small">Выйти</button>
        </div>
      </header>

      <TelegramBindButton compact />

      {/* Попап смены адреса */}
      {showAddressPopup && (
        <div className="popup-overlay" onClick={() => setShowAddressPopup(false)}>
          <div className="popup-card" onClick={e => e.stopPropagation()}>
            <div className="popup-header">
              <h2>Мой адрес</h2>
              <button className="btn-close" onClick={() => setShowAddressPopup(false)}>×</button>
            </div>
            {profile?.home_address && (
              <p className="current-address">{profile.home_address}</p>
            )}
            <div className="address-change">
              <AddressInput
                value={newAddress}
                onChange={setNewAddress}
                placeholder={profile?.home_address ? 'Новый адрес' : 'Введите домашний адрес'}
              />
              <button onClick={async () => {
                await submitAdminAddress()
                if (!addressLoading) setTimeout(() => setShowAddressPopup(false), 1500)
              }} disabled={addressLoading || !newAddress}>
                {addressLoading ? 'Сохраняем...' : (profile?.home_address ? 'Сменить' : 'Сохранить')}
              </button>
              {addressMsg && <p className="address-msg">{addressMsg}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Попап вызова такси */}
      {showTaxiPopup && (
        <div className="popup-overlay" onClick={() => setShowTaxiPopup(false)}>
          <div className="popup-card" onClick={e => e.stopPropagation()}>
            <div className="popup-header">
              <h2>Вызвать такси</h2>
              <button className="btn-close" onClick={() => setShowTaxiPopup(false)}>×</button>
            </div>
            <p style={{ fontSize: 13, color: '#9E9E9E', marginBottom: 8 }}>
              {profile?.home_address}
            </p>
            {myShift ? (
              <div>
                <p style={{ marginBottom: 10 }}>Вы записаны на <strong>{myShift.shift_time}</strong></p>
                <button
                  className="optimize-btn"
                  style={{ background: '#FFCDD2', color: '#C62828' }}
                  onClick={async () => {
                    await authFetch(`/api/shifts/${myShift.id}`, { method: 'DELETE' })
                    loadShifts()
                    setShowTaxiPopup(false)
                  }}
                >
                  Отменить поездку
                </button>
              </div>
            ) : (
              <div className="shift-times">
                {SHIFT_TIMES.map(time => (
                  <button
                    key={time}
                    className="shift-btn"
                    disabled={shiftLoading}
                    onClick={async () => {
                      setShiftLoading(true)
                      await authFetch('/api/shifts', {
                        method: 'POST',
                        body: JSON.stringify({ date: selectedDate, time }),
                      })
                      await loadShifts()
                      setShiftLoading(false)
                      setShowTaxiPopup(false)
                    }}
                  >
                    {time}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Попап: люди без приложения */}
      {showManual && (
        <div className="popup-overlay" onClick={() => setShowManual(false)}>
          <div className="popup-card manual-popup" onClick={e => e.stopPropagation()}>
            <div className="popup-header">
              <h2>Без приложения</h2>
              <button className="btn-close" onClick={() => setShowManual(false)}>×</button>
            </div>
            <p className="hint" style={{ textAlign: 'left', padding: '0 0 10px' }}>
              Добавь человека один раз — потом выбирай ему время на нужный день ({selectedDate.split('-').reverse().join('.')}).
            </p>

            {/* Добавление нового — сверху, чтобы подсказка адреса не обрезалась */}
            <div className="manual-add">
              <input type="text" className="address-input" placeholder="Имя" value={mwName} onChange={e => setMwName(e.target.value)} />
              <AddressInput value={mwAddr} onChange={setMwAddr} placeholder="Адрес" />
              <button className="optimize-btn" onClick={addManualWorker} disabled={mwBusy || !mwName || !mwAddr}>
                {mwBusy ? 'Добавляем...' : 'Добавить в список'}
              </button>
            </div>

            <div className="manual-list">
              {manualRoster.length === 0 && <p className="hint">Список пуст</p>}
              {manualRoster.map(p => {
                const cur = manualDay.find(d => d.workerId === p.id)
                return (
                  <div key={p.id} className="manual-row">
                    <div className="manual-info"><strong>{p.name}</strong><br /><small>{p.address}</small></div>
                    <select className="manual-time" value={cur?.time || ''} onChange={e => setManualAssign(p.id, e.target.value)}>
                      <option value="">— не едет —</option>
                      {SHIFT_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button className="btn-notif-delete" title="Удалить из списка" onClick={() => deleteManualWorker(p.id)}>×</button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Табы */}
      <nav className="admin-tabs">
        <button className={tab === 'shifts' ? 'active' : ''} onClick={() => setTab('shifts')}>
          Смены
        </button>
        <button className={tab === 'notifications' ? 'active' : ''} onClick={() => setTab('notifications')}>
          Переносы {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
        </button>
        <button className={tab === 'workers' ? 'active' : ''} onClick={() => setTab('workers')}>
          Работники
        </button>
        <button className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>
          Заявки {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
        </button>
      </nav>

      {/* Таб: Смены */}
      {tab === 'shifts' && (
        <section>
          <DateSlider selected={selectedDate} onChange={setSelectedDate} />

          <button className="manual-add-btn" onClick={() => setShowManual(true)}>
            ➕ Добавить человека без приложения
          </button>

          {loading ? <p>Загрузка...</p> : (
            <>
              {Object.keys(shiftsByTime).sort().map(time => (
                <div key={time} className="shift-group">
                  <h3>{time} ({shiftsByTime[time].length} чел.)</h3>
                  <ul>
                    {shiftsByTime[time].map(s => (
                      <li key={s.id} className="shift-entry">
                        <span>
                          {s.users?.name} — {s.display_address || s.users?.home_address || 'адрес не указан'}
                          {s.use_temp && <span className="temp-badge">врем.</span>}
                          {s.manual && <span className="temp-badge">вручную</span>}
                        </span>
                        <button
                          className="btn-small btn-danger"
                          onClick={async () => {
                            if (s.manual) {
                              await authFetch(`/api/manual-workers/assign/${s.assignId}`, { method: 'DELETE' })
                              loadManualDay()
                            } else {
                              await authFetch(`/api/shifts/${s.id}`, { method: 'DELETE' })
                              loadShifts()
                            }
                          }}
                        >
                          Убрать
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {totalCount === 0 && <p className="hint">Нет записей на эту дату. Работники записываются через своё приложение.</p>}

              {totalCount > 0 && (
                <button
                  className="optimize-btn"
                  onClick={handleOptimize}
                  disabled={optimizing}
                >
                  {optimizing ? 'Оптимизируем...' : `Оптимизировать (${totalCount} чел.)`}
                </button>
              )}

              {state.result && (() => {
                const resultDate = localStorage.getItem('taxi_result_date')
                if (resultDate !== selectedDate) return null
                const optimizedCount = state.result.reduce((sum, g) => sum + g.taxis.reduce((s, t) => s + t.addresses.length, 0), 0)
                const currentCount = totalCount
                const changed = optimizedCount !== currentCount
                return (
                  <div className="last-result-block">
                    {changed && currentCount > 0 && (
                      <p className="result-stale">
                        Результат устарел: было {optimizedCount} чел., сейчас {currentCount}
                      </p>
                    )}
                    <button
                      className="optimize-btn result-btn"
                      onClick={() => navigate('/result')}
                    >
                      Показать результат ({optimizedCount} чел.)
                    </button>
                  </div>
                )
              })()}
            </>
          )}
        </section>
      )}

      {/* Таб: Заявки на смену адреса */}
      {tab === 'requests' && (
        <section>
          <h2>Заявки на смену адреса</h2>
          {requests.length === 0 && <p className="hint">Заявок нет</p>}
          {requests.map(r => (
            <div key={r.id} className={`request-card ${r.status}`}>
              <div className="notification-header">
                <div className="request-info">
                  <strong>{r.users?.name}</strong> ({formatPhone(r.users?.phone)})
                  <br />
                  <span className="old-addr">Было: {r.users?.home_address || '—'}</span>
                  <br />
                  <span className="new-addr">Новый: {r.new_address}</span>
                </div>
                <button
                  className="btn-notif-delete"
                  onClick={() => handleDeleteRequest(r.id)}
                  title="Удалить"
                >
                  ×
                </button>
              </div>
              {r.status === 'pending' && (
                <div className="request-actions">
                  <button className="btn-approve" onClick={() => handleRequest(r.id, 'approved')}>
                    Утвердить
                  </button>
                  <button className="btn-reject" onClick={() => handleRequest(r.id, 'rejected')}>
                    Отклонить
                  </button>
                </div>
              )}
              {r.status !== 'pending' && (
                <span className={`status-badge ${r.status}`}>
                  {r.status === 'approved' ? 'Утверждено' : 'Отклонено'}
                </span>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Таб: Работники */}
      {tab === 'workers' && (
        <section>
          <div className="reg-code-block">
            <div className="reg-code-head">
              <h2 style={{ margin: 0 }}>Коды регистрации</h2>
              <button className="btn-small" onClick={generateRegCode} disabled={codeBusy}>
                {codeBusy ? '...' : '+ Выдать код'}
              </button>
            </div>
            <p className="hint" style={{ textAlign: 'left', padding: '4px 0' }}>
              Для работников без Telegram. Продиктуй код — он введёт его на «Регистрация по коду».
            </p>
            {regCodes.length === 0 && <p className="hint" style={{ padding: '4px 0' }}>Активных кодов нет</p>}
            {regCodes.map(c => (
              <div key={c.id} className="reg-code-row">
                <span className="reg-code-value" onClick={() => copyCode(c.code)}>{c.code}</span>
                <span className="reg-code-exp">до {new Date(c.expires_at).toLocaleDateString('ru')}</span>
                <button className="btn-notif-delete" onClick={() => deleteRegCode(c.id)} title="Отозвать">×</button>
              </div>
            ))}
          </div>

          {lastResetCode && (
            <div className="reg-code-block" style={{ background: '#E8F5E9' }}>
              <div className="reg-code-head">
                <span>Код сброса PIN для <b>{lastResetCode.name}</b> (действует {lastResetCode.ttlHours} ч):</span>
                <button className="btn-notif-delete" onClick={() => setLastResetCode(null)} title="Скрыть">×</button>
              </div>
              <div className="reg-code-row" style={{ borderTop: 'none' }}>
                <span className="reg-code-value" onClick={() => copyCode(lastResetCode.code)}>{lastResetCode.code}</span>
              </div>
              <p className="hint" style={{ textAlign: 'left', padding: '4px 0' }}>
                Продиктуй работнику. Он введёт его на «Забыл PIN» → «Есть код от админа».
              </p>
            </div>
          )}

          <h2>Работники ({workers.length})</h2>

          {workers.map(w => (
            <div key={w.id} className="worker-card">
              <div>
                <strong>{w.name}</strong> ({formatPhone(w.phone)})
                <br />
                <span style={w.home_address ? {} : { color: '#e53935', fontWeight: 600 }}>
                  {w.home_address || 'нет адреса!'}
                </span>
                <br />
                <small>Роль: {w.role}</small>
              </div>
              {w.role !== 'admin' && (
                <div className="worker-actions">
                  <button className="btn-small" onClick={() => resetWorkerPin(w.id)}>
                    Сбросить PIN
                  </button>
                  <button
                    className={`btn-small ${confirmDelete === w.id ? 'btn-danger-confirm' : 'btn-danger'}`}
                    onClick={() => handleDeleteWorker(w.id)}
                  >
                    {confirmDelete === w.id ? 'Точно?' : 'Удалить'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Таб: Переносы */}
      {tab === 'notifications' && (
        <section>
          <h2>Переносы и отмены</h2>
          {notifications.length === 0 && <p className="hint">Уведомлений нет</p>}
          {notifications.map(n => {
            const isUnread = n.status === 'pending'

            return (
              <div key={n.id} className={`notification-card ${isUnread ? 'unread' : 'read'}`}>
                <div className="notification-header">
                  <p>{n.message}</p>
                  <button
                    className="btn-notif-delete"
                    onClick={async () => {
                      await authFetch(`/api/notifications/${n.id}`, { method: 'DELETE' })
                      loadNotifications()
                    }}
                    title="Удалить"
                  >
                    ×
                  </button>
                </div>
                <div className="notification-footer">
                  <small>{new Date(n.created_at).toLocaleString('ru')}</small>
                  {n.status === 'read' && <span className="status-badge" style={{ background: '#E0E0E0', color: '#666' }}>Прочитано</span>}
                </div>
                {isUnread && (
                  <div className="request-actions" style={{ marginTop: 8 }}>
                    <button className="btn-approve" onClick={async () => {
                      await authFetch(`/api/notifications/${n.id}/read`, { method: 'POST' })
                      loadNotifications()
                    }}>
                      Ок
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}
