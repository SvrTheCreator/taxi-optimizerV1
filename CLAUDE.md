# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project memory

Extended notes are stored in `.claude/MEMORY.md` (gitignored, synced via private GitHub Gist `c9d7dd1ea5d0f4bcf258cd4d7d38e8aa`). Read it at the start of each session.

## Commands

**Install dependencies (first time):**
```bash
cd backend && npm install
cd ../frontend && npm install
```

**Dev (run in two separate terminals):**
```bash
cd backend && npm run dev   # node --watch, port 3001
cd frontend && npm run dev  # vite, port 5173
```

The frontend proxies `/api/*` to `localhost:3001`, so no CORS issues in dev.

**Lint:**
```bash
cd frontend && npm run lint
```

**Production build (Railway runs this automatically):**
```bash
npm run build   # installs deps + builds frontend/dist
npm start       # serves built frontend as static + API
```

## Architecture

This is a PWA that optimizes shared taxi routes for shift workers in Rostov-on-Don.

**Request flow:**
1. User types address → `AddressInput` calls `ymaps.suggest()` (Yandex Maps JS API directly) + `/api/addresses` (local history)
2. User clicks "Оптимизировать" → `InputPage` geocodes all entries: checks `/api/geocode` cache first, then falls back to `ymaps.geocode()` client-side → runs `optimize()` client-side; result saved to `localStorage`
3. Results shown in `ResultPage` → user taps a taxi → `MapView` builds route via OSRM, displays on Yandex Map

**Optimizer (`frontend/src/utils/optimizer.js`):**
- Groups entries by shift time
- Clusters by geography using k-means++ (min 2, max 4 passengers per taxi, max 5 km cluster diameter)
- Post-processes clusters: merges any taxi with < 2 passengers into nearest taxi with available capacity
- Orders stops within each taxi using nearest-neighbor from the work address
- Pure client-side, no API calls

**Storage (`backend/src/db/database.js`):**
- JSON files in `backend/data/` — not SQLite, despite the folder name
- `addresses.json`: geocoding cache + usage history (`use_count` for sorting suggestions)
- `sessions.json`: past optimization results (last 10)
- `backend/data/` is gitignored and resets on Railway redeploy — that's intentional

**Geocoding (`backend/src/routes/geocode.js`):**
- Appends `, Ростов-на-Дону` if no city keyword in address
- Uses bbox as a soft hint (no `rspn=1` — that breaks results for addresses on bbox edges)
- Caches results in `addresses.json`

**Environment:**
- `backend/.env` needs `YANDEX_API_KEY` (Geocoder API key)
- Yandex Maps JS API key is hardcoded in `frontend/index.html` (not secret, browser-visible by design)

**Deployment:** Railway — `npm run build` builds frontend into `frontend/dist`, Express serves it as static in production.
