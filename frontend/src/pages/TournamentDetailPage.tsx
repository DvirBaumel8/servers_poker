import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/axios'
import { useAuthStore } from '../store/authStore'
import BotSelectionModal from '../components/tournaments/BotSelectionModal'
import { useTournamentSocket, type TournamentNotification } from '../hooks/useTournamentSocket'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Bot {
  id: string
  name: string
  strategy?: { personality?: Record<string, number> }
  active?: boolean
}

interface TournamentEntry {
  id: string
  bot_id: string
  user_id: string
  entry_type: 'original' | 'rebuy'
  finish_position?: number
  payout?: number
  bot?: { name: string }
  user?: { name: string }
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

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ collapsed = false, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const NAV = [
    { label: 'Home', path: '/' },
    { label: 'My Bots', path: '/bots' },
    { label: 'Tournaments', path: '/tournaments' },
    { label: 'Live Games', path: '/games' },
  ]

  const NAV_ICONS = {
    Home: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
    'My Bots': (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
    Tournaments: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <circle cx="3" cy="6" r="1" fill="currentColor" />
        <circle cx="3" cy="12" r="1" fill="currentColor" />
        <circle cx="3" cy="18" r="1" fill="currentColor" />
      </svg>
    ),
    'Live Games': (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
      </svg>
    ),
  }

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
        fontFamily: C.font,
        transition: 'width 0.2s',
        overflow: 'visible',
      }}
    >
      <div style={{ padding: collapsed ? '12px 12px 8px' : '28px 20px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {!collapsed && (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase' }}>
              <span style={{ color: C.text }}>Bot</span>
              <span style={{ color: C.accent }}>Royale</span>
            </div>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginTop: 4 }}>
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
          const active = path === '/tournaments'
          return (
            <div key={path}>
              <button
                onClick={() => navigate(path)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  gap: collapsed ? 0 : 10,
                  width: '100%',
                  padding: collapsed ? '10px 0' : '10px 20px',
                  background: active ? C.accentDim : 'transparent',
                  border: 'none',
                  borderLeft: collapsed ? 'none' : `3px solid ${active ? C.accent : 'transparent'}`,
                  color: active ? C.text : C.muted,
                  fontSize: 14,
                  fontFamily: C.font,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
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
          {!collapsed && (
            <>
              <div style={{ overflow: 'hidden', flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.name ?? 'Player'}
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>{user?.role ?? 'user'}</div>
              </div>
            </>
          )}
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

export default function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showBotSelector, setShowBotSelector] = useState(false)
  const [joining, setJoining] = useState(false)

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('tournament_detail_sidebar_collapsed')
    return saved !== null ? JSON.parse(saved) : false
  })

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const newVal = !prev
      localStorage.setItem('tournament_detail_sidebar_collapsed', JSON.stringify(newVal))
      return newVal
    })
  }

  // Real-time tournament updates via Socket.IO
  const { connectionStatus, latestUpdate, playerUpdates, notifications } = useTournamentSocket({
    tournamentId: id || '',
    enabled: !!id && !loading,
  })

  // Apply real-time updates to tournament state
  useEffect(() => {
    if (latestUpdate && tournament?.id === latestUpdate.tournamentId) {
      setTournament((prev) =>
        prev
          ? {
              ...prev,
              registered_count: latestUpdate.registered_count,
              current_participants: latestUpdate.current_participants,
              status: latestUpdate.status,
            }
          : null,
      )
    }
  }, [latestUpdate])

  const userEntries = tournament?.entries?.filter((e) => e.user_id === user?.id) ?? []
  const hasJoined = userEntries.length > 0
  const isRegistrationOpen = tournament?.status === 'registering'
  const canJoin = isRegistrationOpen && !hasJoined

  useEffect(() => {
    if (id) {
      fetchTournamentDetail()
    }
  }, [id])

  async function fetchTournamentDetail() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/tournaments/${id}`)
      setTournament(res.data)
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to load tournament'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleJoinSuccess = () => {
    setShowBotSelector(false)
    // Redirect to tournament lobby
    if (id) {
      navigate(`/tournaments/${id}/lobby`)
    }
  }

  const getCountdown = () => {
    if (!tournament?.scheduled_start_at) return null
    const now = new Date()
    const start = new Date(tournament.scheduled_start_at)
    const diff = start.getTime() - now.getTime()

    if (diff < 0) return { text: 'Started', color: C.warning }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    let text = ''
    if (days > 0) text += `${days}d `
    if (hours > 0) text += `${hours}h `
    if (mins > 0) text += `${mins}m`
    text = text.trim()

    return { text, color: C.accent }
  }

  const countdown = getCountdown()

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'registering':
        return C.success
      case 'running':
        return C.warning
      case 'final_table':
        return C.accent
      default:
        return C.muted
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebarCollapse} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontFamily: C.font }}>
          Loading tournament details...
        </div>
      </div>
    )
  }

  if (!tournament) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebarCollapse} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.muted, fontFamily: C.font }}>
          <div style={{ fontSize: 16, marginBottom: 16 }}>Tournament not found</div>
          <button
            onClick={() => navigate('/tournaments')}
            style={{
              padding: '9px 18px',
              background: 'linear-gradient(90deg, #00e5ff, #0070ff)',
              border: 'none',
              borderRadius: 8,
              color: '#000',
              fontWeight: 700,
              fontSize: 13,
              fontFamily: C.font,
              cursor: 'pointer',
            }}
          >
            Back to Tournaments
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: C.font }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-10px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '16px 28px',
            borderBottom: `1px solid ${C.border}`,
            background: '#0d0d22',
          }}
        >
          <button
            onClick={() => navigate('/tournaments')}
            style={{
              background: 'none',
              border: 'none',
              color: C.muted,
              fontSize: 13,
              fontFamily: C.font,
              cursor: 'pointer',
            }}
          >
            ← Back to Tournaments
          </button>
        </div>

        {/* Main content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '28px' }}>
          {/* Connection status indicator */}
          {connectionStatus === 'connecting' && (
            <div
              style={{
                background: 'rgba(245,158,11,0.1)',
                border: `1px solid rgba(245,158,11,0.3)`,
                borderRadius: 8,
                padding: '8px 12px',
                color: '#f59e0b',
                fontSize: 12,
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ animation: 'spin 1s linear infinite' }}>⟳</span>
              Connecting to live updates...
            </div>
          )}

          {connectionStatus === 'error' && (
            <div
              style={{
                background: 'rgba(226,75,74,0.1)',
                border: `1px solid ${C.danger}`,
                borderRadius: 8,
                padding: '8px 12px',
                color: C.danger,
                fontSize: 12,
                marginBottom: 16,
              }}
            >
              ⚠️ Connection lost. Tournament updates may be delayed.
            </div>
          )}

          {connectionStatus === 'connected' && (
            <div
              style={{
                background: 'rgba(29,158,117,0.1)',
                border: `1px solid ${C.success}`,
                borderRadius: 8,
                padding: '8px 12px',
                color: C.success,
                fontSize: 11,
                marginBottom: 16,
              }}
            >
              ✓ Live updates active
            </div>
          )}

          {/* Real-time notifications */}
          {notifications.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {notifications.map((notif) => (
                <div
                  key={notif.timestamp}
                  style={{
                    background: 'rgba(0,229,255,0.1)',
                    border: `1px solid ${C.accent}`,
                    borderRadius: 8,
                    padding: '12px 14px',
                    color: C.accent,
                    fontSize: 13,
                    marginBottom: 8,
                    animation: 'slideIn 0.3s ease-out',
                  }}
                >
                  📢 {notif.message}
                </div>
              ))}
            </div>
          )}

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

          <div style={{ maxWidth: 900 }}>
            {/* Header section */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h1 style={{ fontSize: 32, fontWeight: 700, color: C.text, margin: '0 0 8px 0' }}>
                    {tournament.name}
                  </h1>
                  {tournament.description && (
                    <p style={{ fontSize: 15, color: C.muted, margin: 0, lineHeight: 1.6 }}>
                      {tournament.description}
                    </p>
                  )}
                </div>
                <div
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    background: getStatusColor(tournament.status) === C.success ? 'rgba(29,158,117,0.1)' : getStatusColor(tournament.status) === C.warning ? 'rgba(245,158,11,0.1)' : C.accentDim,
                    color: getStatusColor(tournament.status),
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'capitalize',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tournament.status.replace('_', ' ')}
                </div>
              </div>

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                    Type
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.text, textTransform: 'capitalize' }}>
                    {tournament.type}
                  </div>
                </div>

                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                    Starting Chips
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
                    {tournament.starting_chips.toLocaleString()}
                  </div>
                </div>

                {countdown && (
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                      Starts in
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: countdown.color }}>
                      {countdown.text}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Details sections */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
              {/* Left: Details */}
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 16 }}>Tournament Details</div>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                        Players per Table
                      </div>
                      <div style={{ fontSize: 14, color: C.text }}>{tournament.players_per_table}</div>
                    </div>

                    {tournament.late_registration !== undefined && (
                      <div>
                        <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                          Late Registration
                        </div>
                        <div style={{ fontSize: 14, color: C.text }}>
                          {tournament.late_registration ? '✓ Allowed' : '✗ Not allowed'}
                        </div>
                      </div>
                    )}

                    {tournament.rebuys_allowed !== undefined && (
                      <div>
                        <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                          Rebuys
                        </div>
                        <div style={{ fontSize: 14, color: C.text }}>
                          {tournament.rebuys_allowed ? '✓ Allowed' : '✗ Not allowed'}
                        </div>
                      </div>
                    )}

                    {tournament.scheduled_start_at && (
                      <div>
                        <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                          Scheduled Start
                        </div>
                        <div style={{ fontSize: 14, color: C.text }}>
                          {new Date(tournament.scheduled_start_at).toLocaleString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Join */}
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 16 }}>Registration</div>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                  {hasJoined ? (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
                      <div style={{ fontSize: 14, color: C.success, fontWeight: 600, marginBottom: 4 }}>You're registered!</div>
                      <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
                        {userEntries.length} bot{userEntries.length > 1 ? 's' : ''} registered
                      </div>
                      <div style={{ background: 'rgba(29,158,117,0.1)', border: `1px solid ${C.success}`, borderRadius: 6, padding: 12, marginBottom: 12 }}>
                        {userEntries.map((e) => (
                          <div key={e.id} style={{ fontSize: 13, color: C.text }}>
                            {e.bot?.name || 'Bot'}
                          </div>
                        ))}
                      </div>
                      {tournament?.status === 'running' && (
                        <button
                          onClick={() => navigate(`/tournaments/${id}/live`)}
                          style={{
                            width: '100%',
                            padding: '10px',
                            borderRadius: 8,
                            background: 'linear-gradient(90deg, #00e5ff, #0070ff)',
                            border: 'none',
                            color: '#000',
                            fontWeight: 700,
                            fontSize: 13,
                            fontFamily: C.font,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                        >
                          Watch Your Game →
                        </button>
                      )}
                    </div>
                  ) : !isRegistrationOpen ? (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>⏱</div>
                      <div style={{ fontSize: 14, color: C.warning, fontWeight: 600 }}>Registration Closed</div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
                        Registration for this tournament has ended.
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>
                        Select a bot to join this tournament. Your bot will play automatically.
                      </div>
                      <button
                        onClick={() => setShowBotSelector(true)}
                        style={{
                          width: '100%',
                          padding: '12px',
                          borderRadius: 8,
                          background: 'linear-gradient(90deg, #00e5ff, #0070ff)',
                          border: 'none',
                          color: '#000',
                          fontWeight: 700,
                          fontSize: 14,
                          fontFamily: C.font,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        disabled={joining}
                      >
                        {joining ? 'Joining...' : 'Join Tournament →'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Real-time participant updates */}
            {playerUpdates.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 12 }}>
                  Recent Activity
                </div>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                  {playerUpdates.map((update, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 14px',
                        borderBottom: i < playerUpdates.length - 1 ? `1px solid ${C.border}` : 'none',
                        fontSize: 13,
                        animation: 'slideIn 0.3s ease-out',
                      }}
                    >
                      <span style={{ fontSize: 16 }}>
                        {update.action === 'joined' && '✓'}
                        {update.action === 'busted' && '✗'}
                        {update.action === 'advanced_level' && '⬆'}
                      </span>
                      <div style={{ flex: 1 }}>
                        <span style={{ color: C.text, fontWeight: 600 }}>{update.botName}</span>
                        <span style={{ color: C.muted }}> by {update.userName}</span>
                      </div>
                      <div style={{ fontSize: 11, color: C.muted }}>
                        {new Date(update.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Registered participants */}
            {tournament.entries && tournament.entries.length > 0 && (
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 16 }}>
                  Registered Participants ({tournament.entries.length})
                  {connectionStatus === 'connected' && <span style={{ fontSize: 12, color: C.success, marginLeft: 8 }}>● Live</span>}
                </div>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 16, padding: 16, borderBottom: `1px solid ${C.border}`, background: '#0d0d22' }}>
                    <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Bot</div>
                    <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Player</div>
                    <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right' }}>Entry Type</div>
                  </div>

                  {tournament.entries.map((entry, i) => (
                    <div
                      key={entry.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr auto',
                        gap: 16,
                        padding: 14,
                        borderBottom: i < tournament.entries!.length - 1 ? `1px solid ${C.border}` : 'none',
                        fontSize: 13,
                      }}
                    >
                      <div style={{ color: C.text }}>{entry.bot?.name || 'Unknown Bot'}</div>
                      <div style={{ color: C.muted }}>{entry.user?.name || 'Unknown Player'}</div>
                      <div style={{ color: C.muted, textAlign: 'right', textTransform: 'capitalize' }}>
                        {entry.entry_type}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Bot selection modal */}
      {showBotSelector && (
        <BotSelectionModal
          tournamentId={tournament.id}
          onClose={() => setShowBotSelector(false)}
          onJoining={() => setJoining(true)}
          onSuccess={handleJoinSuccess}
          onError={(msg) => {
            setError(msg)
            setJoining(false)
          }}
        />
      )}
    </div>
  )
}
