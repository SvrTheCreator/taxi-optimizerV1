import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function LoginPage({ onSwitch }) {
  const { login } = useAuth()
  const [phone, setPhone] = useState('+7')
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(phone, pin)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <h1>Вход</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Телефон
          <input
            type="tel"
            placeholder="+7 999 123 45 67"
            value={phone}
            onChange={e => {
              let val = e.target.value
              // Всегда начинаем с +7
              if (!val.startsWith('+7')) val = '+7'
              // Оставляем только +7 и цифры после
              const digits = val.slice(2).replace(/\D/g, '').slice(0, 10)
              setPhone('+7' + digits)
            }}
            maxLength={12}
            required
          />
        </label>
        <label>
          ПИН-код
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
          {loading ? 'Входим...' : 'Войти'}
        </button>
      </form>
      <p className="auth-switch">
        Нет аккаунта? <button type="button" onClick={onSwitch}>Регистрация</button>
      </p>
    </div>
  )
}
