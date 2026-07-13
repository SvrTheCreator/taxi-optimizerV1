import { useState, useEffect, useRef } from 'react'
import { ymapsReady } from '../utils/ymaps'

function getYmapsSuggestions(value) {
  return new Promise(resolve => {
    // ymaps грузится асинхронно; ждём его, при недоступности — пустые подсказки
    ymapsReady().then(ymaps => {
      const hasCity = /ростов|батайск|азов|новочеркасск/i.test(value)
      const query = hasCity ? value : `${value}, Ростовская область`
      ymaps
        .suggest(query, {
          boundedBy: [[46.5, 38.5], [47.8, 41.5]],
          results: 6,
          types: 'geo',
        })
        .then(items => resolve(items.map(item => ({ raw: item.displayName }))))
        .catch(() => resolve([]))
    }).catch(() => resolve([]))
  })
}

export default function AddressInput({ value, onChange, placeholder, onPaste }) {
  const [suggestions, setSuggestions] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const debounceRef = useRef(null)
  const justSelected = useRef(false)

  useEffect(() => {
    // После выбора из списка — не искать заново
    if (justSelected.current) {
      justSelected.current = false
      return
    }

    if (value.length < 2) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const results = await getYmapsSuggestions(value)
      setSuggestions(results)
      setShowDropdown(results.length > 0)
    }, 300)

    return () => clearTimeout(debounceRef.current)
  }, [value])

  function handleSelect(suggestion) {
    justSelected.current = true
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
