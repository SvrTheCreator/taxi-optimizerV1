import { useState, useRef, useCallback } from 'react'
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
  const [dragInfo, setDragInfo] = useState(null)       // { taxiId, time, index }
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const touchRef = useRef(null)   // для touch drag на мобильных

  // --- Touch drag для мобильных ---
  const handleTouchStart = useCallback((e, taxiId, time, index) => {
    const touch = e.touches[0]
    touchRef.current = { taxiId, time, index, startY: touch.clientY, moved: false, el: e.currentTarget }
    e.currentTarget.classList.add('dragging')
  }, [])

  const handleTouchMove = useCallback((e) => {
    if (!touchRef.current) return
    const touch = e.touches[0]
    const dy = Math.abs(touch.clientY - touchRef.current.startY)
    if (dy > 8) touchRef.current.moved = true
    if (!touchRef.current.moved) return
    e.preventDefault()

    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    if (!el) return
    const li = el.closest('.taxi-address')
    if (!li) return
    const ul = li.closest('.taxi-addresses')
    if (!ul) return
    const items = Array.from(ul.querySelectorAll('.taxi-address'))
    const overIdx = items.indexOf(li)
    if (overIdx !== -1) setDragOverIndex(overIdx)
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (!touchRef.current) return
    const { taxiId, time, index, moved, el } = touchRef.current
    el.classList.remove('dragging')
    if (moved && dragOverIndex !== null && dragOverIndex !== index) {
      dispatch({
        type: 'REORDER_ADDRESSES',
        payload: { time, taxiId, fromIndex: index, toIndex: dragOverIndex },
      })
    }
    touchRef.current = null
    setDragOverIndex(null)
  }, [dragOverIndex, dispatch])

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

  function handleDragStart(e, taxiId, time, index) {
    setDragInfo({ taxiId, time, index })
    e.dataTransfer.effectAllowed = 'move'
    e.currentTarget.classList.add('dragging')
  }

  function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging')
    setDragInfo(null)
    setDragOverIndex(null)
  }

  function handleDragOver(e, taxiId, index) {
    if (!dragInfo || dragInfo.taxiId !== taxiId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  function handleDrop(e, taxiId, time, index) {
    e.preventDefault()
    if (!dragInfo || dragInfo.taxiId !== taxiId || dragInfo.index === index) {
      setDragInfo(null)
      setDragOverIndex(null)
      return
    }
    dispatch({
      type: 'REORDER_ADDRESSES',
      payload: { time, taxiId, fromIndex: dragInfo.index, toIndex: index },
    })
    setDragInfo(null)
    setDragOverIndex(null)
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
                      <li
                        key={addr + i}
                        className={`taxi-address${dragInfo && dragInfo.taxiId === taxi.id && dragOverIndex === i ? ' drag-over' : ''}`}
                        draggable
                        onDragStart={e => handleDragStart(e, taxi.id, group.time, i)}
                        onDragEnd={handleDragEnd}
                        onDragOver={e => handleDragOver(e, taxi.id, i)}
                        onDrop={e => handleDrop(e, taxi.id, group.time, i)}
                        onTouchStart={e => handleTouchStart(e, taxi.id, group.time, i)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                      >
                        <span className="drag-handle" title="Перетащи для сортировки" onClick={e => e.stopPropagation()}>☰</span>
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
