// Короткий звуковой сигнал через Web Audio API — без аудиофайла.
// Браузер разрешает звук только после первого взаимодействия со страницей;
// админ кликает по интерфейсу, поэтому к моменту первого события контекст уже «разбужен».

let ctx = null

export function playBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    ctx = ctx || new AudioCtx()
    if (ctx.state === 'suspended') ctx.resume()

    // Двойной «дзинь» — заметнее одиночного
    beep(ctx.currentTime, 880)
    beep(ctx.currentTime + 0.18, 1175)
  } catch {
    // звук — не критичная функция, молча игнорируем сбои
  }
}

function beep(startAt, freq) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(0.3, startAt + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.15)
  osc.start(startAt)
  osc.stop(startAt + 0.16)
}
