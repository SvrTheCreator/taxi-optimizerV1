import express from 'express'
import cors from 'cors'
import authRouter from '../backend/src/routes/auth.js'
import shiftsRouter from '../backend/src/routes/shifts.js'
import usersRouter from '../backend/src/routes/users.js'
import addressRequestsRouter from '../backend/src/routes/addressRequests.js'
import notificationsRouter from '../backend/src/routes/notifications.js'

const app = express()
app.use(cors())
app.use(express.json())

app.use('/api/auth', authRouter)
app.use('/api/shifts', shiftsRouter)
app.use('/api/users', usersRouter)
app.use('/api/address-requests', addressRequestsRouter)
app.use('/api/notifications', notificationsRouter)
app.get('/api/health', (_req, res) => res.json({ ok: true }))

export default app
