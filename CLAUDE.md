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

**Build:** `npm run build` (root) — installs backend+frontend deps and builds `frontend/dist`.

## Production is the RU VPS (`taxioptimizer.ru`) — IMPORTANT

As of 2026-06-25 prod moved off Vercel to a **Russian VPS** so the app works on mobile without VPN (RKN throttling of foreign hosts). **Vercel now just 308-redirects everything to `taxioptimizer.ru`** (`vercel.json`), so the Vercel serverless app no longer serves traffic.

- **`backend/src/index.js`** — the **prod server** (and local dev). With `NODE_ENV=production` it mounts **all** routes (`auth`, `shifts`, `users`, `address-requests`, `notifications`, `telegram`, `geocode`, `suggest`, `addresses`, `sessions`, `/health`) **and** serves `frontend/dist` static. Runs under systemd as `taxi-optimizer`, behind Caddy (HTTPS).
- **`api/index.js`** — the old Vercel serverless entry. **Effectively retired** (Vercel redirects before it runs); kept in the repo. If you ever re-enable Vercel, mount new routes here too.

Full VPS runbook: `deploy/DEPLOY.md` (Caddy, systemd, env). Deploy flow: push to `main`, then run **`taxi-update`** on the server (`git pull` → `npm install` → rebuild frontend → restart service). See `.claude/MEMORY.md` → "VPS deploy" for host/IP, deploy-key, and the Telegram `/etc/hosts` IP-pin.

Geocoding/suggestions in the browser use the **Yandex Maps JS API client-side** primarily; `/api/geocode` is a server-side REST fallback (currently flaky — likely wrong key type; non-critical).

## Auth & roles

- Login = phone + 4-digit PIN → `POST /api/auth/login` → JWT (30d) stored in `localStorage` under `auth`. `AuthContext` provides `authFetch` (adds Bearer header, logs out on 401).
- Phone is normalized everywhere to `7XXXXXXXXXX` (11 digits). `+7…`/`8…` accepted.
- Roles: `worker` (default) and `admin`. Admins are determined at registration by `ADMIN_PHONE` (comma-separated env). `App.jsx` renders `AdminPage` vs `WorkerPage` by `user.role`.
- Middleware in `backend/src/auth.js`: `authMiddleware` (sets `req.user = { userId, phone, role }`) and `adminOnly`.
- **Two registration paths:** (1) Telegram (`register-via-tg`); (2) **admin-issued code** for workers without TG — admin generates a 6-digit code (`POST /api/users/registration-code`, table `registration_codes`), worker self-registers with name+phone+code and sets own PIN (`POST /api/auth/register-via-code`). Worker validation requires a `7XXXXXXXXXX` phone.
- **Two PIN-recovery paths:** (1) self-service via Telegram (`forgot-pin/*`); (2) **admin reset code** for no-TG workers — admin issues a per-worker code (`POST /api/users/:id/reset-pin-code`, reuses `pin_recovery_codes`), worker sets a new PIN via "Забыл PIN → Есть код от админа" (same `forgot-pin/verify`).

## Telegram bot (`backend/src/routes/telegram.js`, `backend/src/lib/telegram.js`)

The bot is the self-service hub. Flows:
- **Registration:** worker presses "Зарегистрироваться через Telegram" → opens bot with `?start=register` → shares contact → bot creates a `registration_sessions` row and DMs a deep link `…/?regToken=…` → worker sets a PIN on the web (`POST /api/auth/register-via-tg`).
- **PIN recovery:** "Забыл PIN" → `POST /api/auth/forgot-pin/request` sends a 6-digit code (hashed, 10-min TTL, table `pin_recovery_codes`) to the user's bound Telegram → `POST /api/auth/forgot-pin/verify` sets a new PIN. The request endpoint **always** returns a generic "ok" (doesn't reveal if a phone is registered).
- **Binding an existing account:** in-app "Привязать Telegram" → `POST /api/telegram/bind/start` issues a one-time token (`telegram_binding_tokens`) → deep link `t.me/<bot>?start=<token>`. Also: if someone shares a contact whose phone already has an account with no TG, the bot binds it automatically.
- **Webhook:** `POST /api/telegram/webhook`, protected by header `X-Telegram-Bot-Api-Secret-Token` == `TELEGRAM_WEBHOOK_SECRET`.

**Admin alerts (`backend/src/lib/notifyAdmin.js`):** worker actions DM the admin via the bot so a locked iPhone still gets a native push (in-app Web Audio beep only works while the app is foreground). Triggers: address-change request, shift-transfer request, temp-address set, **worker cancelling their own ride** (DELETE), and an admin changing their own address (`PATCH /me/address`, excludes self via `excludeUserId`). Recipients are admins with a bound TG, optionally narrowed by env `ALERT_ADMIN_PHONES` (comma-separated digits; unset = all admins). Calls are `await`ed before `res.json` (Vercel freezes after the response) and never throw.

## Business rules (current)

- **18:00 MSK deadline** (`backend/src/lib/deadline.js`, mirrored in `frontend/src/utils/deadline.js`): MSK = UTC+3, computed from `getUTCHours()` (server-TZ-independent). **Admins are exempt.** For workers, after 18:00:
  - **Blocked:** new shift sign-up, *changing* home address, temp address (set + the use_temp toggle).
  - **Allowed always:** the **first-ever** home address entry (onboarding — `autoApprove` path), **shift-transfer requests** (already-signed-up worker taps a different time → goes to admin for approval), and **ride cancellation** (DELETE).
  - Enforced on the backend (source of truth, per-branch in `shifts.js`/`addressRequests.js`); the frontend shows a banner, disables new-signup buttons, but keeps transfer/cancel/first-address controls live.
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
- **registration_sessions, telegram_binding_tokens, pin_recovery_codes** — Telegram flows (token, TTL, `used_at`). `pin_recovery_codes` is **also** used by the admin PIN-reset code flow.
- **registration_codes** — admin-issued 6-digit codes for no-TG registration (`code, created_by, used_by, expires_at, used_at`). Migration `backend/migrations/002_registration_codes.sql`.
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

- **Address autocomplete:** `AddressInput` calls `ymaps.suggest()` (Yandex Maps JS API, client-side) directly, bounded to the Rostov bbox.
- **Geocoding:** `geocodeAddress` in `frontend/src/utils/api.js` tries **client `ymaps.geocode()` first** (precise, with a 10s timeout so the spinner can't hang), then falls back to server `/api/geocode` (Yandex REST, `backend/src/routes/geocode.js`). The server fallback is currently flaky (likely the JS key isn't a valid REST-geocoder key) — non-critical since the client path works.
- Yandex Maps **JS API** key is hardcoded in `frontend/index.html` (browser-visible by design) and has **no referer restriction** (works on any domain).

## Deployment

- **Prod: RU VPS `taxioptimizer.ru`** (reg.ru, IP `194.67.103.173`, Ubuntu). `backend/src/index.js` under systemd (`taxi-optimizer`) serves API + `frontend/dist`; Caddy in front for HTTPS (Let's Encrypt). Runbook: `deploy/DEPLOY.md`.
- **Deploy:** push to `main` → run **`taxi-update`** on the server (git pull + npm install + rebuild frontend + restart). The server is a git checkout (read-only deploy key). NOT auto-deploy.
- **Vercel** (`taxi-optimizer-v1.vercel.app`): now **308-redirects to `taxioptimizer.ru`** (`vercel.json`) — no longer serves the app. Kept as the redirect + historical fallback. **Stable** branch (`taxi-optimizer-v1-stable.vercel.app`) holds old v1.
- **Telegram is IP-blocked from this VPS** → pinned working IP in `/etc/hosts` (`149.154.167.220 api.telegram.org`). If the bot goes silent, re-pin.
- Supabase free tier **pauses on inactivity** → all DB calls fail (a past outage cause; symptom: silent failures). Restore in the Supabase dashboard.
- Repo: `github.com/SvrTheCreator/taxi-optimizerV1`.

## Environment variables

Live in **`backend/.env` on the VPS** (loaded by dotenv; systemd cwd = `backend/`). Template: `backend/.env.example`.
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `JWT_SECRET` (keep identical to the old Vercel value so existing 30-day sessions stay valid), `ADMIN_PHONE` (comma-sep), `YANDEX_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (= `taxi_optimizer_helper_bot`), `TELEGRAM_WEBHOOK_SECRET`, `ALERT_ADMIN_PHONES` (optional — restricts admin alert recipients), `PUBLIC_URL=https://taxioptimizer.ru`.
**Frontend build:** `VITE_TELEGRAM_BOT_USERNAME=taxi_optimizer_helper_bot` (baked into `taxi-update`).

## Gotchas & dead code

- Prod server is `backend/src/index.js` (VPS). `api/index.js` (Vercel) is retired by the redirect — only matters if Vercel is re-enabled.
- `notifyAdmins` must be `await`ed before the response (was for Vercel serverless freeze; harmless on VPS).
- `InputPage.jsx` is legacy v1 (not routed in `App.jsx`); `database.js` JSON + `geocode/suggest/addresses/sessions` routes are legacy (the live frontend uses client-side ymaps).
- The `ГАЙД.md` / `ГАЙД-для-чата.txt` files are user-facing worker guides (Russian); kept in the working dir but **not** committed to git.
