import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { optimize } from '../utils/optimizer'

const WORK_COORDS = { lat: 47.2358, lon: 39.7137 }

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

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return d.toISOString().split('T')[0]
  })

  const loadShifts = useCallback(async () => {
    setLoading(true)
    const res = await authFetch(`/api/shifts?date=${selectedDate}`)
    if (res?.ok) setShifts(await res.json())
    setLoading(false)
  }, [authFetch, selectedDate])

  const loadRequests = useCallback(async () => {
    const res = await authFetch('/api/address-requests')
    if (res?.ok) setRequests(await res.json())
  }, [authFetch])

  const loadWorkers = useCallback(async () => {
    const res = await authFetch('/api/users')
    if (res?.ok) setWorkers(await res.json())
  }, [authFetch])

  useEffect(() => { loadShifts() }, [loadShifts])
  useEffect(() => {
    if (tab === 'requests') loadRequests()
    if (tab === 'workers') loadWorkers()
  }, [tab, loadRequests, loadWorkers])

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

  // Удалить работника
  async function handleDeleteWorker(id, name) {
    if (!confirm(`Удалить ${name}?`)) return
    await authFetch(`/api/users/${id}`, { method: 'DELETE' })
    loadWorkers()
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length

  return (
    <div className="admin-page">
      <header className="page-header">
        <h1>Админ: {user.name}</h1>
        <button onClick={logout} className="btn-small">Выйти</button>
      </header>

      {/* Табы */}
      <nav className="admin-tabs">
        <button className={tab === 'shifts' ? 'active' : ''} onClick={() => setTab('shifts')}>
          Смены
        </button>
        <button className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>
          Заявки {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
        </button>
        <button className={tab === 'workers' ? 'active' : ''} onClick={() => setTab('workers')}>
          Работники
        </button>
      </nav>

      {/* Таб: Смены */}
      {tab === 'shifts' && (
        <section>
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

          {loading ? <p>Загрузка...</p> : (
            <>
              {Object.keys(shiftsByTime).sort().map(time => (
                <div key={time} className="shift-group">
                  <h3>{time} ({shiftsByTime[time].length} чел.)</h3>
                  <ul>
                    {shiftsByTime[time].map(s => (
                      <li key={s.id}>
                        {s.users?.name} — {s.users?.home_address || 'адрес не указан'}
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
              <div className="request-info">
                <strong>{r.users?.name}</strong> ({r.users?.phone})
                <br />
                <span className="old-addr">Было: {r.users?.home_address || '—'}</span>
                <br />
                <span className="new-addr">Новый: {r.new_address}</span>
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
          {workers.map(w => (
            <div key={w.id} className="worker-card">
              <div>
                <strong>{w.name}</strong> ({w.phone})
                <br />
                <span>{w.home_address || 'адрес не указан'}</span>
                <br />
                <small>Роль: {w.role}</small>
              </div>
              {w.role !== 'admin' && (
                <button className="btn-small btn-danger" onClick={() => handleDeleteWorker(w.id, w.name)}>
                  Удалить
                </button>
              )}
            </div>
          ))}
        </section>
      )}
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
