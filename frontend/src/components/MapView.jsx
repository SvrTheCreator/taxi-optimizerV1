import { useEffect, useRef, useState } from 'react'
import { geocodeAddress } from '../utils/api'

// Примерные координаты — будут заменены точными при первом запросе
let workCoordsCache = null
const WORK_ADDRESS = 'Республиканская ул., 106А, Ростов-на-Дону'

// Получаем точные координаты рабочего адреса через наш геокодер (кэшируем в памяти)
async function getWorkCoords() {
  if (workCoordsCache) return workCoordsCache
  try {
    const coords = await geocodeAddress(WORK_ADDRESS)
    workCoordsCache = [coords.lat, coords.lon]
  } catch {
    workCoordsCache = [47.2358, 39.7137] // fallback если геокодер недоступен
  }
  return workCoordsCache
}

// OSRM — бесплатный Open Source маршрутизатор на базе OpenStreetMap
// Не требует API ключа, строит реальные маршруты по дорогам
async function fetchOsrmRoute(points) {
  // OSRM принимает координаты в формате "lon,lat;lon,lat;..."
  const coordStr = points.map(([lat, lon]) => `${lon},${lat}`).join(';')
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`

  const response = await fetch(url)
  const data = await response.json()

  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error('Маршрут не найден')
  }

  const route = data.routes[0]
  // OSRM возвращает [lon, lat], Яндекс.Карты ожидают [lat, lon] — меняем местами
  const polylineCoords = route.geometry.coordinates.map(([lon, lat]) => [lat, lon])

  return {
    polylineCoords,
    distKm: (route.distance / 1000).toFixed(1),
    durationMin: Math.round(route.duration / 60),
  }
}

export default function MapView({ taxi, onClose }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const [status, setStatus] = useState('Строим маршрут...')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!taxi || !mapRef.current) return

    setIsLoading(true)
    setStatus('Строим маршрут...')

    // Получаем точные координаты рабочего адреса + строим маршрут + готовим карту — всё параллельно
    const mapReady = new Promise(resolve => window.ymaps.ready(resolve))
    const workCoordsReady = getWorkCoords()

    // Ждём координаты работы, потом можем запросить маршрут
    const routeReady = workCoordsReady.then(workCoords => {
      const allPoints = [
        workCoords,
        ...(taxi.points || []).filter(p => p.lat && p.lon).map(p => [p.lat, p.lon]),
      ]
      return fetchOsrmRoute(allPoints).then(data => ({ ...data, workCoords }))
    })

    Promise.all([mapReady, routeReady])
      .then(([, routeData]) => {
        if (!mapRef.current) return // компонент закрыли пока ждали

        // Уничтожаем старую карту если была
        if (mapInstance.current) {
          mapInstance.current.destroy()
          mapInstance.current = null
        }

        const map = new window.ymaps.Map(mapRef.current, {
          center: routeData.workCoords,
          zoom: 12,
          controls: ['zoomControl'],
        })
        mapInstance.current = map

        // Обводка под линией (контраст на светлой карте)
        map.geoObjects.add(new window.ymaps.Polyline(
          routeData.polylineCoords, {},
          { strokeColor: '#1A1A1A', strokeWidth: 9, strokeOpacity: 0.2 }
        ))

        // Жёлтая линия маршрута
        map.geoObjects.add(new window.ymaps.Polyline(
          routeData.polylineCoords, {},
          { strokeColor: '#FFDD2D', strokeWidth: 6, strokeOpacity: 1 }
        ))

        // Маркер рабочей точки "А" (чёрный)
        map.geoObjects.add(new window.ymaps.Placemark(
          routeData.workCoords,
          { balloonContent: WORK_ADDRESS },
          { preset: 'islands#blackCircleDotIcon' }
        ))

        // Пронумерованные маркеры остановок
        ;(taxi.points || []).forEach((p, i) => {
          if (!p.lat || !p.lon) return
          map.geoObjects.add(new window.ymaps.Placemark(
            [p.lat, p.lon],
            { iconContent: i + 1, balloonContent: p.address },
            { preset: 'islands#blackStretchyIcon' }
          ))
        })

        // Карта подстраивается под весь маршрут
        map.setBounds(map.geoObjects.getBounds(), { checkZoomRange: true, zoomMargin: 40 })

        setStatus(`~${routeData.distKm} км · ~${routeData.durationMin} мин`)
        setIsLoading(false)
      })
      .catch(err => {
        console.warn('Route error:', err)
        // Fallback: просто показываем карту с маркерами
        window.ymaps.ready(() => {
          if (!mapRef.current) return
          if (mapInstance.current) {
            mapInstance.current.destroy()
            mapInstance.current = null
          }
          const fallbackCenter = workCoordsCache || [47.2358, 39.7137]
        const map = new window.ymaps.Map(mapRef.current, {
            center: fallbackCenter,
            zoom: 12,
            controls: ['zoomControl'],
          })
          mapInstance.current = map

          ;(taxi.points || []).forEach((p, i) => {
            if (!p.lat || !p.lon) return
            map.geoObjects.add(
              new window.ymaps.Placemark(
                [p.lat, p.lon],
                { iconContent: i + 1, balloonContent: p.address },
                { preset: 'islands#yellowStretchyIcon' }
              )
            )
          })
          map.setBounds(map.geoObjects.getBounds(), { checkZoomRange: true, zoomMargin: 40 })
          setStatus('Показаны точки (маршрут недоступен)')
          setIsLoading(false)
        })
      })

    return () => {
      if (mapInstance.current) {
        mapInstance.current.destroy()
        mapInstance.current = null
      }
    }
  }, [taxi])

  if (!taxi) return null

  return (
    <div className="map-overlay" onClick={onClose}>
      <div className="map-sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />

        <div className="map-sheet-header">
          <div>
            <strong>Такси {taxi.id}</strong>
            <span className="map-status">{status}</span>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="map-route-list">
          <div className="route-stop">
            <span className="stop-dot work">А</span>
            <span className="route-addr">{WORK_ADDRESS}</span>
          </div>
          {taxi.addresses.map((addr, i) => (
            <div key={i} className="route-stop">
              <span className="stop-dot">{i + 1}</span>
              <span className="route-addr">{addr}</span>
            </div>
          ))}
        </div>

        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <div ref={mapRef} className="map-container" />
          {isLoading && (
            <div className="map-loading">
              <div className="map-spinner" />
              <span>Строим маршрут...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
