// Короткий звуковой сигнал через Web Audio API — без аудиофайла.
//
// iOS Safari блокирует звук, пока пользователь не «разбудит» аудио-контекст
// жестом (касанием/кликом). Поэтому при первом же взаимодействии со страницей
// мы создаём и разблокируем контекст проигрыванием пустого буфера.
//
// ВАЖНО: это работает только пока вкладка активна (приложение открыто).
// Звук на заблокированном/свёрнутом телефоне через Web Audio невозможен —
// для этого используются системные пуши (Telegram / Web Push).

let ctx = null

function getCtx() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return null
  ctx = ctx || new AudioCtx()
  return ctx
}

// Разблокировка при первом жесте пользователя
function unlock() {
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') c.resume()
  // проигрываем беззвучный буфер — этого достаточно для разблокировки на iOS
  const buf = c.createBuffer(1, 1, 22050)
  const src = c.createBufferSource()
  src.buffer = buf
  src.connect(c.destination)
  src.start(0)
  window.removeEventListener('touchend', unlock)
  window.removeEventListener('click', unlock)
}

if (typeof window !== 'undefined') {
  window.addEventListener('touchend', unlock, { once: false })
  window.addEventListener('click', unlock, { once: false })
}

export function playBeep() {
  try {
    const c = getCtx()
    if (!c) return
    if (c.state === 'suspended') c.resume()
    // если ещё не было жеста — звук на iOS не пройдёт, но на десктопе сыграет
    beep(c, c.currentTime, 880)
    beep(c, c.currentTime + 0.18, 1175)
  } catch {
    // звук — не критичная функция, молча игнорируем сбои
  }
}

function beep(c, startAt, freq) {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.connect(gain)
  gain.connect(c.destination)
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(0.3, startAt + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.15)
  osc.start(startAt)
  osc.stop(startAt + 0.16)
}
