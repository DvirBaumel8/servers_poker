import { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { io, Socket } from 'socket.io-client'
import api from '../lib/axios'
import { useAuthStore } from '../store/authStore'
import { Sidebar } from '../components/Sidebar'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tournament {
  id: string
  name: string
  status: 'registering' | 'running' | 'final_table' | 'finished' | 'cancelled'
  buy_in: number
  starting_chips: number
  players_per_table: number
  max_players: number
  min_players: number
  entries_count: number
  scheduled_start_at?: string | null
}

interface TournamentState {
  playersRemaining: number
  totalEntrants: number
  level?: number | null
  handsThisLevel?: number | null
  handsPerLevel?: number | null
  blinds?: { small: number; big: number; ante: number }
  tables?: Array<{ tableId: string; tableNumber: number; isFinalTable: boolean }>
  prizePool?: number | null
  handForHand?: boolean
  _stale?: boolean
  topPlayers?: Array<{ botName: string; chips: number; rank: number }>
}

interface TelemetryData {
  tournamentId: string
  handsProcessed: number
  totalHands: number
  topStacks: Array<{ botName: string; chips: number; rank: number }>
}

interface FinishedSummary {
  id: string
  name: string
  buy_in: number
  finished_at: string | null
  entries_count: number
  winner_bot_name: string | null
  prize_pool: number
}

interface UserSummary {
  id: string
  name: string
  email: string
  subscription_status: string
  bot_count: string
  last_login_at: string | null
}

interface PoolMetrics {
  poolSize: number
  activeWorkers: number
  idleWorkers: number
  queuedTasks: number
  totalTasksCompleted: number
  totalTasksFailed: number
  recentAvgWaitMs?: number
  recentAvgTaskMs?: number
}

type InjectionProfile = 'random' | 'sharks' | 'fish' | 'balanced'
type UserSortKey = 'bot_count' | 'last_login_at'
type SubFilter = 'all' | 'active' | 'free' | 'cancelled' | 'expired'

interface SeedMapSeat {
  botId: string; botName: string; ownerName: string; userId: string; elo: number; busted: boolean
}
interface SeedMapTable {
  tableId: string; tableNumber: number; broken: boolean; seats: SeedMapSeat[]
}
interface SeedingMapData {
  tables: SeedMapTable[]; fairnessScore: number
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#0a0a1a', card: '#13132a', cardHover: '#161630', border: '#1e1e3f',
  accent: '#00e5ff', accentDim: 'rgba(0,229,255,0.08)', text: '#ffffff',
  muted: '#a8b3c4', danger: '#e24b4a', dangerDim: 'rgba(226,75,74,0.1)',
  success: '#1d9e75', warning: '#f59e0b', font: "'Trebuchet MS', sans-serif",
}

// ─── Small reusables ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Tournament['status'] }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    registering: { label: 'OPEN',   color: C.success, bg: 'rgba(29,158,117,0.15)' },
    running:     { label: 'LIVE',   color: C.accent,  bg: 'rgba(0,229,255,0.12)' },
    final_table: { label: 'FINALS', color: C.warning, bg: 'rgba(245,158,11,0.15)' },
    finished:    { label: 'DONE',   color: C.muted,   bg: 'rgba(168,179,196,0.1)' },
    cancelled:   { label: 'VOID',   color: C.danger,  bg: C.dangerDim },
  }
  const s = map[status] ?? map.finished
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, padding: '2px 7px',
      borderRadius: 4, color: s.color, background: s.bg, fontFamily: C.font }}>
      {s.label}
    </span>
  )
}

function SubBadge({ status }: { status: string }) {
  const color = status === 'active' ? C.accent : status === 'free' ? C.muted : C.danger
  const bg    = status === 'active' ? 'rgba(0,229,255,0.1)' : status === 'free' ? 'rgba(168,179,196,0.08)' : C.dangerDim
  return (
    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.8, padding: '2px 7px', borderRadius: 4, color, background: bg }}>
      {status.toUpperCase()}
    </span>
  )
}

function Toast({ msg, onClose }: { msg: { text: string; ok: boolean } | null; onClose: () => void }) {
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [msg, onClose])
  if (!msg) return null
  return (
    <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
      background: msg.ok ? 'rgba(29,158,117,0.95)' : 'rgba(226,75,74,0.95)',
      color: '#fff', padding: '10px 18px', borderRadius: 8, fontSize: 13,
      fontFamily: C.font, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', maxWidth: 340 }}>
      {msg.text}
    </div>
  )
}

// ─── Injection Modal ──────────────────────────────────────────────────────────

const INJECTION_PROFILES: Array<{
  id: InjectionProfile; label: string; desc: string; color: string; icon: string
}> = [
  { id: 'random',   label: 'Random Bots',    desc: 'Fill slots with any available system bots',          color: C.muted,   icon: '🎲' },
  { id: 'sharks',   label: 'Sharks',         desc: 'Aggressive players — Maniac, Shark, Bully, Tricky',  color: '#f97316', icon: '🦈' },
  { id: 'fish',     label: 'Fish',           desc: 'Passive callers — Calling Station, Nit, Rock',       color: '#60a5fa', icon: '🐟' },
  { id: 'balanced', label: 'Balanced Mix',   desc: 'Equal share of aggressive and passive bots',         color: C.success, icon: '⚖️' },
]

interface AdminEntry { entryId: string; botId: string; botName: string; ownerName: string; isSystem: boolean }

function InjectionModal({ tournamentId, maxSlots, onClose, onSuccess, showToast }: {
  tournamentId: string
  maxSlots: number
  onClose: () => void
  onSuccess: () => void
  showToast: (text: string, ok: boolean) => void
}) {
  const [selected, setSelected]   = useState<InjectionProfile>('random')
  const [count, setCount]         = useState(1)
  const [loading, setLoading]     = useState(false)
  const [entries, setEntries]     = useState<AdminEntry[]>([])
  const [removing, setRemoving]   = useState<string | null>(null)
  const [loadingEntries, setLoadingEntries] = useState(true)

  const slotsUsed = entries.length
  const slotsLeft = Math.max(0, maxSlots - slotsUsed)

  async function loadEntries() {
    setLoadingEntries(true)
    try {
      const res = await api.get<AdminEntry[]>(`/tournaments/admin/${tournamentId}/entries`)
      setEntries(res.data)
    } catch { /* ok */ } finally {
      setLoadingEntries(false)
    }
  }

  useEffect(() => { loadEntries() }, [tournamentId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function inject() {
    if (slotsLeft === 0) { showToast('Tournament is full', false); return }
    setLoading(true)
    try {
      const res = await api.post<{ injected: number }>(`/tournaments/admin/inject-bots/${tournamentId}`, {
        profile: selected, count,
      })
      showToast(`Injected ${res.data.injected} bots (${selected})`, true)
      await loadEntries()
      onSuccess()
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Inject failed', false)
    } finally {
      setLoading(false)
    }
  }

  async function removeEntry(entryId: string) {
    setRemoving(entryId)
    try {
      await api.delete(`/tournaments/admin/${tournamentId}/entries/${entryId}`)
      setEntries(prev => prev.filter(e => e.entryId !== entryId))
      onSuccess()
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Remove failed', false)
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28,
        width: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.7)', fontFamily: C.font }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Manage Bots</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {slotsUsed}/{maxSlots} registered · {slotsLeft} slot{slotsLeft !== 1 ? 's' : ''} open
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted,
            fontSize: 20, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>×</button>
        </div>

        {/* Registered bots list */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 18, minHeight: 0 }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
            Registered ({slotsUsed})
          </div>
          {loadingEntries ? (
            <div style={{ fontSize: 12, color: C.muted, padding: '12px 0' }}>Loading…</div>
          ) : entries.length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted, padding: '12px 0' }}>No bots registered yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {entries.map(e => (
                <div key={e.entryId} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 10px', borderRadius: 8,
                  background: 'rgba(0,0,0,0.25)',
                  border: `1px solid ${C.border}`,
                }}>
                  <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, flexShrink: 0,
                    background: e.isSystem ? 'rgba(0,229,255,0.08)' : 'rgba(255,255,255,0.05)',
                    color: e.isSystem ? C.accent : C.muted,
                    border: `1px solid ${e.isSystem ? 'rgba(0,229,255,0.2)' : 'rgba(255,255,255,0.08)'}`,
                  }}>
                    {e.isSystem ? 'sys' : 'user'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 600,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.botName}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted }}>{e.ownerName}</div>
                  </div>
                  <button onClick={() => removeEntry(e.entryId)} disabled={removing === e.entryId}
                    style={{ background: 'none', border: `1px solid rgba(226,75,74,0.3)`, borderRadius: 6,
                      color: C.danger, fontSize: 12, padding: '3px 8px', cursor: removing === e.entryId ? 'not-allowed' : 'pointer',
                      fontFamily: C.font, opacity: removing === e.entryId ? 0.5 : 1, flexShrink: 0 }}>
                    {removing === e.entryId ? '…' : '✕ Remove'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Inject section */}
        {slotsLeft > 0 && (
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
              Add Bots
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              {INJECTION_PROFILES.map(p => (
                <button key={p.id} onClick={() => setSelected(p.id)} style={{
                  padding: '9px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                  border: `1px solid ${selected === p.id ? p.color : C.border}`,
                  background: selected === p.id ? `${p.color}14` : 'rgba(0,0,0,0.2)',
                  transition: 'all 0.15s', fontFamily: C.font,
                }}>
                  <div style={{ fontSize: 14, marginBottom: 3 }}>{p.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: selected === p.id ? p.color : C.text }}>
                    {p.label}
                  </div>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>Count</span>
              <input type="range" min={1} max={slotsLeft} value={Math.min(count, slotsLeft)}
                onChange={e => setCount(Number(e.target.value))}
                style={{ flex: 1, accentColor: C.accent }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: C.accent, minWidth: 24, textAlign: 'right' }}>
                {Math.min(count, slotsLeft)}
              </span>
            </div>

            <button onClick={inject} disabled={loading} style={{
              width: '100%', padding: '10px 0', borderRadius: 8, border: 'none',
              background: loading ? 'rgba(0,229,255,0.3)' : 'linear-gradient(90deg, #00e5ff, #0070ff)',
              color: '#000', fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: C.font, letterSpacing: 0.5, boxShadow: loading ? 'none' : '0 0 20px rgba(0,229,255,0.25)',
            }}>
              {loading ? 'Adding…' : `🤖 Add ${Math.min(count, slotsLeft)} ${INJECTION_PROFILES.find(p => p.id === selected)?.label}`}
            </button>
          </div>
        )}
        {slotsLeft === 0 && !loadingEntries && (
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, flexShrink: 0,
            fontSize: 12, color: C.muted, textAlign: 'center' }}>
            Tournament is full — remove bots above to free up slots
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Prize Preview Panel ──────────────────────────────────────────────────────

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const navigate = useNavigate()
  const user     = useAuthStore(s => s.user)

  useEffect(() => {
    if (user && user.role !== 'admin') navigate('/', { replace: true })
  }, [user, navigate])

  // Core data
  const [tournaments, setTournaments]           = useState<Tournament[]>([])
  const [history, setHistory]                   = useState<FinishedSummary[]>([])
  const [tournamentStates, setTournamentStates] = useState<Record<string, TournamentState>>({})
  const [users, setUsers]                       = useState<UserSummary[]>([])
  const [poolMetrics, setPoolMetrics]           = useState<PoolMetrics | null>(null)
  const [latency, setLatency]                   = useState<number | null>(null)
  const [loadingTnmt, setLoadingTnmt]           = useState(true)
  const [loadingUsers, setLoadingUsers]         = useState(true)

  // Real-time telemetry: tournamentId → latest progress data
  const [telemetryMap, setTelemetryMap] = useState<Record<string, TelemetryData>>({})
  const telemetrySocketRef = useRef<Socket | null>(null)
  const telemetrySocketConnected = useRef(false)

  // UI state
  const [toast, setToast]               = useState<{ text: string; ok: boolean } | null>(null)
  const [busyId, setBusyId]             = useState<string | null>(null)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [injectModalId, setInjectModalId] = useState<string | null>(null)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Create form
  const [tableSize, setTableSize] = useState<2 | 3 | 6 | 9>(9)
  const [speed, setSpeed]         = useState<'Slow' | 'Fast'>('Slow')
  const [buyIn, setBuyIn]         = useState(1000)
  const [tnmtName, setTnmtName]       = useState('')
  const [handsPerLevel, setHandsPerLevel] = useState(50)
  const [creating, setCreating]       = useState(false)
  const [prizePreview, setPrizePreview] = useState<{ firstPlace: number; itmCount: number } | null>(null)

  useEffect(() => {
    if (buyIn === 0) { setPrizePreview(null); return }
    const maxPlayers = tableSize * Math.min(9, Math.max(2, Math.round(27 / tableSize)))
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<{ payouts: Array<{ rank: number; amount: number; percentage: number }> }>(
          `/tournaments/admin/prize-preview?pool=${buyIn * maxPlayers}&players=${maxPlayers}`
        )
        if (res.data.payouts.length > 0) {
          setPrizePreview({ firstPlace: res.data.payouts[0].amount, itmCount: res.data.payouts.length })
        }
      } catch { setPrizePreview(null) }
    }, 300)
    return () => clearTimeout(timer)
  }, [buyIn, tableSize])

  // Seeding map
  const [seedingMaps, setSeedingMaps] = useState<Record<string, SeedingMapData>>({})
  const [seedingId, setSeedingId]     = useState<string | null>(null)

  // Balancing moves panel
  const [balancingMovesId, setBalancingMovesId] = useState<string | null>(null)

  // Sidebar tabs + Quick Analytics
  const [sidebarTab, setSidebarTab]     = useState<'live' | 'history'>('live')
  const [analyticsId, setAnalyticsId]   = useState<string | null>(null)

  // User table controls
  const [userSearch, setUserSearch]   = useState('')
  const [subFilter, setSubFilter]     = useState<SubFilter>('all')
  const [userSort, setUserSort]       = useState<UserSortKey>('bot_count')

  const showToast = (text: string, ok: boolean) => setToast({ text, ok })

  const fetchSeedingMap = useCallback(async (id: string) => {
    try {
      const { data } = await api.get<SeedingMapData>(`/tournaments/${id}/seeding-map`)
      setSeedingMaps(prev => ({ ...prev, [id]: data }))
      setSeedingId(id)
    } catch {
      showToast('Failed to load seeding map', false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchHistory = useCallback(async () => {
    try {
      const { data } = await api.get<FinishedSummary[]>('/tournaments/admin/history?limit=20')
      setHistory(data ?? [])
    } catch { /* ok */ }
  }, [])

  const fetchTournaments = useCallback(async () => {
    try {
      const [reg, run] = await Promise.all([
        api.get<Tournament[]>('/tournaments?status=registering'),
        api.get<Tournament[]>('/tournaments?status=running'),
      ])
      const seen = new Set<string>()
      const all = [...(reg.data ?? []), ...(run.data ?? [])].filter(t => {
        if (seen.has(t.id)) return false
        seen.add(t.id)
        return true
      })
      setTournaments(all)

      const liveIds = all.filter(t => t.status === 'running' || t.status === 'final_table').map(t => t.id)
      if (liveIds.length > 0) {
        const results = await Promise.allSettled(
          liveIds.map(id => api.get<TournamentState>(`/tournaments/${id}/state`))
        )
        const newStates: Record<string, TournamentState> = {}
        results.forEach((r, i) => {
          if (r.status !== 'fulfilled') return
          const id = liveIds[i]
          const state = r.value.data
          newStates[id] = state

        })
        setTournamentStates(newStates)
      }
    } catch { /* stale data ok */ }
    finally { setLoadingTnmt(false) }
  }, [])

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get<UserSummary[]>('/tournaments/admin/users-summary')
      setUsers(res.data ?? [])
    } catch { /* ok */ }
    finally { setLoadingUsers(false) }
  }, [])

  const fetchPoolMetrics = useCallback(async () => {
    try {
      const res = await api.get<PoolMetrics>('/tournaments/simulation/pool-metrics')
      setPoolMetrics(res.data)
    } catch { /* ok */ }
  }, [])

  const measureLatency = useCallback(async () => {
    const t0 = Date.now()
    try {
      await api.get('/tournaments?status=registering&limit=1')
      setLatency(Date.now() - t0)
    } catch { setLatency(null) }
  }, [])

  // Fast poller: refresh only live tournament states every 5 s
  const refreshLiveStates = useCallback(async () => {
    const liveIds = tournaments
      .filter(t => t.status === 'running' || t.status === 'final_table')
      .map(t => t.id)
    if (liveIds.length === 0) return
    const results = await Promise.allSettled(
      liveIds.map(id => api.get<TournamentState>(`/tournaments/${id}/state`))
    )
    setTournamentStates(prev => {
      const next = { ...prev }
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled') return
        const id = liveIds[i]
        const state = r.value.data
        next[id] = state
      })
      return next
    })
  }, [tournaments])

  useEffect(() => {
    fetchTournaments()
    fetchHistory()
    fetchUsers()
    fetchPoolMetrics()
    measureLatency()
    const t30 = setInterval(() => { fetchTournaments(); fetchHistory() }, 30_000)
    const t15 = setInterval(fetchPoolMetrics,  15_000)
    const t60 = setInterval(measureLatency,    60_000)
    return () => { clearInterval(t30); clearInterval(t15); clearInterval(t60) }
  }, [fetchTournaments, fetchHistory, fetchUsers, fetchPoolMetrics, measureLatency])

  // Fast live-state refresh — runs whenever the tournaments list changes so
  // the interval always has the latest IDs in scope
  useEffect(() => {
    const t5 = setInterval(refreshLiveStates, 5_000)
    return () => clearInterval(t5)
  }, [refreshLiveStates])

  // Auto-refresh seeding map every 15s when a running tournament is selected
  useEffect(() => {
    if (!seedingId) return
    const t = tournaments.find(t => t.id === seedingId)
    if (t?.status !== 'running' && t?.status !== 'final_table') return
    const interval = setInterval(() => fetchSeedingMap(seedingId), 15_000)
    return () => clearInterval(interval)
  }, [seedingId, tournaments, fetchSeedingMap])

  // ── WebSocket telemetry — tournament_progress events ──────────────────────
  const token = useAuthStore(s => s.token)
  // Stable string dep — only re-run when the actual set of live IDs changes,
  // not on every tournaments array reference refresh (which happens every 3s).
  const liveIdsKey = tournaments
    .filter(t => t.status === 'running' || t.status === 'final_table')
    .map(t => t.id)
    .sort()
    .join(',')

  useEffect(() => {
    const liveIds = liveIdsKey ? liveIdsKey.split(',') : []
    if (liveIds.length === 0) {
      if (telemetrySocketRef.current) {
        telemetrySocketRef.current.disconnect()
        telemetrySocketRef.current = null
        telemetrySocketConnected.current = false
      }
      return
    }

    const baseURL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000'
    const socket = io(`${baseURL}/tournament`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    })
    telemetrySocketRef.current = socket

    socket.on('connect', () => {
      telemetrySocketConnected.current = true
      liveIds.forEach(id => socket.emit('subscribe_tournament', { tournamentId: id }))
    })

    socket.on('disconnect', () => { telemetrySocketConnected.current = false })

    socket.on('tournament_progress', (data: TelemetryData) => {
      setTelemetryMap(prev => ({ ...prev, [data.tournamentId]: data }))
    })

    return () => {
      // Guard: only emit unsubscribe if the socket actually connected
      if (socket.connected) {
        liveIds.forEach(id => socket.emit('unsubscribe_tournament', { tournamentId: id }))
      }
      socket.disconnect()
      telemetrySocketRef.current = null
      telemetrySocketConnected.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveIdsKey, token])

  // ── Polling fallback — used when WebSocket is not connected ───────────────
  useEffect(() => {
    const liveIds = tournaments.filter(t => t.status === 'running' || t.status === 'final_table')
    if (liveIds.length === 0) return

    const poll = async () => {
      if (telemetrySocketConnected.current) return  // WebSocket active — skip
      await Promise.allSettled(
        liveIds.map(async t => {
          try {
            const res = await api.get<TelemetryData>(`/tournaments/admin/${t.id}/status`)
            setTelemetryMap(prev => ({ ...prev, [t.id]: res.data }))
          } catch { /* stale data ok */ }
        })
      )
    }

    const interval = setInterval(poll, 2000)
    return () => clearInterval(interval)
  }, [tournaments])

  // ── Derived ────────────────────────────────────────────────────────────────

  const registering = tournaments.filter(t => t.status === 'registering')
  const running     = tournaments.filter(t => t.status === 'running' || t.status === 'final_table')

  const totalBots     = users.reduce((s, u) => s + parseInt(u.bot_count || '0', 10), 0)
  const engineBusy    = poolMetrics != null && poolMetrics.activeWorkers >= poolMetrics.poolSize
  const engineLoad    = poolMetrics ? (poolMetrics.activeWorkers / Math.max(1, poolMetrics.poolSize)) : 0

  const filteredUsers = useMemo(() => {
    let list = [...users]
    const q = userSearch.trim().toLowerCase()
    if (q) list = list.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    if (subFilter !== 'all') list = list.filter(u => u.subscription_status === subFilter)
    list.sort((a, b) => {
      if (userSort === 'bot_count') return parseInt(b.bot_count) - parseInt(a.bot_count)
      const ta = a.last_login_at ? new Date(a.last_login_at).getTime() : 0
      const tb = b.last_login_at ? new Date(b.last_login_at).getTime() : 0
      return tb - ta
    })
    return list
  }, [users, userSearch, subFilter, userSort])

  // ── Actions ────────────────────────────────────────────────────────────────

  async function forceStart(id: string) {
    setBusyId(`start-${id}`)
    try {
      await api.post(`/tournaments/${id}/start`)
      showToast('Tournament started!', true)
      await fetchTournaments()
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Start failed', false)
    } finally { setBusyId(null) }
  }

  async function cancelTournament(id: string) {
    setBusyId(`cancel-${id}`)
    try {
      await api.post(`/tournaments/${id}/cancel`)
      showToast('Tournament cancelled', true)
      await fetchTournaments()
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Cancel failed', false)
    } finally { setBusyId(null) }
  }

  async function createTournament() {
    setCreating(true)
    const name = tnmtName.trim() || `Admin Manual #${Date.now().toString().slice(-6)}`
    const maxPlayers = tableSize * Math.min(9, Math.max(2, Math.round(27 / tableSize)))
    try {
      await api.post('/tournaments', {
        name, type: 'rolling', buy_in: buyIn, starting_chips: 5000,
        min_players: 2, max_players: maxPlayers, players_per_table: tableSize,
        turn_timeout_ms: speed === 'Fast' ? 3000 : 10000, rebuys_allowed: false,
        hands_per_level: handsPerLevel,
      })
      showToast(`"${name}" created`, true)
      setTnmtName('')
      await fetchTournaments()
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Create failed', false)
    } finally { setCreating(false) }
  }

  function handleResetClick() {
    if (!resetConfirm) {
      setResetConfirm(true)
      resetTimer.current = setTimeout(() => setResetConfirm(false), 4000)
    } else {
      if (resetTimer.current) clearTimeout(resetTimer.current)
      setResetConfirm(false)
      executeReset()
    }
  }

  async function executeReset() {
    setBusyId('reset')
    try {
      const res = await api.post<{ cancelled: number }>('/tournaments/admin/reset-state')
      showToast(`Reset: ${res.data.cancelled} tournaments cancelled`, true)
      await fetchTournaments()
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Reset failed', false)
    } finally { setBusyId(null) }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (user?.role !== 'admin') return null

  const injectTarget = injectModalId ? tournaments.find(t => t.id === injectModalId) : null
  const injectSlots  = injectTarget ? injectTarget.max_players : 0

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.bg, fontFamily: C.font, overflow: 'hidden' }}>
      <style>{`
        @keyframes adminPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes adminGlow  { 0%,100%{box-shadow:0 0 12px rgba(0,229,255,0.3),0 0 0 1px rgba(0,229,255,0.2)}
                                50%{box-shadow:0 0 24px rgba(0,229,255,0.6),0 0 0 1px rgba(0,229,255,0.4)} }
        @keyframes telemetryPulse { 0%,100%{box-shadow:0 0 6px rgba(29,158,117,0.8)} 50%{box-shadow:0 0 14px rgba(29,158,117,1)} }
        @keyframes finalTableRing { 0%,100%{box-shadow:0 0 6px rgba(245,158,11,0.7)} 50%{box-shadow:0 0 16px rgba(245,158,11,1),0 0 4px rgba(245,158,11,0.5)} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#2a2a50;border-radius:4px}
        input[type=range]{height:4px;cursor:pointer}
      `}</style>

      <Sidebar />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ padding: '12px 28px', display: 'flex', alignItems: 'center', gap: 14,
          borderBottom: `1px solid ${C.border}`, flexShrink: 0,
          background: 'rgba(10,10,26,0.8)', backdropFilter: 'blur(8px)' }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.25)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L3 7v5c0 5.25 3.75 10.14 9 11.29C17.25 22.14 21 17.25 21 12V7L12 2z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>Mission Control</div>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.5, textTransform: 'uppercase' }}>Admin Operations Center</div>
          </div>

          {/* Engine load bar */}
          <div style={{ marginLeft: 28, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' }}>Sim Engine</span>
              <span style={{ fontSize: 10, color: engineBusy ? C.danger : C.success, fontWeight: 700 }}>
                {poolMetrics ? `${poolMetrics.activeWorkers}/${poolMetrics.poolSize}` : '—'}
                {engineBusy ? ' BUSY' : ' OK'}
              </span>
            </div>
            <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                width: `${Math.min(100, engineLoad * 100)}%`, height: '100%', borderRadius: 2,
                background: engineLoad > 0.8 ? C.danger : engineLoad > 0.5 ? C.warning : C.success,
                transition: 'width 0.4s ease',
              }} />
            </div>
            {poolMetrics && poolMetrics.queuedTasks > 0 && (
              <span style={{ fontSize: 10, color: C.warning }}>{poolMetrics.queuedTasks} queued</span>
            )}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.accent, animation: 'adminPulse 2s infinite' }} />
            <span style={{ fontSize: 11, color: C.muted }}>{tournaments.length} active</span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, padding: '3px 10px', borderRadius: 20,
              background: 'rgba(0,229,255,0.12)', color: C.accent, border: '1px solid rgba(0,229,255,0.25)' }}>
              GOD MODE
            </span>
          </div>
        </div>

        {/* ── Quick Stats ─────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0,
          borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          {[
            { label: 'Total Users',        value: users.length,            icon: '👥', color: C.text },
            { label: 'Active Bots',         value: totalBots,               icon: '🤖', color: C.accent },
            { label: 'Live Tournaments',    value: running.length,          icon: '⚡', color: running.length > 0 ? C.success : C.muted },
            { label: 'Server Latency',      value: latency != null ? `${latency}ms` : '—', icon: '📡',
              color: latency == null ? C.muted : latency < 100 ? C.success : latency < 300 ? C.warning : C.danger },
          ].map(({ label, value, icon, color }, i) => (
            <div key={label} style={{ padding: '14px 24px', borderRight: i < 3 ? `1px solid ${C.border}` : 'none',
              background: 'rgba(19,19,42,0.4)' }}>
              <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 }}>
                {icon} {label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* ── Main split ──────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Left: Tournaments */}
          <div style={{ width: 400, flexShrink: 0, borderRight: `1px solid ${C.border}`,
            display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Tab bar */}
            <div style={{ padding: '10px 12px 0', flexShrink: 0, display: 'flex', gap: 6,
              borderBottom: `1px solid ${C.border}`, background: 'rgba(10,10,26,0.6)' }}>
              {(['live', 'history'] as const).map(tab => {
                const active = sidebarTab === tab
                const label  = tab === 'live' ? 'Live & Pending' : 'History'
                const count  = tab === 'live' ? tournaments.length : history.length
                return (
                  <button key={tab} onClick={() => setSidebarTab(tab)} style={{
                    padding: '7px 14px', borderRadius: '6px 6px 0 0', fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', fontFamily: C.font, letterSpacing: 0.5, transition: 'all 0.15s',
                    border: `1px solid ${active ? 'rgba(0,229,255,0.3)' : 'transparent'}`,
                    borderBottom: active ? `1px solid ${C.bg}` : 'none',
                    background: active ? 'rgba(0,229,255,0.08)' : 'transparent',
                    color: active ? C.accent : C.muted,
                    marginBottom: active ? -1 : 0,
                  }}>
                    {label}
                    {count > 0 && (
                      <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px',
                        borderRadius: 8, background: active ? 'rgba(0,229,255,0.15)' : 'rgba(168,179,196,0.12)',
                        color: active ? C.accent : C.muted }}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 16px' }}>

              {/* ── Live & Pending tab ────────────────────────────────────── */}
              {sidebarTab === 'live' && (
                <>
                  {loadingTnmt ? (
                    <div style={{ color: C.muted, fontSize: 13, padding: '20px 8px' }}>Loading…</div>
                  ) : tournaments.length === 0 ? (
                    <div style={{ color: C.muted, fontSize: 13, padding: '20px 8px', textAlign: 'center' }}>
                      No active tournaments.<br/>
                      <span style={{ color: C.accent, fontSize: 12 }}>Create one in the panel →</span>
                    </div>
                  ) : (
                    <>
                      {registering.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.2, textTransform: 'uppercase', padding: '6px 8px 4px' }}>
                            Registration Open ({registering.length})
                          </div>
                          {registering.map(t => (
                            <TournamentRow key={t.id} t={t} busyId={busyId}
                              liveState={tournamentStates[t.id]}
                              telemetryData={telemetryMap[t.id]}

                              onInject={() => setInjectModalId(t.id)}
                              onSeedingMap={() => fetchSeedingMap(t.id)}
                              onBalancingMoves={() => setBalancingMovesId(t.id)}
                              onStart={forceStart} onCancel={cancelTournament} />
                          ))}
                        </div>
                      )}
                      {running.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.2, textTransform: 'uppercase', padding: '6px 8px 4px' }}>
                            Live ({running.length})
                          </div>
                          {running.map(t => (
                            <TournamentRow key={t.id} t={t} busyId={busyId}
                              liveState={tournamentStates[t.id]}
                              telemetryData={telemetryMap[t.id]}

                              onInject={() => setInjectModalId(t.id)}
                              onSeedingMap={() => fetchSeedingMap(t.id)}
                              onBalancingMoves={() => setBalancingMovesId(t.id)}
                              onStart={forceStart} onCancel={cancelTournament} />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* ── History tab ───────────────────────────────────────────── */}
              {sidebarTab === 'history' && (
                <>
                  {history.length === 0 ? (
                    <div style={{ color: C.muted, fontSize: 13, padding: '20px 8px', textAlign: 'center' }}>
                      No finished tournaments yet.
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.2, textTransform: 'uppercase', padding: '6px 8px 4px' }}>
                        Recently Finished ({history.length})
                      </div>
                      {history.map(s => (
                        <FinishedTournamentCard key={s.id} s={s}
                          onAnalytics={() => setAnalyticsId(s.id)} />
                      ))}
                      <a href="/tournaments"
                        style={{ display: 'block', textAlign: 'center', fontSize: 11, color: C.muted,
                          padding: '10px 0', textDecoration: 'none', letterSpacing: 0.5 }}
                        onMouseEnter={e => (e.currentTarget.style.color = C.accent)}
                        onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>
                        View All Tournaments →
                      </a>
                    </>
                  )}
                </>
              )}

            </div>
          </div>

          {/* Right: Quick Actions + Users */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Seeding Map */}
            {seedingId && seedingMaps[seedingId] && (
              <TournamentSeedingMap
                data={seedingMaps[seedingId]}
                tournamentName={tournaments.find(t => t.id === seedingId)?.name ?? seedingId}
                isLive={['running', 'final_table'].includes(tournaments.find(t => t.id === seedingId)?.status ?? '')}
                onClose={() => setSeedingId(null)}
                onRefresh={() => fetchSeedingMap(seedingId)}
              />
            )}

            {/* Balancing Moves Log */}
            {balancingMovesId && (
              <BalancingMovesPanel
                tournamentId={balancingMovesId}
                onClose={() => setBalancingMovesId(null)}
              />
            )}

            {/* Quick Analytics Panel */}
            {analyticsId && (
              <QuickAnalyticsPanel
                tournamentId={analyticsId}
                onClose={() => setAnalyticsId(null)}
              />
            )}

            {/* Create Tournament */}
            <div style={{ background: 'rgba(19,19,42,0.7)', backdropFilter: 'blur(12px)',
              border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Create Manual Tournament</span>
                {engineBusy && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                    background: C.dangerDim, color: C.danger, border: `1px solid rgba(226,75,74,0.3)` }}>
                    ⚠ ENGINE BUSY
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                {/* Name */}
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Name</label>
                  <input value={tnmtName} onChange={e => setTnmtName(e.target.value)}
                    placeholder={`Admin Manual #${Date.now().toString().slice(-6)}`} maxLength={60}
                    style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.3)',
                      border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px',
                      color: C.text, fontSize: 13, fontFamily: C.font, outline: 'none' }} />
                </div>

                {/* Table Size */}
                <div>
                  <label style={{ fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>Table Size</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {([2, 3, 6, 9] as const).map(n => (
                      <button key={n} onClick={() => setTableSize(n)} style={{
                        padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontFamily: C.font, fontSize: 13,
                        border: `1px solid ${tableSize === n ? C.accent : C.border}`,
                        background: tableSize === n ? 'rgba(0,229,255,0.12)' : 'rgba(0,0,0,0.2)',
                        color: tableSize === n ? C.accent : C.muted, fontWeight: tableSize === n ? 700 : 400,
                        transition: 'all 0.15s',
                      }}>{n}</button>
                    ))}
                  </div>
                </div>

                {/* Speed */}
                <div>
                  <label style={{ fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>Speed</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['Slow', 'Fast'] as const).map(s => (
                      <button key={s} onClick={() => { setSpeed(s); setHandsPerLevel(s === 'Fast' ? 20 : 100) }} style={{
                        padding: '5px 16px', borderRadius: 6, cursor: 'pointer', fontFamily: C.font, fontSize: 13,
                        border: `1px solid ${speed === s ? C.accent : C.border}`,
                        background: speed === s ? 'rgba(0,229,255,0.12)' : 'rgba(0,0,0,0.2)',
                        color: speed === s ? C.accent : C.muted, fontWeight: speed === s ? 700 : 400,
                        transition: 'all 0.15s',
                      }}>{s}</button>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{speed === 'Fast' ? '3s timeout · 20 hands/level' : '10s timeout · 100 hands/level'}</div>
                </div>

                {/* Hands per Level */}
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Hands per Level</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="number" min={1} max={500} value={handsPerLevel}
                      onChange={e => setHandsPerLevel(Math.max(1, parseInt(e.target.value) || 1))}
                      style={{ width: 80, background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.border}`,
                        borderRadius: 8, padding: '7px 12px', color: C.text, fontSize: 13, fontFamily: C.font, outline: 'none' }} />
                    <span style={{ fontSize: 11, color: C.muted }}>hands before blind increase</span>
                  </div>
                </div>

                {/* Buy-in */}
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Buy-in / Prize Pool</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: C.muted, fontSize: 14 }}>$</span>
                    <input type="number" min={0} max={1000000} value={buyIn} onChange={e => setBuyIn(Math.max(0, parseInt(e.target.value) || 0))}
                      style={{ width: 100, background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.border}`,
                        borderRadius: 8, padding: '7px 12px', color: C.text, fontSize: 13, fontFamily: C.font, outline: 'none' }} />
                    <span style={{ fontSize: 11, color: C.muted }}>
                      Max {tableSize * Math.min(9, Math.max(2, Math.round(27 / tableSize)))} players
                    </span>
                  </div>
                  {prizePreview && buyIn > 0 && (
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>
                      Projected 1st Place:{' '}
                      <span style={{ color: C.accent, fontWeight: 700 }}>${prizePreview.firstPlace.toLocaleString()}</span>
                      {' · '}ITM:{' '}
                      <span style={{ color: C.text }}>{prizePreview.itmCount} players</span>
                    </div>
                  )}
                </div>
              </div>

              <button onClick={createTournament} disabled={creating || engineBusy} title={engineBusy ? 'Simulation engine at capacity' : undefined}
                style={{
                  width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', fontFamily: C.font,
                  background: (creating || engineBusy) ? 'rgba(0,229,255,0.2)' : 'linear-gradient(90deg, #00e5ff, #0070ff)',
                  color: engineBusy ? C.muted : '#000', fontSize: 13, fontWeight: 700,
                  cursor: (creating || engineBusy) ? 'not-allowed' : 'pointer', letterSpacing: 0.5,
                  boxShadow: (creating || engineBusy) ? 'none' : '0 0 20px rgba(0,229,255,0.25)',
                  animation: (creating || engineBusy) ? 'none' : 'adminGlow 2s ease-in-out infinite',
                }}>
                {creating ? 'Creating…' : engineBusy ? '⚠ Engine Busy — Wait' : '⚡ Launch Tournament'}
              </button>
            </div>

            {/* User & Bot Monitoring */}
            <div style={{ background: 'rgba(19,19,42,0.7)', backdropFilter: 'blur(12px)',
              border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>User &amp; Bot Monitoring</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: C.muted }}>{filteredUsers.length}/{users.length}</span>
              </div>

              {/* Search + filters */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                {/* Search */}
                <div style={{ flex: 1, minWidth: 160, position: 'relative' }}>
                  <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                    width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input value={userSearch} onChange={e => setUserSearch(e.target.value)}
                    placeholder="Search name or email…"
                    style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
                      background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.border}`, borderRadius: 8,
                      color: C.text, fontSize: 12, fontFamily: C.font, outline: 'none' }} />
                </div>

                {/* Sub filter */}
                <select value={subFilter} onChange={e => setSubFilter(e.target.value as SubFilter)}
                  style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.border}`, borderRadius: 8,
                    color: C.muted, fontSize: 12, padding: '7px 10px', fontFamily: C.font, outline: 'none', cursor: 'pointer' }}>
                  <option value="all">All Subs</option>
                  <option value="active">Pro</option>
                  <option value="free">Free</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="expired">Expired</option>
                </select>

                {/* Sort */}
                <select value={userSort} onChange={e => setUserSort(e.target.value as UserSortKey)}
                  style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.border}`, borderRadius: 8,
                    color: C.muted, fontSize: 12, padding: '7px 10px', fontFamily: C.font, outline: 'none', cursor: 'pointer' }}>
                  <option value="bot_count">Sort: Bots</option>
                  <option value="last_login_at">Sort: Last Active</option>
                </select>
              </div>

              {loadingUsers ? (
                <div style={{ color: C.muted, fontSize: 13, padding: '8px 0' }}>Loading…</div>
              ) : filteredUsers.length === 0 ? (
                <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '16px 0' }}>No users match filters.</div>
              ) : (
                <div style={{ overflowY: 'auto', maxHeight: 260 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 80px 90px 50px',
                    padding: '5px 10px', borderBottom: `1px solid ${C.border}`,
                    fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>
                    <span>Player</span><span>Email</span><span>Sub</span>
                    <span>{userSort === 'last_login_at' ? 'Last Active' : 'Last Active'}</span>
                    <span style={{ textAlign: 'right' }}>Bots</span>
                  </div>
                  {filteredUsers.map(u => (
                    <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 80px 90px 50px',
                      padding: '8px 10px', borderBottom: `1px solid rgba(30,30,63,0.5)`, alignItems: 'center', fontSize: 13 }}>
                      <span style={{ color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.name}
                      </span>
                      <span style={{ color: C.muted, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.email}
                      </span>
                      <span><SubBadge status={u.subscription_status} /></span>
                      <span style={{ fontSize: 11, color: C.muted }}>
                        {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : '—'}
                      </span>
                      <span style={{ textAlign: 'right', fontWeight: 700, fontSize: 14,
                        color: parseInt(u.bot_count) > 0 ? C.accent : C.muted }}>
                        {u.bot_count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Danger Zone */}
            <div style={{ background: 'rgba(226,75,74,0.04)', backdropFilter: 'blur(12px)',
              border: `1px solid rgba(226,75,74,0.2)`, borderRadius: 14, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.danger }}>⚠ Danger Zone</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Cancels all open registrations.</div>
                </div>
                <button onClick={handleResetClick} disabled={busyId === 'reset'} style={{
                  padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  fontFamily: C.font, transition: 'all 0.2s', border: `1px solid ${C.danger}`,
                  background: resetConfirm ? C.danger : C.dangerDim,
                  color: resetConfirm ? '#fff' : C.danger, opacity: busyId === 'reset' ? 0.5 : 1,
                }}>
                  {busyId === 'reset' ? 'Resetting…' : resetConfirm ? '⚠ Confirm Reset?' : 'Reset State'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Injection Modal */}
      {injectModalId && injectTarget && (
        <InjectionModal
          tournamentId={injectModalId}
          maxSlots={injectSlots}
          onClose={() => setInjectModalId(null)}
          onSuccess={fetchTournaments}
          showToast={showToast}
        />
      )}

      <Toast msg={toast} onClose={() => setToast(null)} />
    </div>
  )
}

// ─── Balancing Moves Panel ────────────────────────────────────────────────────

interface TableMoveEvent {
  id: string
  tournament_id: string
  event_type: string
  bot_id: string
  from_table_id: string | null
  to_table_id: string | null
  from_seat: number | null
  to_seat: number | null
  chips_at_move: string | null  // bigint comes as string from JSON
  created_at: string
}

function BalancingMovesPanel({ tournamentId, onClose }: { tournamentId: string; onClose: () => void }) {
  const [moves, setMoves] = useState<TableMoveEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMoves = useCallback(async () => {
    try {
      const res = await api.get<TableMoveEvent[]>(`/tournaments/admin/${tournamentId}/balancing-moves?limit=30`)
      setMoves(res.data ?? [])
      setError(null)
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [tournamentId])

  useEffect(() => {
    fetchMoves()
    const t = setInterval(fetchMoves, 10_000)
    return () => clearInterval(t)
  }, [fetchMoves])

  return (
    <div style={{ background: 'rgba(19,19,42,0.9)', backdropFilter: 'blur(14px)',
      border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text, flex: 1 }}>
          ⚖ Table Balancing Log
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
          background: 'rgba(0,229,255,0.1)', color: C.accent, border: '1px solid rgba(0,229,255,0.2)' }}>
          ACTIVE
        </span>
        <button onClick={fetchMoves}
          style={{ background: 'rgba(0,229,255,0.08)', border: `1px solid ${C.accent}44`, color: C.accent,
            fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 6,
            padding: '3px 10px', fontFamily: C.font }}>↺</button>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', color: C.muted, fontSize: 18,
            cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
      </div>

      {loading && <div style={{ color: C.muted, fontSize: 12, padding: '8px 0' }}>Loading…</div>}
      {error && <div style={{ color: C.danger, fontSize: 12, padding: '8px 0' }}>{error}</div>}
      {!loading && !error && moves.length === 0 && (
        <div style={{ color: C.muted, fontSize: 12, fontStyle: 'italic' }}>
          No table moves recorded yet. Moves are logged when the engine balances tables.
        </div>
      )}
      {moves.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 70px', gap: 0,
            fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase',
            padding: '4px 8px', borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}>
            <span>Time</span><span>From</span><span>To</span><span style={{ textAlign: 'right' }}>Chips</span>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {moves.map((m, i) => {
              const ts = new Date(m.created_at)
              const timeStr = `${ts.getHours().toString().padStart(2,'0')}:${ts.getMinutes().toString().padStart(2,'0')}:${ts.getSeconds().toString().padStart(2,'0')}`
              const chips = m.chips_at_move ? Number(m.chips_at_move).toLocaleString() : '—'
              const fromStr = m.from_table_id ? `T-${m.from_table_id.slice(-4)} S${m.from_seat ?? '?'}` : '—'
              const toStr = m.to_table_id ? `T-${m.to_table_id.slice(-4)} S${m.to_seat ?? '?'}` : '—'
              return (
                <div key={m.id} style={{
                  display: 'grid', gridTemplateColumns: '80px 1fr 1fr 70px',
                  padding: '6px 8px', borderRadius: 5, fontSize: 11, alignItems: 'center',
                  background: i % 2 === 0 ? 'rgba(0,0,0,0.15)' : 'transparent',
                }}>
                  <span style={{ color: C.muted, fontFamily: 'monospace', fontSize: 10 }}>{timeStr}</span>
                  <span style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fromStr}
                  </span>
                  <span style={{ color: C.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    → {toStr}
                  </span>
                  <span style={{ textAlign: 'right', color: C.muted, fontFamily: 'monospace', fontSize: 10 }}>{chips}</span>
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: C.muted }}>
            {moves.length} moves · auto-refreshes every 10s
          </div>
        </>
      )}
    </div>
  )
}

// ─── Tournament Row ────────────────────────────────────────────────────────────

// ─── Seeding Map Component ────────────────────────────────────────────────────

function ownerColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0
  return `hsl(${hash % 360}, 65%, 55%)`
}

function botInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}

const TournamentSeedingMap = memo(function TournamentSeedingMap({
  data, tournamentName, isLive, onClose, onRefresh,
}: { data: SeedingMapData; tournamentName: string; isLive?: boolean; onClose: () => void; onRefresh: () => void }) {
  const score = data.fairnessScore
  const scoreColor = score < 5 ? C.success : score < 15 ? C.warning : C.danger

  return (
    <div style={{ background: 'rgba(19,19,42,0.9)', backdropFilter: 'blur(14px)',
      border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text, flex: 1 }}>
          🗺 Seeding Map — {tournamentName}
        </span>
        {isLive && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: 'rgba(29,158,117,0.15)', color: C.success, border: '1px solid rgba(29,158,117,0.3)',
            letterSpacing: 1, textTransform: 'uppercase', animation: 'telemetryPulse 2s infinite' }}>
            LIVE
          </span>
        )}
        {data.tables.length > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
            background: `${scoreColor}22`, color: scoreColor, border: `1px solid ${scoreColor}55` }}>
            σ = {score.toFixed(1)} ELO
          </span>
        )}
        <button onClick={onRefresh}
          style={{ background: 'rgba(0,229,255,0.08)', border: `1px solid ${C.accent}44`, color: C.accent,
            fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 6,
            padding: '3px 10px', fontFamily: C.font }}>↺ Refresh</button>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', color: C.muted, fontSize: 18,
            cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
      </div>

      {/* Fairness label */}
      {data.tables.length > 0 && (
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: 'uppercase',
          marginBottom: 14 }}>
          Standard deviation of avg ELO across tables ·&nbsp;
          <span style={{ color: scoreColor }}>
            {score < 5 ? 'Excellent balance' : score < 15 ? 'Acceptable' : 'Unbalanced — check seeding'}
          </span>
        </div>
      )}

      {/* Owner legend */}
      {(() => {
        const ownerMap = new Map<string, string>()
        data.tables.forEach(t => t.seats.forEach(s => {
          if (!ownerMap.has(s.userId)) ownerMap.set(s.userId, s.ownerName)
        }))
        const owners = [...ownerMap.entries()]
        if (owners.length === 0) return null
        return (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            {owners.map(([uid, name]) => (
              <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%',
                  background: ownerColor(uid), flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: C.muted }}>{name}</span>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Empty state */}
      {data.tables.length === 0 && (
        <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', padding: '8px 0' }}>
          No seating data yet — seats are assigned when the tournament starts. Click ↺ Refresh after going live.
        </div>
      )}

      {/* Table grid */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {data.tables.map(table => (
          <div key={table.tableId}
            style={{ width: 210, background: 'rgba(0,0,0,0.3)', borderRadius: 10,
              border: `1px solid ${table.broken ? 'rgba(168,179,196,0.15)' : C.border}`,
              padding: '12px 14px', flexShrink: 0,
              opacity: table.broken ? 0.55 : 1 }}>

            {/* Table header */}
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1,
              textTransform: 'uppercase', marginBottom: 10,
              color: table.broken ? C.muted : C.accent,
              display: 'flex', alignItems: 'center', gap: 6 }}>
              Table {table.tableNumber}
              {table.broken
                ? <span style={{ fontSize: 9, fontWeight: 600, color: C.muted, background: 'rgba(255,255,255,0.06)',
                    padding: '1px 5px', borderRadius: 4, letterSpacing: 0.5 }}>BROKEN</span>
                : <span style={{ fontSize: 10, fontWeight: 400, color: C.muted }}>
                    avg ELO {table.seats.length
                      ? Math.round(table.seats.reduce((s, x) => s + x.elo, 0) / table.seats.length)
                      : 0}
                  </span>
              }
            </div>

            {/* Seats */}
            {table.seats.map((seat, i) => (
              <div key={`${seat.botId}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7,
                opacity: seat.busted ? 0.4 : 1 }}>
                {/* Avatar with owner color ring */}
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(0,0,0,0.4)',
                  border: `2px solid ${seat.busted ? 'rgba(168,179,196,0.3)' : ownerColor(seat.userId)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: seat.busted ? C.muted : C.text,
                }}>
                  {botInitials(seat.botName)}
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: seat.busted ? C.muted : C.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {seat.botName}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {seat.ownerName}
                    {seat.elo > 0 && !seat.busted && <span style={{ color: C.accent, marginLeft: 4 }}>·&nbsp;W{seat.elo}</span>}
                    {seat.busted && <span style={{ color: C.danger, marginLeft: 4 }}>· out</span>}
                  </div>
                </div>
              </div>
            ))}

            {table.seats.length === 0 && (
              <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic' }}>No seated players</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
})

// ─── Finished Tournament Card ─────────────────────────────────────────────────

const FinishedTournamentCard = memo(function FinishedTournamentCard({
  s, onAnalytics,
}: { s: FinishedSummary; onAnalytics: () => void }) {
  const [hovered, setHovered] = useState(false)

  const ts = s.finished_at ? new Date(s.finished_at) : null
  const timeLabel = ts
    ? `${(ts.getMonth() + 1).toString().padStart(2, '0')}/${ts.getDate().toString().padStart(2, '0')} ${ts.getHours().toString().padStart(2, '0')}:${ts.getMinutes().toString().padStart(2, '0')}`
    : '—'

  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background: hovered ? 'rgba(19,19,42,0.75)' : 'rgba(19,19,42,0.45)',
        border: `1px solid ${hovered ? 'rgba(168,179,196,0.2)' : 'rgba(168,179,196,0.1)'}`,
        borderRadius: 10, padding: '10px 12px', marginBottom: 6, transition: 'all 0.15s', opacity: 0.9 }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, padding: '2px 7px',
          borderRadius: 4, color: C.muted, background: 'rgba(168,179,196,0.1)', fontFamily: C.font }}>
          DONE
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.85 }}>
          {s.name}
        </span>
        <span style={{ fontSize: 10, color: C.muted, flexShrink: 0, fontFamily: 'monospace' }}>{timeLabel}</span>
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', gap: 10, fontSize: 11, color: C.muted, marginBottom: 8, flexWrap: 'wrap' }}>
        <span>👑 {s.winner_bot_name ?? '—'}</span>
        {s.prize_pool > 0 && <span>💰 ${s.prize_pool.toLocaleString()}</span>}
        <span>👥 {s.entries_count} entrants</span>
      </div>

      {/* Quick Analytics button */}
      <button onClick={onAnalytics} style={{
        width: '100%', padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 600,
        cursor: 'pointer', border: '1px solid rgba(0,229,255,0.2)', background: 'rgba(0,229,255,0.05)',
        color: 'rgba(0,229,255,0.7)', fontFamily: C.font, transition: 'all 0.15s',
        ...(hovered ? { background: 'rgba(0,229,255,0.1)', color: C.accent, border: '1px solid rgba(0,229,255,0.3)' } : {}),
      }}>
        📊 Quick Analytics
      </button>
    </div>
  )
})

// ─── Quick Analytics Panel ────────────────────────────────────────────────────

interface ResultEntry {
  rank: number
  botName: string
  userName: string
  payout: number
  isTied?: boolean
}

interface AnalyticsResult {
  tournamentName: string
  finishedAt: string | null
  totalEntries: number
  results: ResultEntry[]
}

function QuickAnalyticsPanel({ tournamentId, onClose }: { tournamentId: string; onClose: () => void }) {
  const [data, setData]     = useState<AnalyticsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    api.get<{ tournamentName: string; finishedAt: string | null; totalEntries: number; results: Array<{ rank: number; botName: string; userName: string; payout: number; isTied?: boolean }> }>(
      `/tournaments/${tournamentId}/results`
    ).then(res => {
      if (!cancelled) setData({
        tournamentName: res.data.tournamentName,
        finishedAt: res.data.finishedAt,
        totalEntries: res.data.totalEntries,
        results: res.data.results,
      })
    }).catch((e: any) => {
      if (!cancelled) setError(e?.response?.data?.message ?? 'Failed to load results')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [tournamentId])

  const podiumColors = ['#ffd700', '#c0c0c0', '#cd7f32']

  return (
    <div style={{ background: 'rgba(19,19,42,0.85)', backdropFilter: 'blur(12px)',
      border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 14, padding: 20, fontFamily: C.font }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>
            📊 Quick Analytics
          </div>
          {data && (
            <div style={{ fontSize: 12, color: C.muted }}>
              {data.tournamentName}
              {data.finishedAt && (
                <span style={{ marginLeft: 8 }}>
                  · {new Date(data.finishedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          )}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted,
          fontSize: 18, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>×</button>
      </div>

      {loading && <div style={{ color: C.muted, fontSize: 13 }}>Loading results…</div>}
      {error && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: C.dangerDim,
          color: C.danger, fontSize: 12 }}>{error}</div>
      )}

      {data && !loading && (
        <>
          {/* Summary stats */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: C.muted }}>
              <span style={{ color: C.text, fontWeight: 700 }}>{data.totalEntries}</span> entrants
            </div>
            {data.results[0] && data.results[0].payout > 0 && (
              <div style={{ fontSize: 11, color: C.muted }}>
                Prize pool: <span style={{ color: C.warning, fontWeight: 700 }}>
                  ${data.results.reduce((sum, r) => sum + r.payout, 0).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* Top finishers */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
            {data.results.slice(0, 5).map((r, i) => (
              <div key={r.rank} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', borderRadius: 8,
                background: i === 0 ? 'rgba(255,215,0,0.07)' : i === 1 ? 'rgba(192,192,192,0.04)' : i === 2 ? 'rgba(205,127,50,0.04)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${i < 3 ? `${podiumColors[i]}22` : 'rgba(255,255,255,0.04)'}`,
              }}>
                <span style={{ fontSize: 13, width: 22, flexShrink: 0, fontWeight: 700,
                  color: i < 3 ? podiumColors[i] : C.muted }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${r.rank}`}
                </span>
                <span style={{ flex: 1, fontSize: 12, color: C.text, fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.botName}
                </span>
                <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>{r.userName}</span>
                {r.payout > 0 && (
                  <span style={{ fontSize: 11, color: C.warning, fontWeight: 700, flexShrink: 0, fontFamily: 'monospace' }}>
                    +${r.payout.toLocaleString()}
                  </span>
                )}
              </div>
            ))}
            {data.results.length > 5 && (
              <div style={{ fontSize: 10, color: C.muted, textAlign: 'center', padding: '4px 0' }}>
                +{data.results.length - 5} more finishers
              </div>
            )}
          </div>

          {/* Full results link */}
          <a href={`/tournaments/${tournamentId}/results`}
            style={{ display: 'block', textAlign: 'center', fontSize: 12, color: C.muted,
              textDecoration: 'none', padding: '8px', borderRadius: 8,
              border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.02)',
              transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = C.accent; e.currentTarget.style.borderColor = 'rgba(0,229,255,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border }}>
            View Full Results →
          </a>
        </>
      )}
    </div>
  )
}

// ─── Tournament Row ───────────────────────────────────────────────────────────

const TournamentRow = memo(function TournamentRow({ t, busyId, liveState, telemetryData, onInject, onSeedingMap, onBalancingMoves, onStart, onCancel }: {
  t: Tournament
  busyId: string | null
  liveState?: TournamentState
  telemetryData?: TelemetryData
  onInject: () => void
  onSeedingMap: () => void
  onBalancingMoves: () => void
  onStart: (id: string) => void
  onCancel: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const [prizeInfo, setPrizeInfo] = useState<{ pool: number; firstPlace: number } | null>(null)

  useEffect(() => {
    if (t.buy_in === 0 || t.entries_count === 0) { setPrizeInfo(null); return }
    const pool = t.buy_in * t.entries_count
    api.get<{ payouts: Array<{ rank: number; amount: number; percentage: number }> }>(
      `/tournaments/admin/prize-preview?pool=${pool}&players=${t.entries_count}`
    ).then(res => {
      if (res.data.payouts.length > 0) {
        setPrizeInfo({ pool, firstPlace: res.data.payouts[0].amount })
      }
    }).catch(() => setPrizeInfo(null))
  }, [t.buy_in, t.entries_count])

  const isRegistering = t.status === 'registering'
  const isLive        = t.status === 'running' || t.status === 'final_table'
  const isFinalTable  = t.status === 'final_table'
  const isFinished    = t.status === 'finished'
  const fillPct = t.max_players > 0 ? Math.round((t.entries_count / t.max_players) * 100) : 0

  // Top stacks: prefer socket topStacks, fallback to liveState.topPlayers
  const topStacks = telemetryData?.topStacks ?? liveState?.topPlayers ?? []

  const chip = (text: string, highlight = false) => (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4,
      background: highlight ? 'rgba(0,229,255,0.1)' : 'rgba(0,0,0,0.3)',
      color: highlight ? C.accent : C.muted, border: highlight ? '1px solid rgba(0,229,255,0.2)' : 'none' }}>
      {text}
    </span>
  )

  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background: hovered ? 'rgba(22,22,48,0.9)' : 'rgba(19,19,42,0.6)',
        border: `1px solid ${isLive ? 'rgba(0,229,255,0.15)' : isFinished ? 'rgba(168,179,196,0.12)' : hovered ? 'rgba(0,229,255,0.2)' : C.border}`,
        borderRadius: 10, padding: isFinished ? '9px 12px' : '12px 14px', marginBottom: 6, transition: 'all 0.15s',
        opacity: isFinished ? 0.75 : 1 }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {/* Live / Final Table indicator dot */}
        {isLive && (
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: isFinalTable ? C.warning : C.success,
            animation: isFinalTable ? 'finalTableRing 1.4s ease-in-out infinite' : 'telemetryPulse 2s ease-in-out infinite',
          }} />
        )}
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
        <StatusBadge status={t.status} />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: prizeInfo ? 4 : 8, flexWrap: 'wrap' }}>
        {chip(`${t.entries_count}/${t.max_players}`)}
        {chip(`${t.players_per_table}-max`)}
        {t.buy_in > 0 && chip(`$${t.buy_in}`)}
      </div>
      {prizeInfo && (
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
          Prize pool:{' '}
          <span style={{ color: C.text, fontWeight: 600 }}>${prizeInfo.pool.toLocaleString()}</span>
          {' · '}1st:{' '}
          <span style={{ color: '#ffd700', fontWeight: 700 }}>${prizeInfo.firstPlace.toLocaleString()}</span>
        </div>
      )}

      {/* ── Telemetry Panel (LIVE) ─────────────────────────────────────── */}
      {isLive && liveState && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${isFinalTable ? 'rgba(245,158,11,0.2)' : 'rgba(0,229,255,0.12)'}`,
          borderRadius: 8, padding: '10px 12px', marginBottom: 10,
        }}>

          {/* Status label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: isFinalTable ? C.warning : C.success,
              animation: isFinalTable ? 'finalTableRing 1.4s infinite' : 'telemetryPulse 2s infinite',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase',
              color: isFinalTable ? C.warning : C.success }}>
              {isFinalTable ? 'Final Table' : 'Processing'}
            </span>
            {liveState._stale && (
              <span style={{ marginLeft: 'auto', fontSize: 9, color: C.warning, fontStyle: 'italic' }}>⚠ snapshot</span>
            )}
          </div>

          {/* Hands played + player counts */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 9, color: C.muted, fontFamily: 'monospace' }}>
              {liveState.totalEntrants - liveState.playersRemaining} eliminated
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.accent, fontFamily: 'monospace' }}>
              {telemetryData?.handsProcessed?.toLocaleString() ?? '—'} hands
            </span>
            <span style={{ fontSize: 9, color: C.muted, fontFamily: 'monospace' }}>
              {liveState.playersRemaining} remain
            </span>
          </div>

          {/* Telemetry grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6, marginBottom: 10 }}>
            {/* Tables */}
            <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 3 }}>Tables</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: 'monospace' }}>
                {liveState.tables?.length ?? '—'}
              </div>
              <div style={{ fontSize: 8, color: C.muted }}>active</div>
            </div>

            {/* Level */}
            <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 3 }}>Level</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.accent, fontFamily: 'monospace' }}>
                {liveState.level ?? '—'}
              </div>
              <div style={{ fontSize: 8, color: C.muted }}>
                {liveState.blinds ? `${liveState.blinds.small}/${liveState.blinds.big}` : 'blinds'}
              </div>
            </div>
          </div>

          {/* Leaderboard snippet — top 3 bots */}
          <div>
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 }}>
              Top Stacks
            </div>
            {topStacks.length > 0 ? (
              topStacks.slice(0, 3).map((p, i) => (
                <div key={p.rank} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
                  background: i === 0 ? 'rgba(0,229,255,0.06)' : 'rgba(0,0,0,0.15)',
                  borderRadius: 5, padding: '4px 8px' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: i === 0 ? C.accent : C.muted,
                    width: 14, flexShrink: 0 }}>#{p.rank}</span>
                  <span style={{ fontSize: 11, color: C.text, flex: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.botName}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.accent, fontFamily: 'monospace', flexShrink: 0 }}>
                    {p.chips.toLocaleString()}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {[1, 2, 3].map(i => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6,
                    background: 'rgba(0,0,0,0.15)', borderRadius: 5, padding: '4px 8px' }}>
                    <span style={{ fontSize: 9, color: C.muted, width: 14 }}>#{i}</span>
                    <div style={{ flex: 1, height: 7, background: 'rgba(168,179,196,0.1)', borderRadius: 3 }} />
                    <span style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>—</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Level progress bar */}
          {liveState.handsPerLevel != null && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 9, color: C.muted }}>Next Level</span>
                <span style={{ fontSize: 9, color: C.accent, fontFamily: 'monospace', fontWeight: 700 }}>
                  Lv {(liveState.level ?? 1) + 1} in {Math.max(0, (liveState.handsPerLevel ?? 0) - (liveState.handsThisLevel ?? 0))} hands
                </span>
              </div>
              <div style={{ height: 2, background: 'rgba(30,30,63,0.8)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, Math.round(((liveState.handsThisLevel ?? 0) / liveState.handsPerLevel) * 100))}%`,
                  height: '100%', borderRadius: 2, background: 'rgba(168,179,196,0.4)', transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          )}

          {/* Badges row */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {liveState.blinds?.ante != null && liveState.blinds.ante > 0 && chip(`Ante ${liveState.blinds.ante}`)}
            {liveState.handForHand && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                background: 'rgba(245,158,11,0.15)', color: C.warning, border: '1px solid rgba(245,158,11,0.3)' }}>
                ⚡ HAND-FOR-HAND
              </span>
            )}
            {(liveState.tables?.length ?? 0) > 1 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                background: 'rgba(0,229,255,0.1)', color: C.accent, border: '1px solid rgba(0,229,255,0.25)' }}>
                ⚖ Balancing Active
              </span>
            )}
          </div>

          {/* Table labels — live view removed, Replay System coming soon */}
          {liveState.tables && liveState.tables.length > 0 && (
            <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
              {liveState.tables.map(table => (
                <span key={table.tableId}
                  style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 4,
                    background: 'rgba(255,255,255,0.04)', color: C.muted,
                    border: '1px solid rgba(255,255,255,0.1)' }}>
                  T{table.tableNumber}{table.isFinalTable ? ' ★' : ''} · Replay Soon
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {isLive && !liveState && (
        <div style={{ fontSize: 11, color: C.muted, padding: '4px 0 8px', fontStyle: 'italic' }}>Loading telemetry…</div>
      )}

      {isRegistering && (
        <div style={{ height: 3, background: 'rgba(30,30,63,0.8)', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{ width: `${fillPct}%`, height: '100%', borderRadius: 2,
            background: fillPct >= 90 ? C.success : fillPct >= 50 ? C.accent : C.muted, transition: 'width 0.4s ease' }} />
        </div>
      )}

      {/* ── History card footer (FINISHED) ────────────────────────────── */}
      {isFinished && (
        <a href={`/tournaments/${t.id}/results`}
          style={{ display: 'block', fontSize: 10, color: C.muted, textDecoration: 'none',
            letterSpacing: 0.6, marginBottom: 4, cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.color = C.accent)}
          onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>
          Stats Summary →
        </a>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        {isRegistering && (
          <button onClick={onInject} style={{ flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 11, fontWeight: 600,
            cursor: 'pointer', border: '1px solid rgba(0,229,255,0.3)', background: 'rgba(0,229,255,0.08)',
            color: C.accent, fontFamily: C.font, transition: 'all 0.15s' }}>
            🤖 Manage Bots
          </button>
        )}
        {(isRegistering || isLive) && (
          <button onClick={onSeedingMap}
            style={{ padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              border: '1px solid rgba(168,179,196,0.25)', background: 'rgba(168,179,196,0.06)',
              color: C.muted, fontFamily: C.font, transition: 'all 0.15s' }}>
            🗺 Seeding
          </button>
        )}
        {isLive && (liveState?.tables?.length ?? 0) > 1 && (
          <button onClick={onBalancingMoves}
            style={{ padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              border: '1px solid rgba(0,229,255,0.25)', background: 'rgba(0,229,255,0.06)',
              color: C.accent, fontFamily: C.font, transition: 'all 0.15s' }}>
            ⚖ Moves
          </button>
        )}
        {isRegistering && (
          <button onClick={() => onStart(t.id)} disabled={busyId === `start-${t.id}`}
            style={{ flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              border: '1px solid rgba(0,229,255,0.5)',
              background: 'linear-gradient(90deg,rgba(0,229,255,0.15),rgba(0,112,255,0.15))',
              color: C.accent, fontFamily: C.font, boxShadow: '0 0 10px rgba(0,229,255,0.2)',
              opacity: busyId === `start-${t.id}` ? 0.5 : 1 }}>
            {busyId === `start-${t.id}` ? '…' : '⚡ GO LIVE'}
          </button>
        )}
        {!isFinished && (
          <button onClick={() => onCancel(t.id)} disabled={busyId === `cancel-${t.id}`}
            style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              border: '1px solid rgba(226,75,74,0.3)', background: 'rgba(226,75,74,0.06)',
              color: C.danger, fontFamily: C.font, opacity: busyId === `cancel-${t.id}` ? 0.5 : 1 }}>
            {busyId === `cancel-${t.id}` ? '…' : 'Cancel'}
          </button>
        )}
      </div>
    </div>
  )
})
