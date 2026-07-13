// Скрипт Yandex Maps JS API грузится АСИНХРОННО (async в index.html), чтобы
// приложение (логин/смены) рендерилось даже если CDN Яндекса недоступен —
// например на мобильном LTE, где раньше блокирующий <script> вешал всю страницу.
// Из-за этого window.ymaps может появиться не сразу — поллим до таймаута,
// затем дожидаемся ymaps.ready() (полная загрузка модулей API).
export function ymapsReady(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let waited = 0
    const step = 100
    ;(function wait() {
      if (window.ymaps && typeof window.ymaps.ready === 'function') {
        return window.ymaps.ready(() => resolve(window.ymaps))
      }
      if (waited >= timeoutMs) {
        return reject(new Error('Сервис карт не загрузился'))
      }
      waited += step
      setTimeout(wait, step)
    })()
  })
}
