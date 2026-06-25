// Все функции для общения с бэкендом
// BASE_URL пустой — запросы идут на тот же хост (proxy в vite.config.js перенаправляет на бэкенд)

const BASE = '/api'

// Геокодирование адреса с ГАРАНТИРОВАННЫМ таймаутом — спиннер «Сохраняем…»
// никогда не должен висеть вечно (раньше клиентский ymaps мог зависнуть без ответа).
// Порядок: серверный Яндекс REST (не зависит от браузера пользователя) → фолбэк на ymaps.
const GEOCODE_TIMEOUT = 10000

export async function geocodeAddress(address) {
  // 1) Серверный геокодер /api/geocode — основной путь, работает и в проде
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), GEOCODE_TIMEOUT)
    const res = await fetch(`${BASE}/geocode?address=${encodeURIComponent(address)}`, { signal: ctrl.signal })
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json()
      if (data && data.lat != null && data.lon != null) return data
    }
  } catch {
    // сеть/таймаут/нет роута — пробуем клиентские карты ниже
  }

  // 2) Фолбэк: клиентский ymaps.geocode() — тоже под таймаутом
  return geocodeViaYmaps(address)
}

function geocodeViaYmaps(address) {
  return new Promise((resolve, reject) => {
    if (!window.ymaps) return reject(new Error('Не удалось определить адрес. Попробуйте ещё раз.'))
    const hasCity = /ростов|батайск|азов|новочеркасск/i.test(address)
    const fullAddress = hasCity ? address : `${address}, Ростов-на-Дону`

    // Страховка: если ymaps.ready()/geocode() не ответит — промис всё равно завершится
    let done = false
    const settle = (fn) => (arg) => {
      if (done) return
      done = true
      clearTimeout(timer)
      fn(arg)
    }
    const ok = settle(resolve)
    const fail = settle(reject)
    const timer = setTimeout(() => fail(new Error('Сервис карт не отвечает. Попробуйте ещё раз.')), GEOCODE_TIMEOUT)

    window.ymaps.ready(() => {
      window.ymaps.geocode(fullAddress, {
        boundedBy: [[46.5, 38.5], [47.8, 41.5]],
        results: 1,
      }).then(res => {
        const obj = res.geoObjects.get(0)
        if (!obj) return fail(new Error(`Адрес не найден: ${address}`))
        const [lat, lon] = obj.geometry.getCoordinates()
        ok({ lat, lon, fromCache: false })
      }).catch(() => fail(new Error(`Адрес не найден: ${address}`)))
    })
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
