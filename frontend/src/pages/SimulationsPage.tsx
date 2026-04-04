import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../lib/axios'
import { Sidebar } from '../components/Sidebar'
import { METRIC_TOOLTIPS } from '../constants/simulation-metrics'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Bot {
  id: string
  name: string
  active: boolean
  strategy?: { tier?: string }
}

interface Simulation {
  id: string
  bot_id: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  hand_count: number
  progress_hands: number
  opponent_profile: 'AGGRESSIVE_SHARKS' | 'TIGHT_PASSIVE' | 'CURRENT_META'
  created_at: string
  completed_at: string | null
  progress?: number
  config_snapshot?: { botName?: string }
}

interface SimulationResult {
  total_profit: number
  bb_per_100: number
  win_rate: number
  vpip: number
  pfr: number
  aggression_factor: number
  heatmap_data: Record<string, { wins: number; losses: number; hands: number }>
  equity_realization: number
}

type OpponentProfile = 'AGGRESSIVE_SHARKS' | 'TIGHT_PASSIVE' | 'CURRENT_META'

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#0a0a1a',
  card: '#13132a',
  cardHover: '#161630',
  border: '#1e1e3f',
  accent: '#00e5ff',
  accentDim: 'rgba(0,229,255,0.08)',
  text: '#ffffff',
  muted: '#9ca3af',
  danger: '#e24b4a',
  success: '#1d9e75',
  warning: '#f59e0b',
  font: "'Trebuchet MS', sans-serif",
}

// ─── Profile descriptions ─────────────────────────────────────────────────────

const PROFILE_INFO: Record<OpponentProfile, { label: string; desc: string; color: string }> = {
  AGGRESSIVE_SHARKS: {
    label: 'Aggressive Sharks',
    desc: 'High-frequency raisers, wide ranges, lots of 3-bets and bluffs',
    color: '#e24b4a',
  },
  TIGHT_PASSIVE: {
    label: 'Tight Passive',
    desc: 'Nits and calling stations — few hands, rarely raise, easy to read',
    color: '#f59e0b',
  },
  CURRENT_META: {
    label: 'Current Meta',
    desc: 'Balanced, GTO-adjacent opponents representing standard competition',
    color: '#00e5ff',
  },
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Simulation['status'] }) {
  const colors: Record<Simulation['status'], string> = {
    PENDING: '#6b7280',
    RUNNING: '#f59e0b',
    COMPLETED: '#1d9e75',
    FAILED: '#e24b4a',
  }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      background: `${colors[status]}22`, color: colors[status],
      fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1,
    }}>
      {status}
    </span>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
      <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: C.accent, borderRadius: 2, transition: 'width 0.3s' }} />
    </div>
  )
}

// ─── Metric tooltip ───────────────────────────────────────────────────────────

function MetricTooltip({ label, tip }: { label: string; tip: string }) {
  const [show, setShow] = useState(false)
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'help' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {label}
      <span style={{
        fontSize: 9, color: C.accent, border: `1px solid ${C.accent}`, borderRadius: '50%',
        width: 13, height: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        lineHeight: 1, flexShrink: 0,
      }}>?</span>
      {show && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
          background: '#0d1a2e', border: `1px solid ${C.accent}`, borderRadius: 6,
          padding: '8px 10px', width: 210, fontSize: 11, color: '#d1d5db',
          zIndex: 999, lineHeight: 1.5, pointerEvents: 'none', whiteSpace: 'normal',
          textTransform: 'none', letterSpacing: 'normal', fontWeight: 400,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          {tip}
        </div>
      )}
    </span>
  )
}

// ─── Position heatmap grid ────────────────────────────────────────────────────

function Heatmap({ data }: { data: Record<string, { wins: number; losses: number; hands: number }> }) {
  const positions = ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO']
  const maxHands = Math.max(...Object.values(data).map(v => v.hands), 1)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 }}>
      {positions.map(pos => {
        const entry = data[pos]
        if (!entry || entry.hands === 0) return (
          <div key={pos} style={{ background: C.border, borderRadius: 8, padding: '10px 8px', textAlign: 'center', opacity: 0.4 }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{pos}</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>—</div>
          </div>
        )
        const winPct = entry.hands > 0 ? (entry.wins / entry.hands) * 100 : 0
        const intensity = Math.min(entry.hands / maxHands, 1)
        const bgColor = winPct >= 50
          ? `rgba(29,158,117,${0.1 + intensity * 0.5})`
          : `rgba(226,75,74,${0.1 + intensity * 0.4})`
        return (
          <div key={pos} style={{ background: bgColor, borderRadius: 8, padding: '10px 8px', textAlign: 'center', border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.text, fontWeight: 700 }}>{pos}</div>
            <div style={{ fontSize: 13, color: winPct >= 50 ? C.success : C.danger, fontWeight: 700, marginTop: 2 }}>{winPct.toFixed(0)}%</div>
            <div style={{ fontSize: 10, color: C.muted }}>{entry.hands}h</div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SimulationsPage() {
  // Form state
  const [bots, setBots] = useState<Bot[]>([])
  const [selectedBotId, setSelectedBotId] = useState('')
  const [handCount, setHandCount] = useState(1000)
  const [opponentProfile, setOpponentProfile] = useState<OpponentProfile>('CURRENT_META')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // Simulations list
  const [simulations, setSimulations] = useState<Simulation[]>([])
  const [loadingList, setLoadingList] = useState(true)

  // Detail view
  const [selectedSim, setSelectedSim] = useState<Simulation | null>(null)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [loadingResult, setLoadingResult] = useState(false)

  // Polling ref for running simulations
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const location = useLocation()

  useEffect(() => {
    fetchBots()
    fetchSimulations()
  }, [])

  // Poll running simulations every 3 seconds
  useEffect(() => {
    const hasRunning = simulations.some(s => s.status === 'PENDING' || s.status === 'RUNNING')
    if (hasRunning) {
      pollingRef.current = setInterval(fetchSimulations, 3000)
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [simulations])

  async function fetchBots() {
    try {
      const res = await api.get('/bots/my')
      const list = Array.isArray(res.data) ? res.data : res.data.data ?? []
      setBots(list.filter((b: Bot) => b.active))
      const urlBotId = new URLSearchParams(location.search).get('botId')
      if (urlBotId && list.some((b: Bot) => b.id === urlBotId)) {
        setSelectedBotId(urlBotId)
      } else if (list.length > 0 && !selectedBotId) {
        setSelectedBotId(list[0].id)
      }
    } catch { /* silent */ }
  }

  async function fetchSimulations() {
    try {
      const res = await api.get('/simulations')
      const list: Simulation[] = res.data.simulations ?? []
      setSimulations(list)
      setLoadingList(false)
      // Refresh selected simulation detail if it was updated
      if (selectedSim) {
        const updated = list.find(s => s.id === selectedSim.id)
        if (updated) setSelectedSim(updated)
      }
    } catch {
      setLoadingList(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!selectedBotId) { setFormError('Please select a bot'); return }
    setSubmitting(true)
    try {
      await api.post('/simulations', { botId: selectedBotId, handCount, opponentProfile })
      await fetchSimulations()
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Failed to start simulation'
      setFormError(Array.isArray(msg) ? msg.join(', ') : msg)
    } finally {
      setSubmitting(false)
    }
  }

  async function loadResult(sim: Simulation) {
    setSelectedSim(sim)
    setResult(null)
    if (sim.status !== 'COMPLETED') return
    setLoadingResult(true)
    try {
      const res = await api.get(`/simulations/${sim.id}/result`)
      setResult(res.data)
    } catch { /* silent */ }
    finally { setLoadingResult(false) }
  }

  const formatBbPer100 = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`
  const formatPct = (v: number) => `${(v * 100).toFixed(1)}%`
  const formatAF = (v: number) => v >= 9000 ? '∞' : v.toFixed(2)
  const formatDate = (raw: string | null | undefined): string => {
    if (!raw) return '—'
    const d = new Date(raw)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  const formatDateShort = (raw: string | null | undefined): string => {
    if (!raw) return '—'
    const d = new Date(raw)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: C.font }}>
      <Sidebar />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 28px', borderBottom: `1px solid ${C.border}`, background: '#0d0d22' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>Simulations</div>
          <div style={{ marginLeft: 12, fontSize: 13, color: C.muted }}>
            Test your bot against opponent profiles in an isolated sandbox
          </div>
        </div>

        <main style={{ flex: 1, overflowY: 'auto', padding: '28px', display: 'flex', gap: 24, alignItems: 'flex-start' }}>

          {/* Left column: Form + List */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* New simulation form */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 18 }}>New Simulation</div>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Bot selector */}
                <div>
                  <label style={{ fontSize: 12, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Bot</label>
                  <select
                    value={selectedBotId}
                    onChange={e => setSelectedBotId(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', background: '#0d0d22', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 14, fontFamily: C.font, outline: 'none' }}
                  >
                    {bots.length === 0 && <option value="">No active bots found</option>}
                    {bots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>

                {/* Hand count */}
                <div>
                  <label style={{ fontSize: 12, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>
                    Hand Count <span style={{ color: C.muted, fontWeight: 400 }}>(1,000 – 10,000)</span>
                  </label>
                  <input
                    type="number"
                    min={1000}
                    max={10000}
                    step={500}
                    value={handCount}
                    onChange={e => setHandCount(Number(e.target.value))}
                    style={{ width: '100%', padding: '9px 12px', background: '#0d0d22', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 14, fontFamily: C.font, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Opponent profile */}
                <div>
                  <label style={{ fontSize: 12, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>Opponent Profile</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(Object.keys(PROFILE_INFO) as OpponentProfile[]).map(profile => {
                      const info = PROFILE_INFO[profile]
                      const selected = opponentProfile === profile
                      return (
                        <button
                          key={profile}
                          type="button"
                          onClick={() => setOpponentProfile(profile)}
                          style={{
                            padding: '10px 14px', borderRadius: 8, textAlign: 'left', cursor: 'pointer', fontFamily: C.font,
                            background: selected ? `${info.color}15` : '#0d0d22',
                            border: `1px solid ${selected ? info.color : C.border}`,
                            transition: 'all 0.15s',
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 600, color: selected ? info.color : C.text }}>{info.label}</div>
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{info.desc}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {formError && (
                  <div style={{ padding: '10px 14px', background: 'rgba(226,75,74,0.1)', border: `1px solid ${C.danger}`, borderRadius: 8, color: C.danger, fontSize: 13 }}>
                    {formError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || bots.length === 0}
                  style={{
                    padding: '10px 20px', background: submitting ? C.border : C.accent, border: 'none', borderRadius: 8,
                    color: submitting ? C.muted : '#000', fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
                    fontFamily: C.font, transition: 'background 0.15s',
                  }}
                >
                  {submitting ? 'Starting...' : 'Run Simulation'}
                </button>
              </form>
            </div>

            {/* Simulations list */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 18 }}>Past Simulations</div>
              {loadingList ? (
                <div style={{ color: C.muted, fontSize: 13 }}>Loading...</div>
              ) : simulations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 20px' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🎮</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>No simulations yet</div>
                  <div style={{ fontSize: 13, color: C.muted }}>Start your first simulation using the form above</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {simulations.map(sim => {
                    const profile = PROFILE_INFO[sim.opponent_profile]
                    const isSelected = selectedSim?.id === sim.id
                    const progress = sim.hand_count > 0 ? Math.round((sim.progress_hands / sim.hand_count) * 100) : 0
                    return (
                      <button
                        key={sim.id}
                        onClick={() => loadResult(sim)}
                        style={{
                          width: '100%', padding: '12px 14px', background: isSelected ? C.accentDim : '#0d0d22',
                          border: `1px solid ${isSelected ? C.accent : C.border}`, borderRadius: 8, cursor: 'pointer',
                          textAlign: 'left', fontFamily: C.font, transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>
                            {sim.config_snapshot?.botName ?? 'Bot'} vs {profile?.label ?? sim.opponent_profile}
                          </div>
                          <StatusBadge status={sim.status} />
                        </div>
                        <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                          <span style={{ fontSize: 11, color: C.muted }}>{sim.hand_count.toLocaleString()} hands</span>
                          <span style={{ fontSize: 11, color: C.muted }}>
                            {formatDateShort(sim.status === 'COMPLETED' ? sim.completed_at : sim.created_at)}
                          </span>
                        </div>
                        {(sim.status === 'PENDING' || sim.status === 'RUNNING') && (
                          <ProgressBar pct={progress} />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right column: Results detail */}
          {selectedSim && (
            <div style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Results</div>
                  <StatusBadge status={selectedSim.status} />
                </div>

                {(selectedSim.status === 'PENDING' || selectedSim.status === 'RUNNING') && (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <style>{`@keyframes sim-spin { to { transform: rotate(360deg) } }`}</style>
                    <div style={{
                      width: 32, height: 32, margin: '0 auto 12px',
                      border: `3px solid ${C.border}`,
                      borderTopColor: C.accent,
                      borderRadius: '50%',
                      animation: 'sim-spin 0.8s linear infinite',
                    }} />
                    <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>
                      {selectedSim.status === 'PENDING' ? 'Queued...' : `Running — ${selectedSim.progress_hands.toLocaleString()} / ${selectedSim.hand_count.toLocaleString()} hands`}
                    </div>
                    <ProgressBar pct={selectedSim.hand_count > 0 ? (selectedSim.progress_hands / selectedSim.hand_count) * 100 : 0} />
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                      Auto-updating every 3s
                    </div>
                  </div>
                )}

                {selectedSim.status === 'FAILED' && (
                  <div style={{ color: C.danger, fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
                    Simulation failed. Please try again.
                  </div>
                )}

                {selectedSim.status === 'COMPLETED' && (
                  <>
                    {loadingResult ? (
                      <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '12px 0' }}>Loading results...</div>
                    ) : result ? (
                      <>
                        {/* Key metrics */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                          {[
                            { label: 'bb/100', value: formatBbPer100(result.bb_per_100), color: result.bb_per_100 >= 0 ? '#00E5FF' : '#FF4B4B' },
                            { label: 'Win Rate', value: formatPct(result.win_rate), color: result.win_rate >= 0.3 ? C.success : C.muted },
                            { label: 'VPIP', value: formatPct(result.vpip), color: C.text },
                            { label: 'PFR', value: formatPct(result.pfr), color: C.text },
                            { label: 'Agg Factor', value: formatAF(result.aggression_factor), color: C.text },
                            { label: 'Total Profit', value: result.total_profit >= 0 ? `+${result.total_profit}` : `${result.total_profit}`, color: result.total_profit >= 0 ? '#00E5FF' : '#FF4B4B' },
                          ].map(({ label, value, color }) => (
                            <div key={label} style={{ background: '#0d0d22', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px' }}>
                              <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
                                <MetricTooltip label={label} tip={METRIC_TOOLTIPS[label] ?? ''} />
                              </div>
                              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color }}>
                                {value}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Position heatmap */}
                        <div>
                          <div style={{ fontSize: 12, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                            Win Rate by Position
                          </div>
                          <Heatmap data={result.heatmap_data} />
                        </div>
                      </>
                    ) : (
                      <div style={{ color: C.muted, fontSize: 13, textAlign: 'center' }}>No results found</div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
