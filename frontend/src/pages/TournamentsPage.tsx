import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../lib/axios'
import { useAuthStore } from '../store/authStore'

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
  players_per_table: number
  max_participants?: number
  current_participants?: number
  registered_count?: number
  late_registration?: boolean
  rebuys_allowed?: boolean
  entries?: TournamentEntry[]
}

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

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function Skeleton({ width = '100%', height = 20, radius = 6 }: { width?: number | string; height?: number; radius?: number }) {
  return (
    <div
      className="animate-pulse"
      style={{ width, height, borderRadius: radius, background: '#1e1e3f' }}
    />
  )
}

function SkeletonCard() {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Skeleton width="70%" height={18} />
      <Skeleton width="100%" height={14} />
      <Skeleton width="60%" height={14} />
    </div>
  )
}

// ─── Tournament card ──────────────────────────────────────────────────────────

function TournamentCard({
  tournament,
  onClick,
  isRegistered,
}: {
  tournament: Tournament
  onClick: () => void
  isRegistered?: boolean
}) {
  const startTime = tournament.scheduled_start_at
    ? new Date(tournament.scheduled_start_at)
    : null

  // Calculate time until start
  const getCountdown = () => {
    if (!startTime) return 'Open'
    const now = new Date()
    const diff = startTime.getTime() - now.getTime()
    if (diff < 0) return 'Started'
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)
    if (days > 0) return `${days}d ${hours % 24}h`
    return `${hours}h`
  }

  // Status badge
  const getStatusBadge = () => {
    switch (tournament.status) {
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

  const status = getStatusBadge()
  const canRegister = tournament.status === 'registering' && !isRegistered

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
        (e.currentTarget as HTMLElement).style.background = C.cardHover
        ;(e.currentTarget as HTMLElement).style.borderColor = C.accent
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = C.card
        ;(e.currentTarget as HTMLElement).style.borderColor = C.border
      }}
    >
      <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{tournament.name}</div>
          {tournament.description && (
            <div style={{ fontSize: 13, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>
              {tournament.description}
            </div>
          )}
        </div>
        <div
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            background: status.bg,
            color: status.color,
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {status.text}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Status
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
            {isRegistered ? '✓ Registered' : 'Available'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Starts in
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.accent }}>{getCountdown()}</div>
          {startTime && (
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              {startTime.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Starting Chips
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
            {tournament.starting_chips.toLocaleString()}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 'auto' }}>
        <button
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: 8,
            background: canRegister ? 'linear-gradient(90deg, #00e5ff, #0070ff)' : C.border,
            border: 'none',
            color: canRegister ? '#000' : C.muted,
            fontWeight: 700,
            fontSize: 13,
            fontFamily: C.font,
            cursor: canRegister ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
          }}
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
        >
          {canRegister ? 'View Details' : isRegistered ? 'View Details' : 'View Details'}
        </button>
      </div>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ collapsed = false, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const NAV_ICONS = {
    Home: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
    'My Bots': (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
    Tournaments: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <circle cx="3" cy="6" r="1" fill="currentColor" />
        <circle cx="3" cy="12" r="1" fill="currentColor" />
        <circle cx="3" cy="18" r="1" fill="currentColor" />
      </svg>
    ),
    'Live Games': (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
      </svg>
    ),
  }

  const NAV = [
    { label: 'Home', path: '/' },
    { label: 'My Bots', path: '/bots' },
    { label: 'Tournaments', path: '/tournaments' },
    { label: 'Live Games', path: '/games' },
  ]

  return (
    <div
      style={{
        width: collapsed ? 60 : 210,
        minHeight: '100vh',
        background: '#0d0d22',
        borderRight: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        transition: 'width 0.2s',
        fontFamily: C.font,
        overflow: 'visible',
      }}
    >
      <div style={{ padding: collapsed ? '12px 12px 8px' : '28px 20px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        {!collapsed && (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', lineHeight: 1.1 }}>
              <span style={{ color: C.text }}>Bot</span>
              <span style={{ color: C.accent }}>Royale</span>
            </div>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginTop: 6, whiteSpace: 'nowrap' }}>
              Automate. Compete. Win.
            </div>
          </>
        )}
        {collapsed && (
          <div style={{ fontSize: 16, color: C.accent }}>◆</div>
        )}
      </div>

      <nav style={{ flex: 1, padding: '20px 0', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'visible' }}>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleCollapse() }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = C.accent
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = 'rgba(0, 229, 255, 0.5)'
          }}
          style={{
            position: 'absolute', right: '-17px', top: '50%', transform: 'translateY(-50%)',
            width: 34, height: 34,
            background: 'transparent', border: 'none',
            color: 'rgba(0, 229, 255, 0.5)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 'bold', transition: 'color 0.2s', zIndex: 10, padding: 0,
            pointerEvents: 'auto',
          }}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '»' : '«'}
        </button>
        {NAV.map(({ label, path }, idx) => {
          const active = location.pathname === path
          return (
            <div key={path}>
              <button
                onClick={() => navigate(path)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: collapsed ? 0 : 10,
                  width: '100%', padding: collapsed ? '10px 0' : '10px 20px',
                  background: active ? C.accentDim : 'transparent',
                  border: 'none', borderLeft: collapsed ? 'none' : `3px solid ${active ? C.accent : 'transparent'}`,
                  color: active ? C.text : C.muted,
                  fontSize: 14, fontFamily: C.font, cursor: 'pointer',
                  textAlign: 'left', transition: 'all 0.15s',
                }}
              >
                <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {NAV_ICONS[label as keyof typeof NAV_ICONS]}
                </span>
                {!collapsed && label}
              </button>
            </div>
          )
        })}
      </nav>

      <div style={{ padding: collapsed ? '20px 4px' : '16px 20px', borderTop: `1px solid ${C.border}`, position: 'relative' }}>
        <button
          onClick={() => setDropdownOpen((o) => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 10,
            width: '100%',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #00e5ff, #0070ff)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              color: '#000',
              flexShrink: 0,
            }}
          >
            {(user?.name?.[0] ?? '?').toUpperCase()}
          </div>
            <div style={{ overflow: 'hidden', flex: 1, textAlign: 'left' }}>
              <div style={{ fontSize: 13, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name ?? 'Player'}
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>{user?.role ?? 'user'}</div>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
        </button>
        {dropdownOpen && !collapsed && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 12,
              right: 12,
              marginBottom: 6,
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }}
          >
            <button
              onClick={() => {
                setDropdownOpen(false)
                logout()
              }}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                color: C.danger,
                fontSize: 13,
                fontFamily: C.font,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TournamentsPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('tournaments_sidebar_collapsed')
    return saved !== null ? JSON.parse(saved) : false
  })
  // Always sort by start time
  const sortBy = 'start'

  useEffect(() => {
    fetchTournaments()
    // Poll for new tournaments every 10 seconds
    const pollInterval = setInterval(() => {
      fetchTournaments()
    }, 10000)
    return () => clearInterval(pollInterval)
  }, [])

  async function fetchTournaments() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/tournaments/scheduled/upcoming')
      const data = res.data
      const list = Array.isArray(data) ? data : data.data ?? data.tournaments ?? []
      setTournaments(list)
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to load tournaments'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const newVal = !prev
      localStorage.setItem('tournaments_sidebar_collapsed', JSON.stringify(newVal))
      return newVal
    })
  }

  const isUserRegistered = (tournament: Tournament) => {
    if (!user) return false
    return tournament.entries?.some((e) => e.user_id === user.id) ?? false
  }

  const sortedTournaments = [...tournaments].sort((a, b) => {
    const aTime = a.scheduled_start_at ? new Date(a.scheduled_start_at).getTime() : Infinity
    const bTime = b.scheduled_start_at ? new Date(b.scheduled_start_at).getTime() : Infinity
    return aTime - bTime
  })

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: C.font }}>
      <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebarCollapse} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 28px',
            borderBottom: `1px solid ${C.border}`,
            background: '#0d0d22',
            fontFamily: C.font,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>Tournaments</div>
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
                fontFamily: C.font,
              }}
            >
              {error}
            </div>
          )}

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div style={{ fontSize: 14, color: C.muted }}>
              {sortedTournaments.length} tournament{sortedTournaments.length !== 1 ? 's' : ''} available
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 12, color: C.muted, display: 'flex', alignItems: 'center' }}>
                Sorted by start time
              </span>
            </div>
          </div>

          {/* Tournaments grid */}
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16, alignItems: 'stretch' }}>
              {[1, 2, 3, 4].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : sortedTournaments.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: C.muted,
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
              <div style={{ fontSize: 16, marginBottom: 8 }}>No tournaments available right now</div>
              <div style={{ fontSize: 13, color: C.muted }}>Check back soon for new tournaments!</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16, alignItems: 'stretch' }}>
              {sortedTournaments.map((tournament) => {
                const isRegistered = isUserRegistered(tournament)
                return (
                  <TournamentCard
                    key={tournament.id}
                    tournament={tournament}
                    onClick={() => {
                      if (isRegistered) {
                        // If tournament is already running, go to live game view
                        if (tournament.status === 'running' || tournament.status === 'final_table') {
                          navigate(`/tournaments/${tournament.id}/live`)
                        } else {
                          // Otherwise go to lobby with countdown timer
                          navigate(`/tournaments/${tournament.id}/lobby`)
                        }
                      } else {
                        // Not registered, go to detail page
                        navigate(`/tournaments/${tournament.id}`)
                      }
                    }}
                    isRegistered={isRegistered}
                  />
                )
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
