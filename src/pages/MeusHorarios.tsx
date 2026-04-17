import { useState, useEffect } from 'react'
import { useAccount } from '../context/AccountContext'
import { useAuth } from '../context/AuthContext'
import { fetchProfessionalSchedules, saveProfessionalSchedules, type ProfessionalSchedule } from '../lib/api'
import { Clock, Save, Check } from 'lucide-react'

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

interface DayConfig {
  active: boolean
  time_start: string
  time_end: string
  slot_duration: number
}

const defaultDay = (): DayConfig => ({ active: false, time_start: '08:00', time_end: '18:00', slot_duration: 60 })

export default function MeusHorarios() {
  const { accountId } = useAccount()
  const { user } = useAuth()
  const [days, setDays] = useState<DayConfig[]>(Array.from({ length: 7 }, defaultDay))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!accountId || !user) return
    setLoading(true)
    fetchProfessionalSchedules(user.id, accountId)
      .then(schedules => {
        const newDays = Array.from({ length: 7 }, defaultDay)
        for (const s of schedules) {
          newDays[s.day_of_week] = {
            active: true,
            time_start: s.time_start,
            time_end: s.time_end,
            slot_duration: s.slot_duration || 60,
          }
        }
        setDays(newDays)
      })
      .finally(() => setLoading(false))
  }, [accountId, user])

  const updateDay = (i: number, field: keyof DayConfig, value: any) => {
    setDays(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: value } : d))
    setSaved(false)
  }

  const handleSave = async () => {
    if (!accountId || !user) return
    setSaving(true)
    const schedules = days
      .map((d, i) => d.active ? { day_of_week: i, time_start: d.time_start, time_end: d.time_end, slot_duration: d.slot_duration } : null)
      .filter(Boolean) as Partial<ProfessionalSchedule>[]
    await saveProfessionalSchedules(user.id, accountId, schedules)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) return <div className="loading-container"><div className="spinner" /></div>

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Clock size={20} color="#5CB8B2" />
          <h1>Meus Horários</h1>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saved ? <><Check size={14} /> Salvo</> : <><Save size={14} /> {saving ? 'Salvando...' : 'Salvar'}</>}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ fontSize: 13, color: '#718096', marginBottom: 8 }}>
          <strong>Duração padrão de cada sessão:</strong> Configure abaixo por dia. Os horários vagos serão calculados automaticamente.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {days.map((d, i) => (
          <div key={i} className="card" style={{ padding: 16, opacity: d.active ? 1 : 0.5, transition: '0.2s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              {/* Toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minWidth: 120 }}>
                <input
                  type="checkbox"
                  checked={d.active}
                  onChange={e => updateDay(i, 'active', e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: '#5CB8B2' }}
                />
                <span style={{ fontSize: 14, fontWeight: 600, color: d.active ? '#2D3748' : '#A0AEC0' }}>
                  {DAYS[i]}
                </span>
              </label>

              {d.active && (
                <>
                  {/* Time range */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: '#718096' }}>Das</span>
                    <input
                      type="time"
                      className="input"
                      value={d.time_start}
                      onChange={e => updateDay(i, 'time_start', e.target.value)}
                      style={{ width: 110 }}
                    />
                    <span style={{ fontSize: 12, color: '#718096' }}>às</span>
                    <input
                      type="time"
                      className="input"
                      value={d.time_end}
                      onChange={e => updateDay(i, 'time_end', e.target.value)}
                      style={{ width: 110 }}
                    />
                  </div>

                  {/* Slot duration */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: '#718096' }}>Sessão:</span>
                    <select
                      className="select"
                      value={d.slot_duration}
                      onChange={e => updateDay(i, 'slot_duration', parseInt(e.target.value))}
                      style={{ width: 100 }}
                    >
                      <option value={30}>30 min</option>
                      <option value={45}>45 min</option>
                      <option value={60}>1 hora</option>
                      <option value={90}>1h30</option>
                      <option value={120}>2 horas</option>
                    </select>
                  </div>

                  {/* Preview */}
                  <div style={{ fontSize: 11, color: '#A0AEC0', marginLeft: 'auto' }}>
                    {(() => {
                      const [sh, sm] = d.time_start.split(':').map(Number)
                      const [eh, em] = d.time_end.split(':').map(Number)
                      const total = (eh * 60 + em) - (sh * 60 + sm)
                      const slots = Math.floor(total / d.slot_duration)
                      return `${slots} sessões disponíveis`
                    })()}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16, padding: 16 }}>
        <div style={{ fontSize: 13, color: '#718096' }}>
          <strong>Resumo semanal:</strong>{' '}
          {days.filter(d => d.active).length} dias ativos —{' '}
          {days.filter(d => d.active).map((d, i) => DAYS_SHORT[days.indexOf(d)]).join(', ') || 'nenhum'} —{' '}
          {days.filter(d => d.active).reduce((sum, d) => {
            const [sh, sm] = d.time_start.split(':').map(Number)
            const [eh, em] = d.time_end.split(':').map(Number)
            return sum + Math.floor(((eh * 60 + em) - (sh * 60 + sm)) / d.slot_duration)
          }, 0)} sessões/semana
        </div>
      </div>
    </div>
  )
}
