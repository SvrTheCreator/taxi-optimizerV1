import { Router } from 'express'
import { getCachedCoords, upsertAddress } from '../db/database.js'

const router = Router()

const YANDEX_KEY = process.env.YANDEX_API_KEY

// Границы Ростовской области — Яндекс будет искать только здесь
// bbox = "lon_min,lat_min~lon_max,lat_max"
const ROSTOV_BBOX = '38.5,46.5~41.5,47.8'

// GET /api/geocode?address=Стачки 188/3
router.get('/', async (req, res) => {
  const address = req.query.address
  if (!address) return res.status(400).json({ error: 'address is required' })

  // Сначала проверяем кэш
  const cached = await getCachedCoords(address)
  if (cached) {
    return res.json({ ...cached, fromCache: true })
  }

  try {
    // Добавляем город если его нет в адресе — без этого Яндекс ищет по всей России
    const hasCity = /ростов|батайск|азов|новочеркасск/i.test(address)
    const fullAddress = hasCity ? address : `${address}, Ростов-на-Дону`

    // bbox ограничивает поиск Ростовской областью (страховка от совпадений в других городах)
    const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_KEY}&geocode=${encodeURIComponent(fullAddress)}&format=json&results=1&bbox=${ROSTOV_BBOX}`
    const response = await fetch(url)
    const data = await response.json()

    const point = data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject?.Point?.pos
    if (!point) return res.status(404).json({ error: 'address not found' })

    const [lon, lat] = point.split(' ').map(Number)

    // Сохраняем в кэш под оригинальным адресом (без добавленного города)
    await upsertAddress(address, lat, lon)

    res.json({ lat, lon, fromCache: false })
  } catch (err) {
    console.error('Geocode error:', err)
    res.status(500).json({ error: 'geocoding failed' })
  }
})

export default router
