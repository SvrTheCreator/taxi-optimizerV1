import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import addressesRouter from './routes/addresses.js'
import geocodeRouter from './routes/geocode.js'
import sessionsRouter from './routes/sessions.js'
import suggestRouter from './routes/suggest.js'

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
