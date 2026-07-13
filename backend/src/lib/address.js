// Сокращение адреса ТОЛЬКО для отображения: убираем административные части
// (город Ростов-на-Дону, область, страна), оставляя улицу и дом.
// Зеркало frontend/src/utils/address.js — чтобы список в Telegram выглядел
// так же, как в приложении. Города-исключения (Батайск, Азов) сохраняются.
const DROP_PARTS = [
  'россия',
  'ростовская обл',
  'ростовская область',
  'ростов-на-дону',
  'г ростов-на-дону',
  'г. ростов-на-дону',
  'город ростов-на-дону',
]

export function shortAddr(text) {
  if (!text || typeof text !== 'string') return text
  return text
    .split(',')
    .map(p => p.trim())
    .filter(p => p && !DROP_PARTS.includes(p.toLowerCase().replace(/\.$/, '')))
    .join(', ')
}
