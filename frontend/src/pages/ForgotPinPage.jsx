import { useState } from 'react'
import PhoneInput from '../components/PhoneInput'

export default function ForgotPinPage({ onBack }) {
  const [step, setStep] = useState('phone') // 'phone' | 'code'
  const [phone, setPhone] = useState('+7')
  const [code, setCode] = useState('')
  const [newPin, setNewPin] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  async function requestCode(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    const digits = phone.replace(/\D/g, '')
    if (digits.length !== 11) {
      setError('Номер должен быть 11 цифр')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-pin/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Не удалось отправить код')
        return
      }
      setInfo('Если телефон привязан к Telegram — код пришёл туда. Проверь бота.')
      setStep('code')
    } finally {
      setLoading(false)
    }
  }

  async function verify(e) {
    e.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(code)) {
      setError('Код должен быть 6 цифр')
      return
    }
    if (!/^\d{4}$/.test(newPin)) {
      setError('PIN должен быть 4 цифры')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-pin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, newPin }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Не удалось сменить PIN')
        return
      }
      setInfo('✅ PIN изменён. Теперь можно войти.')
      setTimeout(onBack, 1500)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <h1>Восстановление PIN</h1>

      {step === 'phone' && (
        <form onSubmit={requestCode}>
          <p className="auth-hint">
            Если ты заранее привязал Telegram — мы пришлём код туда.
          </p>
          <label>
            Телефон
            <PhoneInput value={phone} onChange={setPhone} required />
          </label>
          {error && <p className="error">{error}</p>}
          {info && <p className="info">{info}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Отправляем...' : 'Отправить код'}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={verify}>
          {info && <p className="info">{info}</p>}
          <label>
            Код из Telegram
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
            Новый PIN
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="4 цифры"
              value={newPin}
              onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Сохраняем...' : 'Сменить PIN'}
          </button>
          <button type="button" className="link-btn" onClick={() => { setStep('phone'); setCode(''); setNewPin(''); setError('') }}>
            Назад
          </button>
        </form>
      )}

      <p className="auth-switch">
        <button type="button" onClick={onBack}>Вернуться ко входу</button>
      </p>
    </div>
  )
}
