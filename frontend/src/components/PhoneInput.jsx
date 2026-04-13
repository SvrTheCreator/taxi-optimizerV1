import { useRef } from 'react'

// Форматирует: +7 999 123 45 67
function formatPhone(digits) {
  let s = '+7'
  if (digits.length > 0) s += ' ' + digits.slice(0, 3)
  if (digits.length > 3) s += ' ' + digits.slice(3, 6)
  if (digits.length > 6) s += ' ' + digits.slice(6, 8)
  if (digits.length > 8) s += ' ' + digits.slice(8, 10)
  return s
}

// Извлекает 10 цифр после +7
function extractDigits(value) {
  // Если начинает с 8 — считаем это +7
  let clean = value.replace(/[^\d+]/g, '')
  if (clean.startsWith('8') && !clean.startsWith('+')) {
    clean = '+7' + clean.slice(1)
  }
  if (clean.startsWith('+7')) {
    return clean.slice(2).slice(0, 10)
  }
  if (clean.startsWith('7') && clean.length > 1) {
    return clean.slice(1).slice(0, 10)
  }
  return clean.slice(0, 10)
}

export default function PhoneInput({ value, onChange, ...props }) {
  const ref = useRef(null)

  function handleChange(e) {
    const digits = extractDigits(e.target.value)
    onChange('+7' + digits)
  }

  // Отображаем с пробелами, а value храним как +79991234567
  const digits = value.startsWith('+7') ? value.slice(2) : ''
  const display = formatPhone(digits)

  return (
    <input
      ref={ref}
      type="tel"
      value={display}
      onChange={handleChange}
      placeholder="+7 999 123 45 67"
      maxLength={16}
      {...props}
    />
  )
}

// Для бэкенда: отправляем чистый номер
export function cleanPhone(formatted) {
  return formatted.replace(/\D/g, '')
}
