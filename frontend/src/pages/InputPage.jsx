import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import AddressInput from '../components/AddressInput'
import { geocodeAddress, saveAddress } from '../utils/api'
import { optimize } from '../utils/optimizer'

function EntryItem({
  entry,
  isSelected,
  isRevealed,
  canBeTarget,
  onTap,
  onReveal,
  onDelete,
}) {
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)
  const lastTouchEnd = useRef(0)

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return
    lastTouchEnd.current = Date.now()
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    touchStartX.current = null

    const isSwipeLeft = dx < -50 && Math.abs(dx) > Math.abs(dy) * 1.5
    const isSwipeRight = dx > 30 && Math.abs(dx) > Math.abs(dy) * 1.5
    const isTap = Math.abs(dx) < 10 && Math.abs(dy) < 10

    if (isSwipeLeft && !isRevealed) {
      onReveal()
      return
    }
    if (isSwipeRight && isRevealed) {
      onReveal()
      return
    }
    if (isTap) {
      if (isRevealed) {
        onReveal()
        return
      }
      onTap()
    }
  }

  function handleClick() {
    if (Date.now() - lastTouchEnd.current < 500) return // skip ghost click after touch
    if (isRevealed) {
      onReveal()
      return
    }
    onTap()
  }

  return (
    <li
      className={`entry-item${isSelected ? ' entry-selected' : ''}${canBeTarget ? ' entry-target' : ''}`}
    >
      <div
        className={`entry-inner${isRevealed ? ' entry-revealed' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
      >
        <span className='entry-address'>{entry.address}</span>
        {canBeTarget && <span className='entry-target-dot'>↕</span>}
        {isSelected && <span className='entry-selected-dot'>✓</span>}
      </div>
      <button
        className='btn-swipe-delete'
        onClick={e => {
          e.stopPropagation()
          onDelete()
        }}
      >
        Удалить
      </button>
    </li>
  )
}

// Рабочий адрес — точка отправления всех машин
const WORK_ADDRESS = 'Республиканская ул., 106А, Ростов-на-Дону'
const WORK_COORDS = { lat: 47.2357, lon: 39.7015 } // примерные координаты

// Доступные времена смен (можно будет добавить)
const COMMON_TIMES = ['20:00', '21:00', '21:15', '22:00', '22:15', '23:00']

export default function InputPage() {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()

  const [addressValue, setAddressValue] = useState('')
  const [timeValue, setTimeValue] = useState('20:00')
  const [customTime, setCustomTime] = useState('')
  const [useCustomTime, setUseCustomTime] = useState(false)
  const [selectedEntryId, setSelectedEntryId] = useState(null)
  const [revealedEntryId, setRevealedEntryId] = useState(null)

  const selectedTime = useCustomTime ? customTime : timeValue

  function handleAdd() {
    const address = addressValue.trim()
    const time = selectedTime.trim()
    if (!address || !time) return

    dispatch({
      type: 'ADD_ENTRY',
      payload: {
        id: Date.now().toString(),
        address,
        time,
      },
    })
    setAddressValue('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleAdd()
  }

  // Массовая вставка: если вставляют несколько строк — добавляем все сразу
  function handlePaste(e) {
    const text = e.clipboardData.getData('text')
    const lines = text
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
    if (lines.length < 2) return // одиночный адрес — обычная вставка

    e.preventDefault()
    const time = selectedTime.trim()
    if (!time) return

    lines.forEach((address, i) => {
      dispatch({
        type: 'ADD_ENTRY',
        payload: { id: (Date.now() + i).toString(), address, time },
      })
    })
    setAddressValue('')
  }

  async function handleOptimize() {
    if (state.entries.length === 0) return

    dispatch({ type: 'SET_LOADING', payload: true })

    try {
      // Геокодируем все адреса параллельно, не останавливаясь на ошибках
      const results = await Promise.allSettled(
        state.entries.map(async entry => {
          const coords = await geocodeAddress(entry.address)
          await saveAddress(entry.address, coords.lat, coords.lon)
          return { ...entry, ...coords }
        })
      )

      const geocoded = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
      const failed = results
        .map((r, i) =>
          r.status === 'rejected' ? state.entries[i].address : null
        )
        .filter(Boolean)

      if (geocoded.length === 0) {
        dispatch({
          type: 'SET_ERROR',
          payload: `Не найдено ни одного адреса: ${failed.join(', ')}`,
        })
        return
      }

      if (failed.length > 0) {
        // Удаляем ненайденные из списка и показываем предупреждение
        dispatch({ type: 'REMOVE_FAILED', payload: failed })
        dispatch({
          type: 'SET_ERROR',
          payload: `Не найдено (удалено): ${failed.join(', ')}`,
        })
      }

      // Запускаем алгоритм оптимизации с теми адресами что нашлись
      const result = optimize(geocoded, WORK_COORDS)
      dispatch({ type: 'SET_RESULT', payload: result })
      navigate('/result')
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message })
    }
  }

  function handleEntryTap(entry) {
    setRevealedEntryId(null)
    if (selectedEntryId === null) {
      setSelectedEntryId(entry.id)
    } else if (selectedEntryId === entry.id) {
      setSelectedEntryId(null)
    } else {
      const sel = state.entries.find(e => e.id === selectedEntryId)
      if (sel?.time === entry.time) {
        dispatch({
          type: 'REORDER_ENTRIES',
          payload: { fromId: selectedEntryId, toId: entry.id },
        })
      }
      setSelectedEntryId(null)
    }
  }

  function handleSwipeReveal(entryId) {
    setSelectedEntryId(null)
    setRevealedEntryId(revealedEntryId === entryId ? null : entryId)
  }

  // Группируем введённые адреса по времени для отображения
  const byTime = state.entries.reduce((acc, e) => {
    acc[e.time] = acc[e.time] || []
    acc[e.time].push(e)
    return acc
  }, {})

  return (
    <div className='page'>
      <header className='header'>
        <h1>Такси Оптимизатор</h1>
        <p className='subtitle'>
          Рабочий адрес:
          <br />
          {WORK_ADDRESS}
        </p>
      </header>

      <div className='input-section card'>
        <h2>Добавить адрес</h2>

        <div className='input-row'>
          <AddressInput
            value={addressValue}
            onChange={setAddressValue}
            placeholder='Адрес поездки — или вставь список'
            onPaste={handlePaste}
          />
          <button
            onClick={handleAdd}
            className='btn btn-primary'
            disabled={!addressValue.trim() || !selectedTime}
          >
            +
          </button>
        </div>

        <div className='time-row'>
          <label>Время смены:</label>
          {!useCustomTime ? (
            <select
              value={timeValue}
              onChange={e => setTimeValue(e.target.value)}
              className='time-select'
            >
              {COMMON_TIMES.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          ) : (
            <input
              type='time'
              value={customTime}
              onChange={e => setCustomTime(e.target.value)}
              className='time-input'
              onKeyDown={handleKeyDown}
            />
          )}
          <button
            className='btn btn-ghost'
            onClick={() => setUseCustomTime(!useCustomTime)}
          >
            {useCustomTime ? 'Выбрать' : 'Другое'}
          </button>
        </div>
      </div>

      {state.error && <div className='error-message'>{state.error}</div>}

      {Object.keys(byTime).length > 0 && (
        <div className='entries-section'>
          {selectedEntryId && (
            <p className='tap-hint'>
              Нажмите на другой адрес в той же группе — он встанет на это место
            </p>
          )}
          {!selectedEntryId && (
            <p className='tap-hint'>
              Нажмите адрес — выберите куда переставить · Свайп влево — удалить
            </p>
          )}
          {Object.keys(byTime)
            .sort()
            .map(time => (
              <div key={time} className='card'>
                <h3 className='time-badge'>{time}</h3>
                <ul className='entry-list'>
                  {byTime[time].map(entry => {
                    const sel = selectedEntryId
                      ? state.entries.find(e => e.id === selectedEntryId)
                      : null
                    const canBeTarget =
                      sel !== null &&
                      sel?.id !== entry.id &&
                      sel?.time === entry.time
                    return (
                      <EntryItem
                        key={entry.id}
                        entry={entry}
                        isSelected={selectedEntryId === entry.id}
                        isRevealed={revealedEntryId === entry.id}
                        canBeTarget={canBeTarget}
                        onTap={() => handleEntryTap(entry)}
                        onReveal={() => handleSwipeReveal(entry.id)}
                        onDelete={() => {
                          setSelectedEntryId(null)
                          setRevealedEntryId(null)
                          dispatch({ type: 'REMOVE_ENTRY', payload: entry.id })
                        }}
                      />
                    )
                  })}
                </ul>
              </div>
            ))}
        </div>
      )}

      {state.entries.length > 0 && (
        <div className='bottom-bar'>
          <span>{state.entries.length} адресов</span>
          <div>
            <button
              className='btn btn-ghost'
              onClick={() => dispatch({ type: 'CLEAR_ENTRIES' })}
            >
              Очистить
            </button>
            <button
              className='btn btn-primary'
              onClick={handleOptimize}
              disabled={state.loading}
            >
              {state.loading ? 'Геокодируем...' : 'Оптимизировать →'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
