#!/usr/bin/env bash
# Авто-деплой: если в origin/main появился новый коммит — подтягиваем и выкатываем.
# Запускается по таймеру systemd (taxi-autodeploy.timer), от root.
# Делает то же, что ручной taxi-update: git pull → npm install → сборка фронта → рестарт.
set -euo pipefail

APP_DIR=/opt/taxi-optimizerV1
cd "$APP_DIR"

git fetch origin main --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
[ "$LOCAL" = "$REMOTE" ] && exit 0   # новых коммитов нет — выходим тихо

echo "Новый коммит $REMOTE — выкатываю…"
git pull --ff-only origin main
npm install --prefix backend

# Имя бота для фронта берём из backend/.env (единый источник правды с бэком),
# чтобы не зависеть от хардкода. Фолбэк — на случай, если переменной нет.
BOT_USERNAME=$(grep -E '^TELEGRAM_BOT_USERNAME=' backend/.env 2>/dev/null | head -1 | cut -d= -f2-)
BOT_USERNAME=${BOT_USERNAME//\"/}
BOT_USERNAME=${BOT_USERNAME//\'/}
BOT_USERNAME=${BOT_USERNAME//$'\r'/}
BOT_USERNAME=${BOT_USERNAME:-taxi_optimizer_helper_bot}

VITE_TELEGRAM_BOT_USERNAME="$BOT_USERNAME" npm run build --prefix frontend
systemctl restart taxi-optimizer
echo "Деплой готов: $(git rev-parse --short HEAD)"
