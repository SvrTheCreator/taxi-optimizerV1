// Дедлайн приёма заявок — 18:00 МСК (UTC+3, без перехода на летнее время).
// Считаем час от UTC, чтобы не зависеть от таймзоны устройства пользователя.

export const DEADLINE_HOUR_MSK = 18

export function mskHour() {
  return (new Date().getUTCHours() + 3) % 24
}

// Календарная дата в МСК (UTC+3), 'YYYY-MM-DD'. Не зависит от таймзоны устройства,
// как и дедлайн. Раньше дата бралась из UTC → ночью после 00:00 МСК запись уходила
// на вчера (экран показывал сегодня, а в базу шло вчерашнее число).
export function mskDateStr() {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().split('T')[0]
}

// true — приём уже закрыт (18:00 МСК или позже)
export function isAfterDeadline() {
  return mskHour() >= DEADLINE_HOUR_MSK
}
