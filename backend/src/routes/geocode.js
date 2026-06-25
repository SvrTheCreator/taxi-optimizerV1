import { Router } from 'express'

const router = Router()

const YANDEX_KEY = process.env.YANDEX_API_KEY

// Границы Ростовской области — Яндекс ищет только здесь
// bbox = "lon_min,lat_min~lon_max,lat_max"
const ROSTOV_BBOX = '38.5,46.5~41.5,47.8'

// GET /api/geocode?address=Стачки 188/3
// Серверное геокодирование через Яндекс REST. НЕ зависит от клиентских JS-карт,
// поэтому работает даже если у пользователя не грузится/тупит ymaps в браузере.
// Без обращения к БД — чистый прокси к Яндексу, монтируется и в dev, и в проде.
router.get('/', async (req, res) => {
  const address = req.query.address
  if (!address) return res.status(400).json({ error: 'address is required' })
  if (!YANDEX_KEY) return res.status(503).json({ error: 'geocoder not configured' })

  try {
    // Добавляем город если его нет — без этого Яндекс ищет по всей России
    const hasCity = /ростов|батайск|азов|новочеркасск/i.test(address)
    const fullAddress = hasCity ? address : `${address}, Ростов-на-Дону`

    // bbox — страховка от совпадений в других городах
    const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_KEY}&geocode=${encodeURIComponent(fullAddress)}&format=json&results=1&bbox=${ROSTOV_BBOX}`

    // Жёсткий таймаут — чтобы serverless-функция не висела на медленном Яндексе
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return res.status(502).json({ error: 'geocoder upstream error' })
    const data = await response.json()

    const point = data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject?.Point?.pos
    if (!point) return res.status(404).json({ error: 'address not found' })

    const [lon, lat] = point.split(' ').map(Number)
    res.json({ lat, lon, fromCache: false })
  } catch (err) {
    // таймаут/сеть — фронт сам уйдёт в клиентский ymaps-фолбэк
    res.status(504).json({ error: 'geocoding timeout' })
  }
})

export default router
