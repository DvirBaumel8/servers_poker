import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/axios'
import { useAuthStore } from '../store/authStore'
import { useTournamentLobby } from '../hooks/useTournamentLobby'
import CountdownTimer from '../components/tournaments/CountdownTimer'

// ─── Types ────────────────────────────────────────────────────────────────────

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

export default function TournamentLobbyPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [leaving, setLeaving] = useState(false)

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('tournament_lobby_sidebar_collapsed')
    return saved !== null ? JSON.parse(saved) : false
  })

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const newVal = !prev
      localStorage.setItem('tournament_lobby_sidebar_collapsed', JSON.stringify(newVal))
      return newVal
    })
  }

  // Memoize the callback to prevent effect re-runs
  const handleTournamentStarted = useCallback(() => {
    console.log('🎮 Tournament started, redirecting to live game...')
    if (id) {
      navigate(`/tournaments/${id}/live`)
    }
  }, [id, navigate])

  // Real-time tournament updates via Socket.IO
  const {
    connectionStatus,
    registeredPlayers,
    currentPlayerCount,
    isConnected,
    tournamentStatus,
    error: socketError,
  } = useTournamentLobby({
    tournamentId: id || '',
    enabled: !!id && !loading,
    onTournamentStarted: handleTournamentStarted,
  })

  // Fallback: also watch tournament status directly
  useEffect(() => {
    if (tournament?.status === 'running' && !loading) {
      console.log('📺 Tournament status changed to running, redirecting to live game...')
      handleTournamentStarted()
    }
  }, [tournament?.status, loading, handleTournamentStarted])

  useEffect(() => {
    if (id) {
      // Initial load sets loading state
      fetchTournamentDetail(true)
      // Poll tournament status every 30 seconds as a fallback
      // (WebSocket handles real-time updates)
      // Note: polling calls don't set loading = true to keep socket alive
      const statusCheckInterval = setInterval(() => {
        fetchTournamentDetail(false)
      }, 30000)
      return () => clearInterval(statusCheckInterval)
    }
  }, [id])

  async function fetchTournamentDetail(isInitialLoad = false) {
    if (isInitialLoad) {
      setLoading(true)
    }
    setError('')
    try {
      const res = await api.get(`/tournaments/${id}`)
      setTournament(res.data)
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to load tournament'
      setError(message)
    } finally {
      if (isInitialLoad) {
        setLoading(false)
      }
    }
  }

  const handleLeaveTournament = async () => {
    setLeaving(true)
    try {
      await api.post(`/tournaments/${id}/leave`)
      navigate('/tournaments')
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to leave tournament'
      setError(message)
      setLeaving(false)
    }
  }

  const canLeave = tournament?.status === 'registering'

  // Check if start time has passed but tournament hasn't started
  const hasStartTimePassed = tournament?.scheduled_start_at
    ? new Date(tournament.scheduled_start_at).getTime() < Date.now()
    : false
  const hasEnoughPlayers = tournament && currentPlayerCount >= tournament.min_players
  const isCancelled = tournament?.status === 'cancelled'
  const isInsufficientPlayers =
    tournament?.status === 'registering' && hasStartTimePassed && !hasEnoughPlayers

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebarCollapse} />
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: C.muted,
            fontFamily: C.font,
          }}
        >
          Loading tournament lobby...
        </div>
      </div>
    )
  }

  if (isCancelled) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebarCollapse} />
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            color: C.muted,
            fontFamily: C.font,
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 16 }}>🚫</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 8 }}>
            Tournament Cancelled
          </div>
          <div style={{ fontSize: 14, color: C.muted, marginBottom: 24, maxWidth: 400, textAlign: 'center' }}>
            This tournament was cancelled because it did not have enough registered players when the scheduled start time arrived ({currentPlayerCount}/{tournament?.min_players} required).
          </div>
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

  if (error) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebarCollapse} />
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            color: C.muted,
            fontFamily: C.font,
          }}
        >
          <div style={{ fontSize: 16, color: C.danger, marginBottom: 16 }}>{error}</div>
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

  if (!tournament) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebarCollapse} />
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: C.muted,
            fontFamily: C.font,
          }}
        >
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
        @keyframes slideIn { from { opacity: 0; transform: translateY(-10px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.7 } }
      `}</style>
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

          {/* Connection status */}
          <div
            style={{
              fontSize: 12,
              color:
                connectionStatus === 'connected' ? C.success :
                connectionStatus === 'error' ? C.danger : C.warning,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background:
                  connectionStatus === 'connected' ? C.success :
                  connectionStatus === 'error' ? C.danger : C.warning,
                animation: connectionStatus === 'connecting' ? 'pulse 1s ease-in-out infinite' : 'none',
              }}
            />
            {connectionStatus === 'connected' && '🟢 Live'}
            {connectionStatus === 'connecting' && '🟡 Connecting...'}
            {connectionStatus === 'disconnected' && '🔴 Disconnected'}
            {connectionStatus === 'error' && '🔴 Error'}
          </div>
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

          {socketError && (
            <div
              style={{
                background: 'rgba(245,158,11,0.1)',
                border: `1px solid ${C.warning}`,
                borderRadius: 8,
                padding: '8px 12px',
                color: C.warning,
                fontSize: 12,
                marginBottom: 16,
              }}
            >
              ⚠️ {socketError}
            </div>
          )}

          {hasStartTimePassed && hasEnoughPlayers && tournament?.status === 'registering' && (
            <div
              style={{
                background: 'rgba(29,158,117,0.1)',
                border: `1px solid ${C.success}`,
                borderRadius: 8,
                padding: '12px 16px',
                color: C.success,
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              ✓ <strong>Ready to Start</strong>
              <br />
              The tournament has {currentPlayerCount} players and is ready to begin!
            </div>
          )}

          <div style={{ maxWidth: 1000 }}>
            {/* Tournament header */}
            <div style={{ marginBottom: 32 }}>
              <h1 style={{ fontSize: 32, fontWeight: 700, color: C.text, margin: '0 0 8px 0' }}>
                {tournament.name}
              </h1>
              {tournament.description && (
                <p style={{ fontSize: 15, color: C.muted, margin: 0, lineHeight: 1.6 }}>
                  {tournament.description}
                </p>
              )}
            </div>

            {/* Countdown and info grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, marginBottom: 32 }}>
              {/* Left: Countdown timer and info */}
              <div>
                {tournament.scheduled_start_at && (
                  <div style={{ marginBottom: 24 }}>
                    <CountdownTimer
                      scheduledStartTime={tournament.scheduled_start_at}
                      size="large"
                      onTimeUp={() => {
                        // Timer has counted down to zero
                        // The tournament may not have started yet, but we're ready
                      }}
                    />
                  </div>
                )}

                {/* Tournament info grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                      Starting Chips
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
                      {tournament.starting_chips.toLocaleString()}
                    </div>
                  </div>

                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                      Players per Table
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
                      {tournament.players_per_table}
                    </div>
                  </div>

                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                      Status
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color:
                          tournament.status === 'registering' ? C.success :
                          tournament.status === 'running' ? C.warning : C.muted,
                        textTransform: 'capitalize',
                      }}
                    >
                      {tournament.status.replace('_', ' ')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Registered players count and action */}
              <div>
                <div
                  style={{
                    background: C.card,
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    padding: 20,
                    textAlign: 'center',
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontSize: 40, fontWeight: 700, color: C.accent, marginBottom: 8 }}>
                    {currentPlayerCount}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
                    Players Registered
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    of {tournament.max_participants || 64} max
                  </div>

                  {/* Progress bar */}
                  <div
                    style={{
                      marginTop: 16,
                      height: 6,
                      background: C.border,
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        background: C.accent,
                        width: `${((currentPlayerCount / (tournament.max_participants || 64)) * 100)}%`,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>

                {/* Leave button (only during registration) */}
                {canLeave && (
                  <button
                    onClick={handleLeaveTournament}
                    disabled={leaving}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: 8,
                      background: 'rgba(226,75,74,0.1)',
                      border: `1px solid ${C.danger}`,
                      color: C.danger,
                      fontWeight: 700,
                      fontSize: 14,
                      fontFamily: C.font,
                      cursor: leaving ? 'not-allowed' : 'pointer',
                      opacity: leaving ? 0.5 : 1,
                      transition: 'all 0.2s',
                    }}
                  >
                    {leaving ? 'Leaving...' : 'Leave Tournament'}
                  </button>
                )}

                {!canLeave && (
                  <div
                    style={{
                      padding: '12px',
                      borderRadius: 8,
                      background: 'rgba(0,229,255,0.1)',
                      border: `1px solid ${C.accent}`,
                      color: C.accent,
                      fontSize: 12,
                      textAlign: 'center',
                    }}
                  >
                    Tournament is {tournament.status === 'running' ? 'live' : tournament.status}. No longer able to leave.
                  </div>
                )}
              </div>
            </div>

            {/* Registered players list */}
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 16 }}>
                Registered Players
                {isConnected && <span style={{ fontSize: 12, color: C.success, marginLeft: 8 }}>● Live</span>}
              </div>

              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                {registeredPlayers.length === 0 ? (
                  <div style={{ padding: 32, textAlign: 'center', color: C.muted }}>
                    Waiting for players to join...
                  </div>
                ) : (
                  <>
                    {/* Players */}
                    {registeredPlayers.map((player) => (
                      <div
                        key={player.botId}
                        style={{
                          padding: 14,
                          borderBottom: `1px solid ${C.border}`,
                          fontSize: 13,
                          animation: 'slideIn 0.3s ease-out',
                          color: C.text,
                          fontWeight: 600,
                        }}
                      >
                        {player.userName}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
