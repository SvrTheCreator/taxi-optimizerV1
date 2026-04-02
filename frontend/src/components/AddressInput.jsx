// Паттерн: Controlled Component — значение инпута хранится в state React
// Паттерн: Debounce — не делаем запрос на каждую букву, ждём паузу 300мс

import { useState, useEffect, useRef } from 'react'

// Запрашиваем подсказки напрямую из Яндекс.Карт JS API (ymaps.suggest)
// Это настоящий саджест как в Яндекс.Такси — работает с любым адресом в Ростове
function getYmapsSuggestions(value) {
  return new Promise(resolve => {
    if (!window.ymaps) return resolve([])
    window.ymaps.ready(() => {
      // Ищем по Ростовской области (Ростов, Батайск, Азов, Новочеркасск и др.)
      const hasCity = /ростов|батайск|азов|новочеркасск/i.test(value)
      const query = hasCity ? value : `${value}, Ростовская область`
      window.ymaps
        .suggest(query, {
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
      const combined = await getYmapsSuggestions(value)

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
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
