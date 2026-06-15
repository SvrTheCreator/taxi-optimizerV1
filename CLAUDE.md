# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project memory

Extended notes are stored in `.claude/MEMORY.md` (gitignored, synced via private GitHub Gist `c9d7dd1ea5d0f4bcf258cd4d7d38e8aa`). Read it at the start of each session.

## What this is

A mobile-first PWA that lets shift workers in Rostov-on-Don sign up for evening shifts and lets an admin optimize shared-taxi routes for everyone on a given day. Originally a single-user client-side tool (v1); now a multi-user app with phone+PIN auth, roles, a Telegram bot, and Supabase as the source of truth.

- **Frontend:** React + Vite PWA (`frontend/`). Two roles → two main screens: `WorkerPage` and `AdminPage`.
- **Backend:** Express (`backend/`), data in **Supabase** (Postgres). Auth via JWT (jose). PINs hashed with bcryptjs.
- **Hosting:** Vercel (prod). Telegram bot `@taxi_opt_helper_bot` for self-service registration / PIN recovery / account binding.

## Commands

**Install (first time):**
```bash
cd backend && npm install
cd ../frontend && npm install
```

**Dev (two terminals):**
```bash
cd backend && npm run dev   # node --watch, port 3001 → runs backend/src/index.js
cd frontend && npm run dev  # vite, port 5173
```
Frontend proxies `/api/*` to `localhost:3001` (see `frontend/vite.config.js`), so no CORS in dev.

**Lint:** `cd frontend && npm run lint` — note: the repo currently has **pre-existing** lint errors (react-hooks purity on `Date.now()`, a couple of unused vars). Lint is **not** a clean gate; the real gate is the Vite build.

**Build (Vercel runs this):** `npm run build` (root) — installs backend+frontend deps and builds `frontend/dist`.

## Two server entrypoints (IMPORTANT)

There are **two** Express apps, and they mount different routes:

- **`backend/src/index.js`** — local dev only. Mounts **all** routes including the legacy geocoding ones (`/api/geocode`, `/api/suggest`, `/api/addresses`, `/api/sessions`) and serves `frontend/dist` as static when `NODE_ENV=production`.
- **`api/index.js`** — the **Vercel serverless** entrypoint (`vercel.json` routes `/api/*` here). Mounts **only** the multi-user routes: `auth`, `shifts`, `users`, `address-requests`, `notifications`, `telegram`, plus `/api/health`.

Consequence: in **production**, `/api/geocode`, `/api/suggest`, `/api/addresses`, `/api/sessions` **do not exist**. The frontend degrades gracefully — geocoding and suggestions fall back to the **Yandex Maps JS API client-side** (see below). If you add a new route, mount it in **both** files (or it won't exist in prod).

## Auth & roles

- Login = phone + 4-digit PIN → `POST /api/auth/login` → JWT (30d) stored in `localStorage` under `auth`. `AuthContext` provides `authFetch` (adds Bearer header, logs out on 401).
- Phone is normalized everywhere to `7XXXXXXXXXX` (11 digits). `+7…`/`8…` accepted.
- Roles: `worker` (default) and `admin`. Admins are determined at registration by `ADMIN_PHONE` (comma-separated env). `App.jsx` renders `AdminPage` vs `WorkerPage` by `user.role`.
- Middleware in `backend/src/auth.js`: `authMiddleware` (sets `req.user = { userId, phone, role }`) and `adminOnly`.

## Telegram bot (`backend/src/routes/telegram.js`, `backend/src/lib/telegram.js`)

The bot is the self-service hub. Flows:
- **Registration:** worker presses "Зарегистрироваться через Telegram" → opens bot with `?start=register` → shares contact → bot creates a `registration_sessions` row and DMs a deep link `…/?regToken=…` → worker sets a PIN on the web (`POST /api/auth/register-via-tg`).
- **PIN recovery:** "Забыл PIN" → `POST /api/auth/forgot-pin/request` sends a 6-digit code (hashed, 10-min TTL, table `pin_recovery_codes`) to the user's bound Telegram → `POST /api/auth/forgot-pin/verify` sets a new PIN. The request endpoint **always** returns a generic "ok" (doesn't reveal if a phone is registered).
- **Binding an existing account:** in-app "Привязать Telegram" → `POST /api/telegram/bind/start` issues a one-time token (`telegram_binding_tokens`) → deep link `t.me/<bot>?start=<token>`. Also: if someone shares a contact whose phone already has an account with no TG, the bot binds it automatically.
- **Webhook:** `POST /api/telegram/webhook`, protected by header `X-Telegram-Bot-Api-Secret-Token` == `TELEGRAM_WEBHOOK_SECRET`.

**Admin alerts (`backend/src/lib/notifyAdmin.js`):** worker actions DM the admin via the bot so a locked iPhone still gets a native push (in-app Web Audio beep only works while the app is foreground). Triggers: address-change request, shift-transfer request, temp-address set, and an admin changing their own address (`PATCH /me/address`, excludes self). Recipients are admins with a bound TG, optionally narrowed by env `ALERT_ADMIN_PHONES` (comma-separated digits; unset = all admins). Calls are `await`ed before `res.json` (Vercel freezes after the response) and never throw.

## Business rules (current)

- **18:00 MSK deadline** (`backend/src/lib/deadline.js`, mirrored in `frontend/src/utils/deadline.js`): workers cannot submit/change addresses (home + temp) or sign up / change / request a shift transfer after 18:00 Moscow time. MSK = UTC+3, computed from `getUTCHours()` (server-TZ-independent). **Admins are exempt.** Shift **cancellation** (DELETE) stays allowed. Enforced on the backend (source of truth); the frontend shows a red banner and disables controls.
- **Same-day only:** `DateSlider` renders just **today** (prop `days`, default 1) — no week-ahead planning. For a single day it draws a centered card instead of the swiper.
- **Home address:** first entry auto-applies; changing it goes through an admin-approved `address_requests` flow. UI cooldown of ~30 days (`home_updated`) is enforced **frontend-only** (backend doesn't hard-block re-requests).
- **Temp address:** once per calendar month (`temp_used_at`), enforced backend + frontend.

## Data model (Supabase — the live schema is the source of truth)

⚠️ The SQL in `backend/supabase-schema.sql` and `backend/migrations/001_telegram_recovery.sql` is **incomplete/stale** vs the live DB (e.g. `notifications`, the `users.temp_*` columns, `shift_entries.use_temp` aren't all captured). Trust the code's column usage over those files. Backend uses the **anon key**; **RLS is disabled** on all tables.

Tables in active use (by code):
- **users** — `id, phone, name, pin_hash, role, home_address, home_lat, home_lon, home_updated, temp_address, temp_lat, temp_lon, temp_used_at, telegram_chat_id, created_at`
- **shift_entries** — `id, user_id, shift_date, shift_time, use_temp, created_at`. One row per user per day.
- **address_requests** — `id, user_id, new_address, new_lat, new_lon, status (pending|approved|rejected), admin_comment, created_at, resolved_at`
- **notifications** — `id, user_id, message, is_read, status (pending|read|approved|rejected), created_at`. Admin sees non-`Ваш%` messages; transfer requests are parsed out of `message` text.
- **registration_sessions, telegram_binding_tokens, pin_recovery_codes** — Telegram flows (token, TTL, `used_at`).
- **geocode_cache** — used only by the legacy dev geocode route.
- **invite_codes** — legacy (invite flow was dropped); only referenced defensively in `users.js` DELETE.

## Optimizer (`frontend/src/utils/optimizer.js`) — pure client-side

Runs in `AdminPage.handleOptimize` after fetching `GET /api/shifts/optimize-data?date=…`. Algorithm:
1. Group entries by shift time.
2. Cluster geographically with **k-means++** (multi-restart, best inertia), adaptive `k`, splitting over-full clusters; constraints: **2–4 passengers/taxi**, **≤5 km** cluster diameter.
3. Merge clusters with <2 passengers into the nearest taxi with free capacity.
4. Order stops within each taxi by nearest-neighbor from the work address (`WORK_COORDS` in `AdminPage`).

Result is stored in `AppContext` + `localStorage` (`taxi_result_date`); `ResultPage` renders it, and `MapView` builds the route via OSRM on a Yandex map.

## Geocoding & suggestions

- **Address autocomplete:** `AddressInput` calls `ymaps.suggest()` (Yandex Maps JS API, client-side) directly, bounded to the Rostov bbox. Works in prod without a backend route.
- **Geocoding:** `geocodeAddress` in `frontend/src/utils/api.js` tries `/api/geocode` (cache) first, then falls back to `ymaps.geocode()`. In prod the cache route 404s, so it's effectively always the client-side path.
- Yandex Maps **JS API** key is hardcoded in `frontend/index.html` (browser-visible by design). The **Geocoder REST** key (`YANDEX_API_KEY`) is only used by the dev-only backend geocode route.

## Deployment

- **Vercel**, builds from `main`. `vercel.json` builds `api/index.js` (`@vercel/node`, with `includeFiles: backend/src/**`) and `frontend/` (`@vercel/static-build`, `distDir: dist`). Pushing to `main` auto-deploys prod.
- **Prod:** `taxi-optimizer-v1.vercel.app`. **Stable fallback:** `taxi-optimizer-v1-stable.vercel.app` (git branch `stable`, holds old v1). Repo: `github.com/SvrTheCreator/taxi-optimizerV1`.
- Supabase free tier **pauses on inactivity** → all DB calls fail (a past outage cause). Restore the project in the Supabase dashboard.
- Changing a Vercel env var requires a **redeploy** to take effect (values are baked into the deployment).
- `backend/data/` (legacy JSON via `backend/src/db/database.js`) is gitignored and unused in prod.

## Environment variables

**Vercel (backend/runtime):** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `JWT_SECRET`, `ADMIN_PHONE` (comma-sep), `YANDEX_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `ALERT_ADMIN_PHONES` (optional, comma-sep digits — restricts admin alert recipients). Optional: `PUBLIC_URL` (for bot deep links; otherwise derived).
**Frontend build:** `VITE_TELEGRAM_BOT_USERNAME` (used by `RegisterPage`/`TelegramBindButton`).
**Local dev (`backend/.env`):** at minimum `YANDEX_API_KEY`; add Supabase/JWT/Telegram vars to exercise those flows locally.

## Gotchas & dead code

- New API route → mount in **both** `backend/src/index.js` and `api/index.js`.
- `notifyAdmins` must be `await`ed before the response (serverless freeze).
- `InputPage.jsx` is legacy v1 (not routed in `App.jsx`); the JSON `database.js` and the `geocode/suggest/addresses/sessions` routes are dev-only.
- The `ГАЙД.md` / `ГАЙД-для-чата.txt` files are user-facing worker guides (Russian); kept in the working dir but **not** committed to git.
