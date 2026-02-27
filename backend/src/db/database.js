// Простая JSON-база данных
// Читаем/пишем JSON файлы через встроенный модуль Node.js fs/promises
// Никаких зависимостей, никакой компиляции — просто файлы

import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '../../data')

// Создаём папку data если её нет
if (!existsSync(DATA_DIR)) {
  await mkdir(DATA_DIR, { recursive: true })
}

// Начальные данные для новых файлов
const DEFAULTS = {
  'addresses.json': { addresses: [] },
  'sessions.json': { sessions: [] },
}

// Читаем JSON файл (если нет — возвращаем дефолт)
async function readJSON(filename) {
  const path = join(DATA_DIR, filename)
  try {
    const content = await readFile(path, 'utf-8')
    return JSON.parse(content)
  } catch {
    return DEFAULTS[filename]
  }
}

// Пишем JSON файл
async function writeJSON(filename, data) {
  const path = join(DATA_DIR, filename)
  await writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}

// === API для работы с адресами ===

export async function findAddresses(query = '') {
  const { addresses } = await readJSON('addresses.json')
  const q = query.toLowerCase()
  return addresses
    .filter(a => a.raw.toLowerCase().includes(q))
    .sort((a, b) => b.use_count - a.use_count)
    .slice(0, 10)
}

export async function upsertAddress(raw, lat = null, lon = null) {
  const db = await readJSON('addresses.json')
  const existing = db.addresses.find(a => a.raw === raw)

  if (existing) {
    existing.use_count += 1
    if (lat) existing.lat = lat
    if (lon) existing.lon = lon
  } else {
    db.addresses.push({ raw, lat, lon, use_count: 1 })
  }

  await writeJSON('addresses.json', db)
}

export async function getCachedCoords(raw) {
  const { addresses } = await readJSON('addresses.json')
  const found = addresses.find(a => a.raw === raw)
  return found?.lat && found?.lon ? { lat: found.lat, lon: found.lon } : null
}

// === API для работы с сессиями ===

export async function getSessions() {
  const { sessions } = await readJSON('sessions.json')
  return sessions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10)
}

export async function saveSession(data) {
  const db = await readJSON('sessions.json')
  const id = Date.now()
  db.sessions.push({ id, data, created_at: new Date().toISOString() })
  await writeJSON('sessions.json', db)
  return id
}
