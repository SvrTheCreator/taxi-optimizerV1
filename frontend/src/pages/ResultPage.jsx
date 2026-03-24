import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { formatResultAsText } from '../utils/optimizer'
import { saveSession } from '../utils/api'
import MapView from '../components/MapView'

export default function ResultPage() {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [mapTaxi, setMapTaxi] = useState(null)
  const [movingAddress, setMovingAddress] = useState(null)
  const [dragInfo, setDragInfo] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [selectedAddr, setSelectedAddr] = useState(null)   // { address, taxiId, time, index }
  const [revealedAddr, setRevealedAddr] = useState(null)   // { address, taxiId }

  const addrTouchStart = useRef(null)
  const addrTouchActive = useRef(false)

  function handleAddrTouchStart(e, addr, taxiId, time, index) {
    addrTouchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, addr, taxiId, time, index }
    addrTouchActive.current = false
  }

  function handleAddrTouchEnd(e) {
    if (!addrTouchStart.current) return
    addrTouchActive.current = true
    setTimeout(() => { addrTouchActive.current = false }, 500)
    const { x, y, addr, taxiId, time, index } = addrTouchStart.current
    const dx = e.changedTouches[0].clientX - x
    const dy = e.changedTouches[0].clientY - y
    addrTouchStart.current = null

    const isRevealed = revealedAddr?.address === addr && revealedAddr?.taxiId === taxiId
    const isSwipeLeft = dx < -50 && Math.abs(dx) > Math.abs(dy) * 1.5
    const isSwipeRight = dx > 30 && Math.abs(dx) > Math.abs(dy) * 1.5
    const isTap = Math.abs(dx) < 10 && Math.abs(dy) < 10

    if (isSwipeLeft && !isRevealed) { setRevealedAddr({ address: addr, taxiId }); setSelectedAddr(null); return }
    if (isSwipeRight && isRevealed) { setRevealedAddr(null); return }
    if (isTap) {
      if (isRevealed) { setRevealedAddr(null); return }
      handleAddrTap(addr, taxiId, time, index)
    }
  }

  function handleAddrTap(addr, taxiId, time, index) {
    setRevealedAddr(null)
    if (!selectedAddr) {
      setSelectedAddr({ address: addr, taxiId, time, index })
    } else if (selectedAddr.address === addr && selectedAddr.taxiId === taxiId) {
      setSelectedAddr(null)
    } else if (selectedAddr.taxiId === taxiId) {
      dispatch({ type: 'REORDER_ADDRESSES', payload: { time, taxiId, fromIndex: selectedAddr.index, toIndex: index } })
      setSelectedAddr(null)
    } else {
      setSelectedAddr(null)
    }
  }

  function handleAddrClick(e, addr, taxiId, time, index) {
    e.stopPropagation()
    if (addrTouchActive.current) return
    handleAddrTap(addr, taxiId, time, index)
  }

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
    if (selectedAddr || revealedAddr) { setSelectedAddr(null); setRevealedAddr(null); return }
    if (movingAddress) { handleMoveTo(taxi.id); return }
    setMapTaxi(taxi)
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
                    {taxi.addresses.map((addr, i) => {
                      const isRevealed = revealedAddr?.address === addr && revealedAddr?.taxiId === taxi.id
                      const isSelected = selectedAddr?.address === addr && selectedAddr?.taxiId === taxi.id
                      const canBeTarget = selectedAddr?.taxiId === taxi.id && !isSelected
                      return (
                        <li
                          key={addr + i}
                          className={`taxi-address${dragInfo && dragInfo.taxiId === taxi.id && dragOverIndex === i ? ' drag-over' : ''}`}
                          onDragOver={e => handleDragOver(e, taxi.id, i)}
                          onDrop={e => handleDrop(e, taxi.id, group.time, i)}
                        >
                          <div
                            className={`addr-inner${isRevealed ? ' addr-revealed' : ''}${isSelected ? ' addr-selected' : ''}${canBeTarget ? ' addr-target' : ''}`}
                            draggable
                            onDragStart={e => handleDragStart(e, taxi.id, group.time, i)}
                            onDragEnd={handleDragEnd}
                            onTouchStart={e => handleAddrTouchStart(e, addr, taxi.id, group.time, i)}
                            onTouchEnd={handleAddrTouchEnd}
                            onClick={e => handleAddrClick(e, addr, taxi.id, group.time, i)}
                          >
                            <span className="drag-handle" onClick={e => e.stopPropagation()}>☰</span>
                            <span className="addr-num">{i + 1}</span>
                            <span className="addr-text">{addr}</span>
                            <button
                              className="btn-move"
                              onClick={e => { e.stopPropagation(); handleMoveStart(addr, taxi.id, group.time) }}
                            >
                              ⇄
                            </button>
                            <button
                              className="btn-addr-trash"
                              onClick={e => { e.stopPropagation(); dispatch({ type: 'REMOVE_ADDRESS', payload: { time: group.time, taxiId: taxi.id, address: addr } }) }}
                            >
                              🗑
                            </button>
                          </div>
                          <button
                            className="btn-addr-delete"
                            onClick={e => { e.stopPropagation(); setRevealedAddr(null); dispatch({ type: 'REMOVE_ADDRESS', payload: { time: group.time, taxiId: taxi.id, address: addr } }) }}
                          >
                            🗑
                          </button>
                        </li>
                      )
                    })}
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
