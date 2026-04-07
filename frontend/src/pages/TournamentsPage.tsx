import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/axios'
import { useAuthStore } from '../store/authStore'
import { Sidebar } from '../components/Sidebar'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TournamentEntry {
  id: string
  user_id: string
  bot_id: string
  user?: { name: string }
  bot?: { name: string }
}

interface Tournament {
  id: string
  name: string
  description?: string
  type: 'rolling' | 'scheduled'
  status: 'registering' | 'running' | 'final_table' | 'finished' | 'cancelled'
  buy_in: number
  starting_chips: number
  scheduled_start_at?: string
  finished_at?: string
  players_per_table: number
  max_participants?: number
  current_participants?: number
  registered_count?: number
  rebuys_allowed?: boolean
  entries?: TournamentEntry[]
}

interface WinnerInfo {
  botName: string
  totalEntries: number
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#09090b',
  card: 'rgba(18,18,27,0.50)',
  cardHover: 'rgba(28,28,44,0.65)',
  border: 'rgba(255,255,255,0.08)',
  accent: '#00f5ff',
  accentDim: 'rgba(0,245,255,0.08)',
  text: '#ffffff',
  muted: '#a8b3c4',
  danger: '#e24b4a',
  success: '#1d9e75',
  warning: '#f59e0b',
  gold: '#ffd700',
  font: "'Trebuchet MS', sans-serif",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCountdown(scheduledAt?: string): string {
  if (!scheduledAt) return 'Starting soon'
  const startTime = new Date(scheduledAt)
  if (isNaN(startTime.getTime())) return 'Starting soon'
  const now = new Date()
  const diff = startTime.getTime() - now.getTime()
  if (diff < 0) return 'Starting soon'
  const totalSeconds = Math.floor(diff / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ${hours % 24}h`
  const mins = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${mins}m`
  const secs = totalSeconds % 60
  return `${mins}m ${secs}s`
}

function getStatusBadge(status: Tournament['status']) {
  switch (status) {
    case 'registering':
      return { text: 'Registration Open', color: C.success, bg: 'rgba(29,158,117,0.1)' }
    case 'running':
      return { text: 'In Progress', color: C.warning, bg: 'rgba(245,158,11,0.1)' }
    case 'final_table':
      return { text: 'Final Table', color: C.accent, bg: C.accentDim }
    case 'finished':
      return { text: 'Finished', color: C.muted, bg: 'rgba(156,163,175,0.1)' }
    default:
      return { text: 'Cancelled', color: C.danger, bg: 'rgba(226,75,74,0.1)' }
  }
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ width = '100%', height = 14, radius = 4 }: { width?: number | string; height?: number; radius?: number }) {
  return (
    <div
      className="animate-pulse"
      style={{ width, height, borderRadius: radius, background: 'rgba(255,255,255,0.06)', display: 'inline-block' }}
    />
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ icon, label, count }: { icon: string; label: string; count?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
      <div
        style={{
          width: 3,
          height: 20,
          borderRadius: 2,
          background: `linear-gradient(180deg, ${C.accent}, #0070ff)`,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 11, marginRight: -4 }}>{icon}</span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: C.muted,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          fontFamily: C.font,
        }}
      >
        {label}
      </span>
      {count !== undefined && (
        <span
          style={{
            fontSize: 11,
            color: C.muted,
            background: C.border,
            padding: '1px 7px',
            borderRadius: 10,
            fontFamily: C.font,
          }}
        >
          {count}
        </span>
      )}
    </div>
  )
}

// ─── Featured tournament card ─────────────────────────────────────────────────

function FeaturedCard({
  tournament,
  isRegistered,
  onClick,
}: {
  tournament: Tournament
  isRegistered: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const [, setTick] = useState(0)

  // Tick every second to keep countdown live
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const status = getStatusBadge(tournament.status)
  const countdown = getCountdown(tournament.scheduled_start_at)
  const startTime = tournament.scheduled_start_at ? new Date(tournament.scheduled_start_at) : null
  const canRegister = tournament.status === 'registering' && !isRegistered

  return (
    <div
      onClick={onClick}
      style={{
        background: hovered
          ? 'linear-gradient(135deg, rgba(28,28,44,0.9) 0%, rgba(14,14,28,0.9) 100%)'
          : 'linear-gradient(135deg, rgba(18,18,27,0.7) 0%, rgba(9,9,11,0.9) 100%)',
        border: `1px solid ${C.accent}`,
        borderRadius: 16,
        padding: '28px 32px',
        cursor: 'pointer',
        transition: 'all 0.25s',
        fontFamily: C.font,
        boxShadow: hovered
          ? `0 0 0 1px ${C.accent}, 0 0 40px rgba(0,245,255,0.2)`
          : `0 0 0 1px ${C.accent}, 0 0 20px rgba(0,245,255,0.1)`,
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Subtle glow overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 300,
          height: 300,
          background: 'radial-gradient(circle at 80% 20%, rgba(0,245,255,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        {/* Left: info */}
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 22 }}>🏆</span>
            <span
              style={{
                padding: '3px 10px',
                borderRadius: 6,
                background: status.bg,
                color: status.color,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {status.text}
            </span>
          </div>

          <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 6, letterSpacing: '-0.02em' }}>
            {tournament.name}
          </div>
          {tournament.description && (
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 16, maxWidth: 420 }}>
              {tournament.description}
            </div>
          )}

          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
                Starting Chips
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                {tournament.starting_chips.toLocaleString()}
              </div>
            </div>
            {(tournament.registered_count !== undefined || tournament.current_participants !== undefined) && (
              <div>
                <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
                  Registered
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                  {tournament.registered_count ?? tournament.current_participants ?? 0}
                  {tournament.max_participants ? ` / ${tournament.max_participants}` : ''}
                </div>
              </div>
            )}
            {tournament.buy_in > 0 && (
              <div>
                <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
                  Est. Prize Pool
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                  ${((tournament.registered_count ?? tournament.current_participants ?? 0) * tournament.buy_in).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: countdown + CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, minWidth: 160 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
              {tournament.status === 'registering' ? 'Starts in' : 'Status'}
            </div>
            <div
              style={{
                fontSize: 38,
                fontWeight: 800,
                color: C.accent,
                letterSpacing: '-0.03em',
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {countdown}
            </div>
            {startTime && !isNaN(startTime.getTime()) && (
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                {startTime.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>

          <button
            style={{
              padding: '10px 22px',
              borderRadius: 8,
              background: canRegister || (isRegistered && (tournament.status === 'running' || tournament.status === 'final_table'))
                ? 'linear-gradient(90deg, #00f5ff, #0070ff)'
                : C.border,
              border: isRegistered && tournament.status === 'registering' ? `1px solid ${C.border}` : 'none',
              color: canRegister || (isRegistered && (tournament.status === 'running' || tournament.status === 'final_table')) ? '#000' : C.muted,
              fontWeight: 700,
              fontSize: 13,
              fontFamily: C.font,
              cursor: 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
            onClick={(e) => {
              e.stopPropagation()
              onClick()
            }}
          >
            {isRegistered
              ? (tournament.status === 'running' || tournament.status === 'final_table' ? 'Watch Live' : 'Registered ✅')
              : (canRegister ? 'Register Now' : 'View Details')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Regular tournament card (secondary) ─────────────────────────────────────

function TournamentCard({
  tournament,
  onClick,
  isRegistered,
}: {
  tournament: Tournament
  onClick: () => void
  isRegistered?: boolean
}) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const status = getStatusBadge(tournament.status)
  const canRegister = tournament.status === 'registering' && !isRegistered
  const startTime = tournament.scheduled_start_at ? new Date(tournament.scheduled_start_at) : null

  return (
    <div
      onClick={onClick}
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: '20px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        fontFamily: C.font,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLElement).style.background = C.cardHover
        ;(e.currentTarget as HTMLElement).style.borderColor = C.accent
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.background = C.card
        ;(e.currentTarget as HTMLElement).style.borderColor = C.border
      }}
    >
      <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{tournament.name}</div>
          {tournament.description && (
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>
              {tournament.description}
            </div>
          )}
        </div>
        <div
          style={{
            padding: '3px 9px',
            borderRadius: 6,
            background: status.bg,
            color: status.color,
            fontSize: 10,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {status.text}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
            Starts in
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.accent, fontVariantNumeric: 'tabular-nums' }}>
            {getCountdown(tournament.scheduled_start_at)}
          </div>
          {startTime && !isNaN(startTime.getTime()) && (
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
              {startTime.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
            Chips
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
            {tournament.starting_chips.toLocaleString()}
          </div>
        </div>
        {tournament.buy_in > 0 && (
          <div>
            <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
              Est. Prize Pool
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
              ${((tournament.registered_count ?? tournament.current_participants ?? 0) * tournament.buy_in).toLocaleString()}
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 'auto' }}>
        <button
          style={{
            width: '100%',
            padding: '9px',
            borderRadius: 8,
            background: canRegister || (isRegistered && (tournament.status === 'running' || tournament.status === 'final_table'))
              ? 'linear-gradient(90deg, #00f5ff, #0070ff)'
              : C.border,
            border: 'none',
            color: canRegister || (isRegistered && (tournament.status === 'running' || tournament.status === 'final_table')) ? '#000' : C.muted,
            fontWeight: 700,
            fontSize: 12,
            fontFamily: C.font,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
        >
          {isRegistered ? (
            tournament.status === 'running' || tournament.status === 'final_table' ? 'Watch Live' : 'Registered ✅'
          ) : (canRegister ? 'Register Now' : 'View Details')}
        </button>
      </div>
    </div>
  )
}

// ─── Past result row ──────────────────────────────────────────────────────────

function PastResultRow({
  tournament,
  winner,
  loadingWinner,
  onViewAnalytics,
}: {
  tournament: Tournament
  winner?: WinnerInfo
  loadingWinner: boolean
  onViewAnalytics: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr 180px 80px 140px',
        alignItems: 'center',
        gap: 16,
        padding: '14px 20px',
        borderBottom: `1px solid ${C.border}`,
        background: hovered ? C.cardHover : 'transparent',
        transition: 'background 0.15s',
        fontFamily: C.font,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Date */}
      <div style={{ fontSize: 13, color: C.muted }}>
        {formatDate(tournament.finished_at)}
      </div>

      {/* Name */}
      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {tournament.name}
      </div>

      {/* Winner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13 }}>🥇</span>
        {loadingWinner ? (
          <Skeleton width={100} height={13} />
        ) : winner?.botName ? (
          <span style={{ fontSize: 13, color: C.text, fontWeight: 500, paddingRight: 4 }}>{winner.botName}</span>
        ) : (
          <span style={{ fontSize: 13, color: C.muted }}>—</span>
        )}
      </div>

      {/* Entries */}
      <div style={{ fontSize: 13, color: C.muted, textAlign: 'right' }}>
        {loadingWinner ? (
          <Skeleton width={30} height={13} />
        ) : (
          `${winner?.totalEntries ?? tournament.registered_count ?? '—'}`
        )}
      </div>

      {/* Action */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            background: 'transparent',
            border: `1px solid ${hovered ? C.accent : C.border}`,
            color: hovered ? C.accent : C.muted,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: C.font,
            cursor: 'pointer',
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
          }}
          onClick={(e) => {
            e.stopPropagation()
            onViewAnalytics()
          }}
        >
          View Analytics
        </button>
      </div>
    </div>
  )
}

// ─── Past results table header ────────────────────────────────────────────────

function PastResultsHeader() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr 180px 80px 140px',
        gap: 16,
        padding: '10px 20px',
        borderBottom: `1px solid ${C.border}`,
        fontFamily: C.font,
      }}
    >
      {['Date', 'Tournament', 'Winner', 'Entries', ''].map((label, i) => (
        <div
          key={i}
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.muted,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            textAlign: i === 3 ? 'right' : 'left',
          }}
        >
          {label}
        </div>
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TournamentsPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [upcoming, setUpcoming] = useState<Tournament[]>([])
  const [loadingUpcoming, setLoadingUpcoming] = useState(true)

  const [pastList, setPastList] = useState<Tournament[]>([])
  const [loadingPast, setLoadingPast] = useState(true)
  const [winnerMap, setWinnerMap] = useState<Map<string, WinnerInfo>>(new Map())
  const [loadingWinners, setLoadingWinners] = useState(false)

  const [error, setError] = useState('')

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isUserRegistered = (tournament: Tournament) => {
    if (!user) return false
    return tournament.entries?.some((e) => e.user_id === user.id) ?? false
  }

  const handleTournamentClick = (tournament: Tournament) => {
    const isRegistered = isUserRegistered(tournament)
    if (isRegistered) {
      if (tournament.status === 'running' || tournament.status === 'final_table') {
        navigate(`/tournaments/${tournament.id}/live`)
      } else {
        navigate(`/tournaments/${tournament.id}/lobby`)
      }
    } else {
      navigate(`/tournaments/${tournament.id}`)
    }
  }

  async function fetchUpcoming() {
    try {
      const res = await api.get('/tournaments/scheduled/upcoming')
      const data = res.data
      const list: Tournament[] = Array.isArray(data) ? data : data.data ?? data.tournaments ?? []
      list.sort((a, b) => {
        const aTime = a.scheduled_start_at ? new Date(a.scheduled_start_at).getTime() : Infinity
        const bTime = b.scheduled_start_at ? new Date(b.scheduled_start_at).getTime() : Infinity
        return aTime - bTime
      })
      setUpcoming(list)
    } catch {
      setError('Failed to load upcoming tournaments')
    } finally {
      setLoadingUpcoming(false)
    }
  }

  async function fetchPast() {
    try {
      const res = await api.get('/tournaments', { params: { status: 'finished', limit: 20 } })
      const data = res.data
      const list: Tournament[] = Array.isArray(data) ? data : data.data ?? data.tournaments ?? []
      // Sort newest first
      list.sort((a, b) => {
        const aTime = a.finished_at ? new Date(a.finished_at).getTime() : 0
        const bTime = b.finished_at ? new Date(b.finished_at).getTime() : 0
        return bTime - aTime
      })
      setPastList(list)

      // Fetch winner info for each past tournament
      if (list.length > 0) {
        setLoadingWinners(true)
        const results = await Promise.allSettled(
          list.map((t) => api.get(`/tournaments/${t.id}/results`))
        )
        const map = new Map<string, WinnerInfo>()
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') {
            const d = r.value.data
            const winner = d.results?.find((e: { rank: number }) => e.rank === 1)
            map.set(list[i].id, {
              botName: winner?.botName ?? '—',
              totalEntries: d.totalEntries ?? 0,
            })
          }
        })
        setWinnerMap(map)
        setLoadingWinners(false)
      }
    } catch {
      // Past results section silently fails
    } finally {
      setLoadingPast(false)
    }
  }

  useEffect(() => {
    fetchUpcoming()
    fetchPast()

    pollRef.current = setInterval(() => {
      fetchUpcoming()
    }, 10_000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const featured = upcoming[0] ?? null
  const secondary = upcoming.slice(1)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: C.font }}>
      <Sidebar />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '16px 28px',
            borderBottom: `1px solid ${C.border}`,
            background: C.bg,
          }}
        >
          <span style={{ fontSize: 18 }}>🏆</span>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>Tournament Hub</div>
        </div>

        {/* Main content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '28px' }}>
          {error && (
            <div
              style={{
                background: 'rgba(226,75,74,0.1)',
                border: `1px solid ${C.danger}`,
                borderRadius: 8,
                padding: '12px 16px',
                color: C.danger,
                fontSize: 13,
                marginBottom: 20,
              }}
            >
              {error}
            </div>
          )}

          {/* ── Upcoming ── */}
          <div style={{ marginBottom: 48 }}>
            <SectionHeader icon="📅" label="Upcoming" count={upcoming.length} />

            {loadingUpcoming ? (
              <div
                style={{
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 16,
                  padding: '28px 32px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
                className="animate-pulse"
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 22, height: 22, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
                  <div style={{ width: 100, height: 16, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
                </div>
                <div style={{ width: '60%', height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)' }} />
                <div style={{ width: '40%', height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
              </div>
            ) : featured ? (
              <>
                <FeaturedCard
                  tournament={featured}
                  isRegistered={isUserRegistered(featured)}
                  onClick={() => handleTournamentClick(featured)}
                />

                {secondary.length > 0 && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                      gap: 16,
                      marginTop: 16,
                    }}
                  >
                    {secondary.map((t) => (
                      <TournamentCard
                        key={t.id}
                        tournament={t}
                        isRegistered={isUserRegistered(t)}
                        onClick={() => handleTournamentClick(t)}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: '48px 20px',
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 16,
                }}
              >
                <div style={{ fontSize: 40, marginBottom: 12 }}>🏆</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>
                  No tournaments scheduled
                </div>
                <div style={{ fontSize: 13, color: C.muted }}>
                  Check back soon — the next Daily Master is on its way.
                </div>
              </div>
            )}
          </div>

          {/* ── Past Results ── */}
          <div>
            <SectionHeader icon="📋" label="Past Results" count={pastList.length} />

            <div
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              {loadingPast ? (
                <div style={{ padding: '20px' }}>
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="animate-pulse"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '140px 1fr 180px 80px 140px',
                        gap: 16,
                        padding: '16px 20px',
                        borderBottom: i < 3 ? `1px solid ${C.border}` : 'none',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ height: 13, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
                      <div style={{ height: 13, borderRadius: 4, background: 'rgba(255,255,255,0.06)', width: '70%' }} />
                      <div style={{ height: 13, borderRadius: 4, background: 'rgba(255,255,255,0.06)', width: '60%' }} />
                      <div style={{ height: 13, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
                      <div style={{ height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.06)' }} />
                    </div>
                  ))}
                </div>
              ) : pastList.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '48px 20px',
                    color: C.muted,
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                  <div style={{ fontSize: 14, color: C.muted }}>No completed tournaments yet.</div>
                </div>
              ) : (
                <>
                  <PastResultsHeader />
                  {pastList.map((t) => (
                    <PastResultRow
                      key={t.id}
                      tournament={t}
                      winner={winnerMap.get(t.id)}
                      loadingWinner={loadingWinners && !winnerMap.has(t.id)}
                      onViewAnalytics={() => navigate(`/games?id=${t.id}`)}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
