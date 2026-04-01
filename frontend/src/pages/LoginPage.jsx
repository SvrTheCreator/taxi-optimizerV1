import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function LoginPage({ onSwitch }) {
  const { login } = useAuth()
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
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
            placeholder="89991234567"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            required
          />
        </label>
        <label>
          ПИН-код
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="4 цифры"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            required
          />
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
