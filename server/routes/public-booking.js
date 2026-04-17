import { Router } from 'express'
import db from '../db.js'

const router = Router()

// Get clinic info by slug (public)
router.get('/:slug', (req, res) => {
  const account = db.prepare('SELECT id, name, slug FROM accounts WHERE slug = ?').get(req.params.slug)
  if (!account) return res.status(404).json({ error: 'Clinica nao encontrada' })

  const professionals = db.prepare(
    "SELECT id, name, avatar_url FROM users WHERE account_id = ? AND role = 'profissional' AND is_active = 1 ORDER BY name"
  ).all(account.id)

  res.json({ clinic: { id: account.id, name: account.name }, professionals })
})

// Get available slots for a professional on a date (public)
router.get('/:slug/slots', (req, res) => {
  const account = db.prepare('SELECT id FROM accounts WHERE slug = ?').get(req.params.slug)
  if (!account) return res.status(404).json({ error: 'Clinica nao encontrada' })

  const { professional_id, date } = req.query
  if (!professional_id || !date) return res.status(400).json({ error: 'professional_id and date required' })

  const d = new Date(date + 'T00:00:00')
  const dayOfWeek = d.getDay()

  const schedules = db.prepare(
    'SELECT * FROM professional_schedules WHERE professional_id = ? AND account_id = ? AND day_of_week = ? AND is_active = 1 ORDER BY time_start'
  ).all(parseInt(professional_id), account.id, dayOfWeek)

  if (!schedules.length) return res.json({ slots: [], message: 'Profissional nao atende neste dia' })

  const existing = db.prepare(
    "SELECT time_start, time_end FROM appointments WHERE professional_id = ? AND date = ? AND status != 'cancelled'"
  ).all(parseInt(professional_id), date)

  const slots = []
  let duration = 60
  for (const schedule of schedules) {
    const [startH, startM] = schedule.time_start.split(':').map(Number)
    const [endH, endM] = schedule.time_end.split(':').map(Number)
    duration = schedule.slot_duration || 60
    let current = startH * 60 + startM
    const end = endH * 60 + endM

    while (current + duration <= end) {
      const slotStart = `${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`
      const slotEnd = `${String(Math.floor((current + duration) / 60)).padStart(2, '0')}:${String((current + duration) % 60).padStart(2, '0')}`

      const isBooked = existing.some(e => {
        const eStart = e.time_start.slice(0, 5)
        const eEnd = e.time_end.slice(0, 5)
        return slotStart < eEnd && slotEnd > eStart
      })

      if (!isBooked) slots.push({ time_start: slotStart, time_end: slotEnd })
      current += duration
    }
  }

  res.json({ slots, duration })
})

// Book appointment (public — no auth required)
router.post('/:slug/book', (req, res) => {
  const account = db.prepare('SELECT id FROM accounts WHERE slug = ?').get(req.params.slug)
  if (!account) return res.status(404).json({ error: 'Clinica nao encontrada' })

  const { professional_id, date, time_start, time_end, name, phone, email, notes } = req.body
  if (!professional_id || !date || !time_start || !time_end || !name) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatorios' })
  }

  // Check conflict
  const conflict = db.prepare(`
    SELECT id FROM appointments WHERE professional_id = ? AND date = ? AND status != 'cancelled'
    AND time_start < ? AND time_end > ?
  `).get(professional_id, date, time_end, time_start)
  if (conflict) return res.status(409).json({ error: 'Este horario acabou de ser reservado. Tente outro.' })

  // Find or create lead
  let lead = null
  if (phone) {
    lead = db.prepare('SELECT id FROM leads WHERE account_id = ? AND phone = ?').get(account.id, phone)
  }
  if (!lead && email) {
    lead = db.prepare('SELECT id FROM leads WHERE account_id = ? AND email = ?').get(account.id, email)
  }
  if (!lead) {
    const r = db.prepare('INSERT INTO leads (account_id, name, phone, email, source) VALUES (?, ?, ?, ?, ?)').run(
      account.id, name, phone || null, email || null, 'agendamento-online'
    )
    lead = { id: r.lastInsertRowid }
  } else {
    // Update name if changed
    db.prepare("UPDATE leads SET name = ?, updated_at = datetime('now') WHERE id = ?").run(name, lead.id)
  }

  const result = db.prepare(`
    INSERT INTO appointments (account_id, lead_id, professional_id, date, time_start, time_end, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')
  `).run(account.id, lead.id, professional_id, date, time_start, time_end, notes || null)

  // Get professional name for confirmation
  const prof = db.prepare('SELECT name FROM users WHERE id = ?').get(professional_id)

  res.json({
    ok: true,
    appointment: {
      id: result.lastInsertRowid,
      date,
      time_start,
      time_end,
      professional_name: prof?.name || '',
    }
  })
})

export default router
