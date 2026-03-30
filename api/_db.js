// In-memory storage for Vercel serverless functions
// Data persists across warm invocations, resets on cold start

const addressesStore = { addresses: [] }
const sessionsStore = { sessions: [] }

export function findAddresses(query = '') {
  const q = query.toLowerCase()
  return addressesStore.addresses
    .filter(a => a.raw.toLowerCase().includes(q))
    .sort((a, b) => b.use_count - a.use_count)
    .slice(0, 10)
}

export function upsertAddress(raw, lat = null, lon = null) {
  const existing = addressesStore.addresses.find(a => a.raw === raw)
  if (existing) {
    existing.use_count += 1
    if (lat) existing.lat = lat
    if (lon) existing.lon = lon
  } else {
    addressesStore.addresses.push({ raw, lat, lon, use_count: 1 })
  }
}

export function getCachedCoords(raw) {
  const found = addressesStore.addresses.find(a => a.raw === raw)
  return found?.lat && found?.lon ? { lat: found.lat, lon: found.lon } : null
}

export function getSessions() {
  return sessionsStore.sessions
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 10)
}

export function saveSession(data) {
  const id = Date.now()
  sessionsStore.sessions.push({ id, data, created_at: new Date().toISOString() })
  return id
}
