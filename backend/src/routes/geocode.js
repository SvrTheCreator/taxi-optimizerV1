import { Router } from 'express'

const router = Router()

const YANDEX_KEY = process.env.YANDEX_API_KEY

// Границы Ростовской области — Яндекс ищет только здесь
// bbox = "lon_min,lat_min~lon_max,lat_max"
const ROSTOV_BBOX = '38.5,46.5~41.5,47.8'

// precision === 'other' означает, что Яндекс не нашёл дом/улицу и отдал
// центроид города (бесполезно для маршрутов) — такой результат отбраковываем.
const COARSE_PRECISION = 'other'

// GET /api/geocode?address=Стачки 188/3
// Серверное геокодирование через Яндекс REST — ФОЛБЭК для случаев, когда у
// пользователя не грузятся клиентские JS-карты. Без обращения к БД, с таймаутом.
router.get('/', async (req, res) => {
  const address = req.query.address
  if (!address) return res.status(400).json({ error: 'address is required' })
  if (!YANDEX_KEY) return res.status(503).json({ error: 'geocoder not configured' })

  try {
    // Добавляем город если его нет — без этого Яндекс ищет по всей России
    const hasCity = /ростов|батайск|азов|новочеркасск/i.test(address)
    const fullAddress = hasCity ? address : `${address}, Ростов-на-Дону`

    // rspn=1 — жёстко ограничиваем поиск рамкой bbox (Ростовская область)
    const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_KEY}&geocode=${encodeURIComponent(fullAddress)}&format=json&results=1&rspn=1&bbox=${ROSTOV_BBOX}`

    // Жёсткий таймаут — чтобы serverless-функция не висела на медленном Яндексе
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const data = await response.json().catch(() => null)

    // ВРЕМЕННАЯ ДИАГНОСТИКА: ?debug=1 вернёт сырой ответ Яндекса (ключ скрыт)
    if (req.query.debug) {
      return res.json({
        httpStatus: response.status,
        requestedAddress: fullAddress,
        url: url.replace(YANDEX_KEY, 'KEY'),
        yandex: data,
      })
    }

    if (!response.ok) return res.status(502).json({ error: 'geocoder upstream error' })

    const geoObject = data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject
    const point = geoObject?.Point?.pos
    if (!point) return res.status(404).json({ error: 'address not found' })

    // Точность: 'exact'|'number'|'near'|'range'|'street'|'other'.
    // 'other' = Яндекс распознал только город → координаты бесполезны, отбраковываем.
    const precision = geoObject?.metaDataProperty?.GeocoderMetaData?.precision
    if (precision === COARSE_PRECISION) {
      return res.status(404).json({ error: 'address not found' })
    }

    const [lon, lat] = point.split(' ').map(Number)
    res.json({ lat, lon, precision, fromCache: false })
  } catch (err) {
    // таймаут/сеть — фронт сам уйдёт в клиентский ymaps-фолбэк
    res.status(504).json({ error: 'geocoding timeout' })
  }
})

export default router
