import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import PhoneInput from '../components/PhoneInput'

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'taxi_optimizer_helper_bot'

function formatPhone(digits) {
  // 79991234567 → +7 999 123 45 67
  if (digits.length !== 11) return digits
  return `+${digits[0]} ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}`
}

export default function RegisterPage({ onSwitch }) {
  const { registerViaTg, registerViaCode } = useAuth()

  // Если в URL есть ?regToken=... — режим завершения TG-регистрации
  const params = new URLSearchParams(window.location.search)
  const regToken = params.get('regToken')

  const [mode, setMode] = useState(regToken ? 'tg-finish' : 'start') // 'start' | 'tg-finish' | 'code'
  const [session, setSession] = useState(null) // { phone, name }
  const [sessionError, setSessionError] = useState('')

  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Режим «по коду»
  const [codeName, setCodeName] = useState('')
  const [codePhone, setCodePhone] = useState('+7')
  const [code, setCode] = useState('')

  async function submitCodeRegister(e) {
    e.preventDefault()
    setError('')
    if (!codeName.trim()) { setError('Введите имя'); return }
    if (codePhone.replace(/\D/g, '').length !== 11) { setError('Телефон должен быть 11 цифр'); return }
    if (!/^\d{6}$/.test(code)) { setError('Код — 6 цифр'); return }
    if (!/^\d{4}$/.test(pin)) { setError('PIN должен быть 4 цифры'); return }
    setLoading(true)
    try {
      await registerViaCode(codeName.trim(), codePhone, code, pin)
      window.history.replaceState({}, '', '/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // При входе с regToken — подгружаем данные сессии
  useEffect(() => {
    if (!regToken) return
    fetch(`/api/auth/registration-session?token=${encodeURIComponent(regToken)}`)
      .then(r => r.json().then(data => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setSessionError(data.error || 'Сессия недействительна')
          return
        }
        setSession(data)
      })
      .catch(() => setSessionError('Не удалось загрузить сессию'))
  }, [regToken])

  async function submitTgRegister(e) {
    e.preventDefault()
    setError('')
    if (!/^\d{4}$/.test(pin)) {
      setError('PIN должен быть 4 цифры')
      return
    }
    setLoading(true)
    try {
      await registerViaTg(regToken, pin)
      // После успеха AuthContext сам зальёт user, App.jsx перенаправит
      // Чистим query-string чтобы regToken не висел в URL
      window.history.replaceState({}, '', '/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function openTgBot() {
    window.open(`https://t.me/${BOT_USERNAME}?start=register`, '_blank')
  }

  // === Финиш TG-регистрации ===
  if (mode === 'tg-finish') {
    if (sessionError) {
      return (
        <div className="auth-page">
          <h1>Регистрация</h1>
          <p className="error">{sessionError}</p>
          <p className="auth-hint">Открой бота снова и начни заново.</p>
          <button onClick={() => { window.history.replaceState({}, '', '/'); window.location.reload() }}>
            Назад
          </button>
        </div>
      )
    }
    if (!session) {
      return <div className="auth-page"><h1>Регистрация</h1><p className="auth-hint">Загружаем сессию...</p></div>
    }
    return (
      <div className="auth-page">
        <h1>Почти готово!</h1>
        <p className="auth-hint">
          Регистрируем <strong>{session.name}</strong>, телефон <strong>{formatPhone(session.phone)}</strong>.
          <br />Telegram уже привязан.
        </p>
        <form onSubmit={submitTgRegister}>
          <label>
            Придумай PIN-код
            <div className="pin-field">
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={4}
                placeholder="4 цифры"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                required
                autoFocus
              />
              <button type="button" className="pin-toggle" onClick={() => setShowPin(!showPin)}>
                {showPin ? '🙈' : '👁'}
              </button>
            </div>
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Создаём...' : 'Завершить регистрацию'}
          </button>
        </form>
      </div>
    )
  }

  // === Регистрация по коду от админа (для тех, у кого нет Telegram) ===
  if (mode === 'code') {
    return (
      <div className="auth-page">
        <h1>Регистрация по коду</h1>
        <p className="auth-hint">Введи код, который выдал админ, и придумай свой PIN.</p>
        <form onSubmit={submitCodeRegister}>
          <label>
            Имя
            <input
              type="text"
              placeholder="Как тебя зовут"
              value={codeName}
              onChange={e => setCodeName(e.target.value)}
              required
            />
          </label>
          <label>
            Телефон
            <PhoneInput value={codePhone} onChange={setCodePhone} required />
          </label>
          <label>
            Код от админа
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="6 цифр"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
            />
          </label>
          <label>
            Придумай PIN-код
            <div className="pin-field">
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={4}
                placeholder="4 цифры"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                required
              />
              <button type="button" className="pin-toggle" onClick={() => setShowPin(!showPin)}>
                {showPin ? '🙈' : '👁'}
              </button>
            </div>
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Создаём...' : 'Зарегистрироваться'}
          </button>
        </form>
        <p className="auth-switch">
          <button type="button" className="link-btn" onClick={() => { setMode('start'); setError('') }}>Назад</button>
        </p>
      </div>
    )
  }

  // === Старт: одна кнопка → бот ===
  return (
    <div className="auth-page">
      <h1>Регистрация</h1>
      <p className="auth-hint">Зарегистрируйся через Telegram — займёт минуту.</p>
      <button type="button" className="tg-register-btn" onClick={openTgBot}>
        📱 Зарегистрироваться через Telegram
      </button>
      <p className="auth-switch">
        Нет Telegram? <button type="button" className="link-btn" onClick={() => { setMode('code'); setError('') }}>Регистрация по коду</button>
      </p>
      <p className="auth-switch">
        Уже есть аккаунт? <button type="button" onClick={onSwitch}>Войти</button>
      </p>
    </div>
  )
}
