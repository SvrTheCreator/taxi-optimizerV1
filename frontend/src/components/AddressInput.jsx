// Паттерн: Controlled Component — значение инпута хранится в state React
// Паттерн: Debounce — не делаем запрос на каждую букву, ждём паузу 300мс

import { useState, useEffect, useRef } from 'react'
import { getAddressSuggestions } from '../utils/api'

// Запрашиваем подсказки напрямую из Яндекс.Карт JS API (ymaps.suggest)
// Это настоящий саджест как в Яндекс.Такси — работает с любым адресом в Ростове
function getYmapsSuggestions(value) {
  return new Promise(resolve => {
    if (!window.ymaps) return resolve([])
    window.ymaps.ready(() => {
      window.ymaps
        .suggest(`${value}, Ростов-на-Дону`, {
          boundedBy: [[46.5, 38.5], [47.8, 41.5]],
          results: 6,
          types: 'geo',
        })
        .then(items =>
          resolve(
            items.map(item => ({
              raw: item.displayName,
              fromYandex: true,
            }))
          )
        )
        .catch(() => resolve([]))
    })
  })
}

export default function AddressInput({ value, onChange, placeholder, onPaste }) {
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
      // Запрашиваем параллельно: историю (бэкенд) и Яндекс подсказки (JS API)
      const [historyResults, yandexResults] = await Promise.all([
        getAddressSuggestions(value),
        getYmapsSuggestions(value),
      ])

      // Объединяем: сначала история (часто используемые), потом Яндекс (без дублей)
      const historySet = new Set(historyResults.map(r => r.raw.toLowerCase()))
      const combined = [
        ...historyResults,
        ...yandexResults.filter(r => !historySet.has(r.raw.toLowerCase())),
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
        onPaste={onPaste}
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
