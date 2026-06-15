// Дедлайн приёма заявок: всё (адреса + запись на смены) принимается строго до 18:00 МСК.
// Москва — UTC+3 без переходов на летнее время, поэтому считаем час от UTC надёжно
// независимо от таймзоны сервера (Vercel работает в UTC).

export const DEADLINE_HOUR_MSK = 18

export function mskHour() {
  return (new Date().getUTCHours() + 3) % 24
}

// true — приём уже закрыт (текущее МСК-время 18:00 или позже)
export function isAfterDeadline() {
  return mskHour() >= DEADLINE_HOUR_MSK
}

export const DEADLINE_MESSAGE =
  'Приём закрыт после 18:00 МСК. Внести адрес и записаться можно завтра до 18:00.'
