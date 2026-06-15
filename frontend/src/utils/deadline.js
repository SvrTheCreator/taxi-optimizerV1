// Дедлайн приёма заявок — 18:00 МСК (UTC+3, без перехода на летнее время).
// Считаем час от UTC, чтобы не зависеть от таймзоны устройства пользователя.

export const DEADLINE_HOUR_MSK = 18

export function mskHour() {
  return (new Date().getUTCHours() + 3) % 24
}

// true — приём уже закрыт (18:00 МСК или позже)
export function isAfterDeadline() {
  return mskHour() >= DEADLINE_HOUR_MSK
}
