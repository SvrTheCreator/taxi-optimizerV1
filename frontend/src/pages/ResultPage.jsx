import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { formatResultAsText } from '../utils/optimizer'
import { saveSession } from '../utils/api'
import MapView from '../components/MapView'

export default function ResultPage() {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [mapTaxi, setMapTaxi] = useState(null)      // такси открытое в карте
  const [movingAddress, setMovingAddress] = useState(null)

  if (!state.result) {
    navigate('/')
    return null
  }

  async function handleCopy() {
    const text = formatResultAsText(state.result)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    await saveSession(state.result)
  }

  function handleMoveStart(address, fromTaxiId, time) {
    setMovingAddress({ address, fromTaxiId, time })
  }

  function handleMoveTo(toTaxiId) {
    if (!movingAddress) return
    dispatch({
      type: 'MOVE_ADDRESS',
      payload: {
        time: movingAddress.time,
        fromTaxiId: movingAddress.fromTaxiId,
        toTaxiId,
        address: movingAddress.address,
      },
    })
    setMovingAddress(null)
  }

  function handleTaxiClick(taxi) {
    if (movingAddress) {
      handleMoveTo(taxi.id)
    } else {
      setMapTaxi(taxi) // открываем карту
    }
  }

  const totalTaxis = state.result.reduce((sum, g) => sum + g.taxis.length, 0)

  return (
    <div className="page">
      <header className="header">
        <button className="btn btn-ghost" onClick={() => navigate('/')}>← Назад</button>
        <h1>Результат</h1>
        <span className="badge">{totalTaxis} машин</span>
      </header>

      {movingAddress && (
        <div className="move-hint card">
          Перемещаем: <strong>{movingAddress.address}</strong>
          <button className="btn btn-ghost" onClick={() => setMovingAddress(null)}>Отмена</button>
        </div>
      )}

      <p className="tap-hint">Нажми на машину чтобы посмотреть маршрут</p>

      <div className="result-list">
        {state.result.map(group => (
          <div key={group.time} className="shift-group">
            <h2 className="shift-time">{group.time}</h2>
            <div className="taxis-grid">
              {group.taxis.map(taxi => (
                <div
                  key={taxi.id}
                  className={`taxi-card card ${movingAddress && movingAddress.fromTaxiId !== taxi.id ? 'droptarget' : ''}`}
                  onClick={() => handleTaxiClick(taxi)}
                >
                  <div className="taxi-header">
                    <span className="taxi-title">Такси {taxi.id}</span>
                    <div className="taxi-header-right">
                      <span className="taxi-count">{taxi.addresses.length}/4</span>
                      <span className="map-icon">🗺</span>
                    </div>
                  </div>
                  <ul className="taxi-addresses">
                    {taxi.addresses.map((addr, i) => (
                      <li key={i} className="taxi-address">
                        <span className="addr-num">{i + 1}</span>
                        <span className="addr-text">{addr}</span>
                        <button
                          className="btn-move"
                          title="Переместить в другую машину"
                          onClick={e => { e.stopPropagation(); handleMoveStart(addr, taxi.id, group.time) }}
                        >
                          ⇄
                        </button>
                      </li>
                    ))}
                  </ul>
                  {movingAddress && movingAddress.fromTaxiId !== taxi.id && (
                    <div className="drop-overlay">Добавить сюда</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bottom-bar">
        <button className="btn btn-primary full-width" onClick={handleCopy}>
          {copied ? '✓ Скопировано!' : 'Скопировать текст'}
        </button>
      </div>

      {/* Карта — появляется поверх всего когда выбрано такси */}
      <MapView taxi={mapTaxi} onClose={() => setMapTaxi(null)} />
    </div>
  )
}
