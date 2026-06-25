import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

const BASE = '/api'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)        // { id, phone, name, role }
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)   // проверяем localStorage при старте

  // При старте проверяем сохранённый токен
  useEffect(() => {
    const saved = localStorage.getItem('auth')
    if (saved) {
      try {
        const { token, user } = JSON.parse(saved)
        setToken(token)
        setUser(user)
      } catch { /* повреждённые данные — игнорируем */ }
    }
    setLoading(false)
  }, [])

  // Хелпер: fetch с авторизацией
  async function authFetch(url, options = {}) {
    const headers = { ...options.headers }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options.body) headers['Content-Type'] = 'application/json'
    let res
    try {
      res = await fetch(url, { ...options, headers })
    } catch {
      // Сеть недоступна (частые отключения/плохой мобильный) — не роняем
      // приложение и НЕ разлогиниваем. Вызывающий код увидит null и сохранит
      // текущее состояние (см. кеш профиля в WorkerPage).
      return null
    }
    if (res.status === 401) {
      logout()
      return null
    }
    return res
  }

  async function registerViaTg(token, pin) {
    const res = await fetch(`${BASE}/auth/register-via-tg`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, pin }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    setToken(data.token)
    setUser(data.user)
    localStorage.setItem('auth', JSON.stringify(data))
    return data.user
  }

  async function registerViaCode(name, phone, code, pin) {
    const res = await fetch(`${BASE}/auth/register-via-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, code, pin }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    setToken(data.token)
    setUser(data.user)
    localStorage.setItem('auth', JSON.stringify(data))
    return data.user
  }

  async function login(phone, pin) {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, pin }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    setToken(data.token)
    setUser(data.user)
    localStorage.setItem('auth', JSON.stringify(data))
    return data.user
  }

  function logout() {
    setToken(null)
    setUser(null)
    localStorage.removeItem('auth')
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, registerViaTg, registerViaCode, login, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
