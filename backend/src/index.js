import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import addressesRouter from './routes/addresses.js'
import geocodeRouter from './routes/geocode.js'
import sessionsRouter from './routes/sessions.js'
import suggestRouter from './routes/suggest.js'
import authRouter from './routes/auth.js'
import shiftsRouter from './routes/shifts.js'
import usersRouter from './routes/users.js'
import addressRequestsRouter from './routes/addressRequests.js'
import notificationsRouter from './routes/notifications.js'
import telegramRouter from './routes/telegram.js'
import { startTelegramPolling } from './lib/telegramPoll.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())                    // разрешаем запросы с фронтенда
app.use(express.json())            // парсим JSON в теле запросов

// Подключаем роуты (сначала API, потом статика — важен порядок)
app.use('/api/addresses', addressesRouter)
app.use('/api/geocode', geocodeRouter)
app.use('/api/sessions', sessionsRouter)
app.use('/api/suggest', suggestRouter)
app.use('/api/auth', authRouter)
app.use('/api/shifts', shiftsRouter)
app.use('/api/users', usersRouter)
app.use('/api/address-requests', addressRequestsRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/telegram', telegramRouter)

// Проверочный эндпоинт
app.get('/health', (_req, res) => res.json({ ok: true }))

// В продакшене раздаём собранный фронтенд из frontend/dist
// React Router сам разбирается с путями благодаря SPA fallback
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../../frontend/dist')
  app.use(express.static(distPath))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`✓ Backend запущен на http://localhost:${PORT}`)
})

// Telegram через long-polling — только в проде (на VPS), чтобы локальная
// разработка не «воровала» апдейты у боевого бота (Telegram отдаёт getUpdates
// только одному потребителю).
if (process.env.NODE_ENV === 'production') {
  startTelegramPolling()
}
