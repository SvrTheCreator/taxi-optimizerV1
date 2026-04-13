import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import PhoneInput from '../components/PhoneInput'

export default function RegisterPage({ onSwitch }) {
  const { register } = useAuth()
  const [phone, setPhone] = useState('+7')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const phoneDigits = phone.replace(/\D/g, '')
    if (phoneDigits.length !== 11) {
      setError('Номер телефона должен быть 11 цифр')
      return
    }
    if (pin.length !== 4) {
      setError('ПИН должен быть 4 цифры')
      return
    }
    setLoading(true)
    try {
      await register(phone, name, pin, inviteCode)
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
          Код приглашения
          <input
            type="text"
            placeholder="получите у администратора"
            value={inviteCode}
            onChange={e => setInviteCode(e.target.value.toUpperCase().slice(0, 4))}
          />
          <small style={{ color: '#9E9E9E' }}>Администратору код не нужен</small>
        </label>
        <label>
          Телефон
          <PhoneInput value={phone} onChange={setPhone} required />
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
          {loading ? 'Регистрируем...' : 'Зарегистрироваться'}
        </button>
      </form>
      <p className="auth-switch">
        Уже есть аккаунт? <button type="button" onClick={onSwitch}>Войти</button>
      </p>
    </div>
  )
}
