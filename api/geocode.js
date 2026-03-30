import { getCachedCoords, upsertAddress } from './_db.js'

const ROSTOV_BBOX = '38.5,46.5~41.5,47.8'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const address = req.query.address
  if (!address) return res.status(400).json({ error: 'address is required' })

  const cached = getCachedCoords(address)
  if (cached) return res.json({ ...cached, fromCache: true })

  try {
    const hasCity = /ростов|батайск|азов|новочеркасск/i.test(address)
    const fullAddress = hasCity ? address : `${address}, Ростов-на-Дону`

    const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${process.env.YANDEX_API_KEY}&geocode=${encodeURIComponent(fullAddress)}&format=json&results=1&bbox=${ROSTOV_BBOX}`
    const response = await fetch(url)
    const data = await response.json()

    const point = data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject?.Point?.pos
    if (!point) return res.status(404).json({ error: 'address not found' })

    const [lon, lat] = point.split(' ').map(Number)
    upsertAddress(address, lat, lon)

    res.json({ lat, lon, fromCache: false })
  } catch (err) {
    console.error('Geocode error:', err)
    res.status(500).json({ error: 'geocoding failed' })
  }
}
