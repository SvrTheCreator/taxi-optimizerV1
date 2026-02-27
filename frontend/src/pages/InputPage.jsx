import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import AddressInput from '../components/AddressInput'
import { geocodeAddress, saveAddress } from '../utils/api'
import { optimize } from '../utils/optimizer'

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

  async function handleOptimize() {
    if (state.entries.length === 0) return

    dispatch({ type: 'SET_LOADING', payload: true })

    try {
      // Геокодируем все адреса (бэкенд кэширует, так что повторные — быстрые)
      const geocoded = await Promise.all(
        state.entries.map(async entry => {
          const coords = await geocodeAddress(entry.address)
          await saveAddress(entry.address, coords.lat, coords.lon)
          return { ...entry, ...coords }
        })
      )

      // Запускаем алгоритм оптимизации
      const result = optimize(geocoded, WORK_COORDS)
      dispatch({ type: 'SET_RESULT', payload: result })
      navigate('/result')
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message })
    }
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
        <p className='subtitle'>Рабочий адрес: {WORK_ADDRESS}</p>
      </header>

      <div className='input-section card'>
        <h2>Добавить адрес</h2>

        <div className='input-row'>
          <AddressInput
            value={addressValue}
            onChange={setAddressValue}
            placeholder='Адрес поездки'
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
          {Object.keys(byTime)
            .sort()
            .map(time => (
              <div key={time} className='card'>
                <h3 className='time-badge'>{time}</h3>
                <ul className='entry-list'>
                  {byTime[time].map(entry => (
                    <li key={entry.id} className='entry-item'>
                      <span>{entry.address}</span>
                      <button
                        className='btn-remove'
                        onClick={() =>
                          dispatch({ type: 'REMOVE_ENTRY', payload: entry.id })
                        }
                      >
                        ✕
                      </button>
                    </li>
                  ))}
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
