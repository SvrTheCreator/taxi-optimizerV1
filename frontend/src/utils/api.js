// Все функции для общения с бэкендом
// BASE_URL пустой — запросы идут на тот же хост (proxy в vite.config.js перенаправляет на бэкенд)

const BASE = '/api'

// Геокодировать адрес → получить координаты
export async function geocodeAddress(address) {
  const res = await fetch(`${BASE}/geocode?address=${encodeURIComponent(address)}`)
  if (!res.ok) throw new Error(`Не удалось найти адрес: ${address}`)
  return res.json() // { lat, lon, fromCache }
}

// Получить подсказки адресов из истории
export async function getAddressSuggestions(query) {
  const res = await fetch(`${BASE}/addresses?q=${encodeURIComponent(query)}`)
  if (!res.ok) return []
  return res.json() // [{ raw, lat, lon, use_count }]
}

// Получить подсказки адресов из Яндекса (все адреса города, как в Яндекс.Такси)
export async function getYandexSuggestions(query) {
  const res = await fetch(`${BASE}/suggest?q=${encodeURIComponent(query)}`)
  if (!res.ok) return []
  return res.json() // [{ raw, fullAddress, lat, lon, kind }]
}

// Сохранить адрес в историю
export async function saveAddress(raw, lat, lon) {
  await fetch(`${BASE}/addresses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw, lat, lon }),
  })
}

// Сохранить результат сессии
export async function saveSession(data) {
  const res = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })
  return res.json() // { id }
}

// Получить список прошлых сессий
export async function getSessions() {
  const res = await fetch(`${BASE}/sessions`)
  if (!res.ok) return []
  return res.json()
}
