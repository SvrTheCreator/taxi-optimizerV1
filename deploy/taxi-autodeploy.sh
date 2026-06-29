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
VITE_TELEGRAM_BOT_USERNAME=taxi_optimizer_helper_bot npm run build --prefix frontend
systemctl restart taxi-optimizer
echo "Деплой готов: $(git rev-parse --short HEAD)"
