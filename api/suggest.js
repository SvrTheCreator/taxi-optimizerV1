const ROSTOV_BBOX = '38.5,46.5~41.5,47.8'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const q = req.query.q?.trim()
  if (!q || q.length < 2) return res.json([])

  try {
    const query = `${q}, Ростов-на-Дону`
    const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${process.env.YANDEX_API_KEY}&geocode=${encodeURIComponent(query)}&format=json&results=6&bbox=${ROSTOV_BBOX}&rspn=1`

    const response = await fetch(url)
    const data = await response.json()

    const members = data?.response?.GeoObjectCollection?.featureMember || []

    const suggestions = members
      .map(m => {
        const geo = m.GeoObject
        const meta = geo.metaDataProperty.GeocoderMetaData
        const kind = meta.kind
        if (!['house', 'street', 'locality'].includes(kind)) return null

        const [lon, lat] = geo.Point.pos.split(' ').map(Number)

        const components = meta.Address?.Components || []
        const street = components.find(c => c.kind === 'street')?.name || ''
        const house = components.find(c => c.kind === 'house')?.name || ''

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
}
