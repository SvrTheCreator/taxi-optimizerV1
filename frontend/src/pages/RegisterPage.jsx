import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function RegisterPage({ onSwitch }) {
  const { register } = useAuth()
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (pin.length !== 4) {
      setError('ПИН должен быть 4 цифры')
      return
    }
    setLoading(true)
    try {
      await register(phone, name, pin)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <h1>Регистрация</h1>
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
          Имя
          <input
            type="text"
            placeholder="Как вас зовут"
            value={name}
            onChange={e => setName(e.target.value)}
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
          {loading ? 'Регистрируем...' : 'Зарегистрироваться'}
        </button>
      </form>
      <p className="auth-switch">
        Уже есть аккаунт? <button type="button" onClick={onSwitch}>Войти</button>
      </p>
    </div>
  )
}
