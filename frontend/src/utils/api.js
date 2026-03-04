// Все функции для общения с бэкендом
// BASE_URL пустой — запросы идут на тот же хост (proxy в vite.config.js перенаправляет на бэкенд)

const BASE = '/api'

// Геокодировать адрес через Яндекс.Карты JS API (клиентская сторона)
// Надёжнее REST API: работает на том же ключе что и карта, лучше понимает короткие адреса
export function geocodeAddress(address) {
  return new Promise((resolve, reject) => {
    // Сначала проверяем кэш бэкенда
    fetch(`${BASE}/geocode?address=${encodeURIComponent(address)}`)
      .then(res => res.ok ? res.json() : null)
      .then(cached => {
        if (cached) return resolve(cached)
        // Кэша нет — геокодируем через ymaps.geocode()
        if (!window.ymaps) return reject(new Error(`Карты не загружены: ${address}`))
        const hasCity = /ростов|батайск|азов|новочеркасск/i.test(address)
        const fullAddress = hasCity ? address : `${address}, Ростов-на-Дону`
        window.ymaps.ready(() => {
          window.ymaps.geocode(fullAddress, {
            boundedBy: [[46.5, 38.5], [47.8, 41.5]],
            results: 1,
          }).then(res => {
            const obj = res.geoObjects.get(0)
            if (!obj) return reject(new Error(`Не найден: ${address}`))
            const [lat, lon] = obj.geometry.getCoordinates()
            resolve({ lat, lon, fromCache: false })
          }).catch(() => reject(new Error(`Не найден: ${address}`)))
        })
      })
      .catch(() => reject(new Error(`Ошибка геокодирования: ${address}`)))
  })
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
