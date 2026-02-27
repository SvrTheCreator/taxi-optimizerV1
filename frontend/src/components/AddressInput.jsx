// Паттерн: Controlled Component — значение инпута хранится в state React
// Паттерн: Debounce — не делаем запрос на каждую букву, ждём паузу 300мс

import { useState, useEffect, useRef } from 'react'
import { getAddressSuggestions, getYandexSuggestions } from '../utils/api'

export default function AddressInput({ value, onChange, placeholder }) {
  const [suggestions, setSuggestions] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (value.length < 2) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      // Запрашиваем параллельно: историю (бэкенд) и Яндекс подсказки (бэкенд)
      const [historyResults, yandexResults] = await Promise.all([
        getAddressSuggestions(value),
        getYandexSuggestions(value),
      ])

      // Объединяем: сначала история (часто используемые), потом Яндекс (без дублей)
      const historySet = new Set(historyResults.map(r => r.raw.toLowerCase()))
      const combined = [
        ...historyResults,
        ...yandexResults
          .filter(r => !historySet.has(r.raw.toLowerCase()))
          .map(r => ({ ...r, fromYandex: true })),
      ].slice(0, 7) // максимум 7 подсказок

      setSuggestions(combined)
      setShowDropdown(combined.length > 0)
    }, 300)

    return () => clearTimeout(debounceRef.current)
  }, [value])

  function handleSelect(suggestion) {
    onChange(suggestion.raw)
    setShowDropdown(false)
    setSuggestions([])
  }

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        placeholder={placeholder || 'Введите адрес'}
        className="address-input"
      />
      {showDropdown && (
        <ul className="suggestions-dropdown">
          {suggestions.map((s, i) => (
            <li key={i} onMouseDown={() => handleSelect(s)}>
              <span className="suggest-text">{s.raw}</span>
              {s.use_count && <span className="use-count">×{s.use_count}</span>}
              {s.fromYandex && <span className="suggest-badge">Яндекс</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
