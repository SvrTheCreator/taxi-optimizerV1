import { Router } from 'express'
import supabase from '../db/supabase.js'
import { authMiddleware, adminOnly } from '../auth.js'

const router = Router()
router.use(authMiddleware, adminOnly) // всё здесь — только для админа

// GET /api/manual-workers — список «кнопочных» работников (ростер)
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('manual_workers')
    .select('id, name, address, lat, lon')
    .order('name')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/manual-workers — добавить человека в список
router.post('/', async (req, res) => {
  const { name, address, lat, lon } = req.body
  if (!name || !address) return res.status(400).json({ error: 'Нужны имя и адрес' })
  const { data, error } = await supabase
    .from('manual_workers')
    .insert({ name: String(name).trim(), address: String(address).trim(), lat, lon, created_by: req.user.userId })
    .select('id, name, address, lat, lon')
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /api/manual-workers/:id — удалить из списка (каскадом снимет назначения)
router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('manual_workers').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// GET /api/manual-workers/day?date=YYYY-MM-DD — кто из списка едет в этот день
router.get('/day', async (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'Нужен date' })
  const { data, error } = await supabase
    .from('manual_shift_entries')
    .select('id, shift_time, manual_worker_id, manual_workers(name, address, lat, lon)')
    .eq('shift_date', date)
  if (error) return res.status(500).json({ error: error.message })
  const enriched = (data || []).map(e => ({
    assignId: e.id,
    workerId: e.manual_worker_id,
    time: e.shift_time,
    name: e.manual_workers?.name,
    address: e.manual_workers?.address,
    lat: e.manual_workers?.lat,
    lon: e.manual_workers?.lon,
  }))
  res.json(enriched)
})

// POST /api/manual-workers/:id/assign { date, time } — назначить на день (одно на день)
router.post('/:id/assign', async (req, res) => {
  const { date, time } = req.body
  if (!date || !time) return res.status(400).json({ error: 'Нужны date и time' })
  // одно назначение на человека в день — снимаем прежнее и ставим новое
  await supabase
    .from('manual_shift_entries')
    .delete()
    .eq('manual_worker_id', req.params.id)
    .eq('shift_date', date)
  const { data, error } = await supabase
    .from('manual_shift_entries')
    .insert({ manual_worker_id: req.params.id, shift_date: date, shift_time: time })
    .select('id')
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true, assignId: data.id })
})

// DELETE /api/manual-workers/assign/:assignId — снять с дня (из списка не удаляет)
router.delete('/assign/:assignId', async (req, res) => {
  const { error } = await supabase.from('manual_shift_entries').delete().eq('id', req.params.assignId)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

export default router
