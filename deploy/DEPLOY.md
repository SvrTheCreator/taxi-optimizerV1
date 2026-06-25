# Развёртывание на собственном VPS (Ubuntu 22.04/24.04)

Один Node-процесс (`backend/src/index.js`) при `NODE_ENV=production` поднимает все
API-роуты **и** раздаёт собранный фронт из `frontend/dist`. Перед ним — Caddy для
HTTPS. Домен: `taxioptimizer.ru`.

Все команды — из-под пользователя с `sudo`.

## 0. Открыть порты
В фаерволе/security-группе провайдера разрешить входящие **22, 80, 443**.

## 1. DNS (на reg.ru)
В управлении зоной домена указать на IP сервера и убрать старые записи Vercel:
- `A`  `@`   → `<IP_СЕРВЕРА>`
- `A`  `www` → `<IP_СЕРВЕРА>`

Проверить распространение: `dig +short taxioptimizer.ru` должен вернуть IP сервера.
HTTPS Caddy не получит, пока DNS не указывает сюда.

## 2. Node 20 + git
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
node -v   # ожидаем v20.x
```

## 3. Код
```bash
sudo mkdir -p /opt && cd /opt
sudo git clone https://github.com/SvrTheCreator/taxi-optimizerV1.git
cd taxi-optimizerV1
```
Репозиторий приватный → git спросит логин/токен. В качестве пароля вставить
**GitHub Personal Access Token** (Settings → Developer settings → Tokens,
доступ read на этот репозиторий).

## 4. Переменные окружения
```bash
sudo cp backend/.env.example backend/.env
sudo nano backend/.env     # заполнить значениями из Vercel
```
Значения брать из Vercel → Settings → Environment Variables.
**JWT_SECRET — взять тот же, что в Vercel** (иначе все сессии слетят).
`PUBLIC_URL=https://taxioptimizer.ru`.

## 5. Установка зависимостей и сборка фронта
```bash
cd /opt/taxi-optimizerV1
sudo npm install --prefix backend
sudo npm install --prefix frontend
# имя бота нужно фронту на этапе сборки:
sudo VITE_TELEGRAM_BOT_USERNAME=taxi_opt_helper_bot npm run build --prefix frontend
```
После сборки должен появиться `frontend/dist/index.html`.

## 6. Запуск как сервис (systemd)
```bash
sudo cp deploy/taxi-optimizer.service /etc/systemd/system/taxi-optimizer.service
sudo systemctl daemon-reload
sudo systemctl enable --now taxi-optimizer
sudo systemctl status taxi-optimizer      # должно быть active (running)
curl -s localhost:3001/health             # {"ok":true}
```
Логи: `journalctl -u taxi-optimizer -f`

## 7. HTTPS-прокси (Caddy)
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

sudo cp /opt/taxi-optimizerV1/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```
Caddy сам получит сертификат Let's Encrypt (DNS уже должен указывать сюда).

## 8. Проверка
- Открыть `https://taxioptimizer.ru` — должен открыться сайт, замок HTTPS.
- **Главное:** открыть с мобильного интернета (то, что не работало на Vercel).

## 9. Перенастроить Telegram-вебхук на новый домен
```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://taxioptimizer.ru/api/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```
(подставить значения из backend/.env)

## 10. Реферер ключа Яндекса
В кабинете Яндекс-разработчика добавить `taxioptimizer.ru` в разрешённые
домены для **JavaScript API** ключа (иначе карта/подсказки адресов не загрузятся).

---

## Обновление после изменений в коде
```bash
cd /opt/taxi-optimizerV1
sudo git pull
sudo npm install --prefix backend
sudo VITE_TELEGRAM_BOT_USERNAME=taxi_opt_helper_bot npm run build --prefix frontend
sudo systemctl restart taxi-optimizer
```
