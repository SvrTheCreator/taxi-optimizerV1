import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import DateSlider from '../components/DateSlider'
import AddressInput from '../components/AddressInput'
import { optimize } from '../utils/optimizer'
import { geocodeAddress } from '../utils/api'

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
  const { dispatch } = useApp()
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [shifts, setShifts] = useState([])
  const [requests, setRequests] = useState([])
  const [workers, setWorkers] = useState([])
  const [tab, setTab] = useState('shifts') // 'shifts' | 'requests' | 'workers'
  const [loading, setLoading] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [inviteCode, setInviteCode] = useState(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [profile, setProfile] = useState(null)
  const [newAddress, setNewAddress] = useState('')
  const [addressLoading, setAddressLoading] = useState(false)
  const [addressMsg, setAddressMsg] = useState('')
  const [showAddressPopup, setShowAddressPopup] = useState(false)
  const [myShift, setMyShift] = useState(null)
  const [shiftLoading, setShiftLoading] = useState(false)

  // (даты берутся из DateSlider)

  const loadShifts = useCallback(async (silent) => {
    if (!silent) setLoading(true)
    const res = await authFetch(`/api/shifts?date=${selectedDate}`)
    if (res?.ok) setShifts(await res.json())
    if (!silent) setLoading(false)
  }, [authFetch, selectedDate])

  const loadRequests = useCallback(async () => {
    const res = await authFetch('/api/address-requests')
    if (res?.ok) setRequests(await res.json())
  }, [authFetch])

  const loadWorkers = useCallback(async () => {
    const res = await authFetch('/api/users')
    if (res?.ok) setWorkers(await res.json())
  }, [authFetch])

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

  const loadNotifications = useCallback(async () => {
    const res = await authFetch('/api/notifications')
    if (res?.ok) setNotifications(await res.json())
  }, [authFetch])

  useEffect(() => { loadProfile() }, [loadProfile])
  useEffect(() => { loadShifts() }, [loadShifts])
  useEffect(() => { loadNotifications() }, [loadNotifications])
  useEffect(() => {
    if (tab === 'requests') loadRequests()
    if (tab === 'workers') loadWorkers()
  }, [tab, loadRequests, loadWorkers])

  // Автообновление каждые 15 секунд (silent — без мерцания)
  useEffect(() => {
    const interval = setInterval(() => { loadShifts(true); loadNotifications(); loadRequests() }, 15000)
    return () => clearInterval(interval)
  }, [loadShifts, loadNotifications, loadRequests])

  // Группируем смены по времени
  const shiftsByTime = {}
  for (const s of shifts) {
    if (!shiftsByTime[s.shift_time]) shiftsByTime[s.shift_time] = []
    shiftsByTime[s.shift_time].push(s)
  }

  // Оптимизация
  async function handleOptimize() {
    setOptimizing(true)
    const res = await authFetch(`/api/shifts/optimize-data?date=${selectedDate}`)
    if (!res?.ok) { setOptimizing(false); return }
    const entries = await res.json()

    if (entries.length === 0) {
      alert('Нет записей с адресами на эту дату')
      setOptimizing(false)
      return
    }

    const result = optimize(entries, WORK_COORDS)
    dispatch({ type: 'SET_RESULT', payload: result })
    setOptimizing(false)
    navigate('/result')
  }

  // Утвердить/отклонить заявку
  async function handleRequest(id, status) {
    await authFetch(`/api/address-requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    loadRequests()
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

  // Сгенерировать инвайт-код
  async function generateInvite() {
    setInviteLoading(true)
    const res = await authFetch('/api/auth/invite', { method: 'POST' })
    if (res?.ok) {
      const data = await res.json()
      setInviteCode(data.code)
    }
    setInviteLoading(false)
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
              onClick={async () => {
                if (myShift) {
                  // Уже записан — отменяем
                  await authFetch(`/api/shifts/${myShift.id}`, { method: 'DELETE' })
                } else {
                  // Записываемся на 20:00 сегодня
                  await authFetch('/api/shifts', {
                    method: 'POST',
                    body: JSON.stringify({ date: todayStr(), time: '20:00' }),
                  })
                }
                loadShifts()
              }}
              title={myShift ? `Записан на ${myShift.shift_time} — нажми чтобы отменить` : 'Записаться на 20:00'}
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

          {/* Моя смена */}
          {profile?.home_address && (
            <div className="my-shift-row">
              <span className="my-shift-label">Моя смена:</span>
              <div className="my-shift-times">
                {SHIFT_TIMES.map(time => (
                  <button
                    key={time}
                    className={`my-shift-btn ${myShift?.shift_time === time ? 'active' : ''}`}
                    onClick={() => selectMyShift(time)}
                    disabled={shiftLoading}
                  >
                    {time}
                  </button>
                ))}
              </div>
            </div>
          )}

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
                        </span>
                        <button
                          className="btn-small btn-danger"
                          onClick={async () => {
                            await authFetch(`/api/shifts/${s.id}`, { method: 'DELETE' })
                            loadShifts()
                          }}
                        >
                          Убрать
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {shifts.length === 0 && <p className="hint">Нет записей на эту дату</p>}

              {shifts.length > 0 && (
                <button
                  className="optimize-btn"
                  onClick={handleOptimize}
                  disabled={optimizing}
                >
                  {optimizing ? 'Оптимизируем...' : `Оптимизировать (${shifts.length} чел.)`}
                </button>
              )}
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
          <h2>Работники ({workers.length})</h2>

          <div className="invite-section">
            <button className="invite-btn" onClick={generateInvite} disabled={inviteLoading}>
              {inviteLoading ? 'Генерируем...' : 'Пригласить работника'}
            </button>
            {inviteCode && (
              <div className="invite-code-card">
                <span>Код: <strong>{inviteCode}</strong></span>
                <button
                  className="btn-small"
                  onClick={() => { navigator.clipboard.writeText(inviteCode) }}
                >
                  Копировать
                </button>
              </div>
            )}
          </div>

          {workers.map(w => (
            <div key={w.id} className="worker-card">
              <div>
                <strong>{w.name}</strong> ({formatPhone(w.phone)})
                <br />
                <span>{w.home_address || 'адрес не указан'}</span>
                <br />
                <small>Роль: {w.role}</small>
              </div>
              {w.role !== 'admin' && (
                <button
                  className={`btn-small ${confirmDelete === w.id ? 'btn-danger-confirm' : 'btn-danger'}`}
                  onClick={() => handleDeleteWorker(w.id)}
                >
                  {confirmDelete === w.id ? 'Точно удалить?' : 'Удалить'}
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Таб: Переносы */}
      {tab === 'notifications' && (
        <section>
          <h2>Запросы на перенос</h2>
          {notifications.length === 0 && <p className="hint">Запросов нет</p>}
          {notifications.map(n => {
            const match = n.message.match(/просит перенести (\d{2})\.(\d{2})\.(\d{4}): .+ → (\S+)/)
            const isPending = n.status === 'pending' && match

            return (
              <div key={n.id} className={`notification-card ${isPending ? 'unread' : 'read'}`}>
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
                  {n.status === 'approved' && <span className="status-badge approved">Принято</span>}
                  {n.status === 'rejected' && <span className="status-badge rejected">Отклонено</span>}
                </div>
                {isPending && (
                  <div className="request-actions" style={{ marginTop: 8 }}>
                    <button className="btn-approve" onClick={async () => {
                      await authFetch('/api/shifts/approve-transfer', {
                        method: 'POST',
                        body: JSON.stringify({
                          userId: n.user_id,
                          date: `${match[3]}-${match[2]}-${match[1]}`,
                          newTime: match[4],
                          notificationId: n.id,
                        }),
                      })
                      loadNotifications()
                      loadShifts()
                    }}>
                      Утвердить
                    </button>
                    <button className="btn-reject" onClick={async () => {
                      await authFetch('/api/shifts/reject-transfer', {
                        method: 'POST',
                        body: JSON.stringify({ notificationId: n.id }),
                      })
                      loadNotifications()
                    }}>
                      Отклонить
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
