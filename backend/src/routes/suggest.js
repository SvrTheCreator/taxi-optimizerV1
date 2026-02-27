import { Router } from 'express'

const router = Router()
const YANDEX_KEY = process.env.YANDEX_API_KEY
const ROSTOV_BBOX = '38.5,46.5~41.5,47.8'

// GET /api/suggest?q=Таганрогская
// Возвращает варианты адресов из базы Яндекса для автодополнения
router.get('/', async (req, res) => {
  const q = req.query.q?.trim()
  if (!q || q.length < 2) return res.json([])

  try {
    // Добавляем город — без этого Яндекс ищет по всей России
    const query = `${q}, Ростов-на-Дону`
    const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_KEY}&geocode=${encodeURIComponent(query)}&format=json&results=6&bbox=${ROSTOV_BBOX}&rspn=1`

    const response = await fetch(url)
    const data = await response.json()

    const members = data?.response?.GeoObjectCollection?.featureMember || []

    const suggestions = members
      .map(m => {
        const geo = m.GeoObject
        const meta = geo.metaDataProperty.GeocoderMetaData

        // Берём только адреса (не города и не страны)
        const kind = meta.kind
        if (!['house', 'street', 'locality'].includes(kind)) return null

        const [lon, lat] = geo.Point.pos.split(' ').map(Number)

        // Формируем короткий адрес: улица + номер дома (без страны и области)
        const components = meta.Address?.Components || []
        const street = components.find(c => c.kind === 'street')?.name || ''
        const house = components.find(c => c.kind === 'house')?.name || ''
        const locality = components.find(c => c.kind === 'locality')?.name || ''

        let shortAddr = ''
        if (street && house) shortAddr = `${street} ${house}`
        else if (street) shortAddr = street
        else shortAddr = meta.text

        return { raw: shortAddr, fullAddress: meta.text, lat, lon, kind }
      })
      .filter(Boolean)

    res.json(suggestions)
  } catch (err) {
    console.error('Suggest error:', err)
    res.json([])
  }
})

export default router
