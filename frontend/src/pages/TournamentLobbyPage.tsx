import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/axios'
import { useAuthStore } from '../store/authStore'
import { Sidebar } from '../components/Sidebar'
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TournamentLobbyPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [leaving, setLeaving] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)

  // Memoize the callback to prevent effect re-runs
  const handleTournamentStarted = useCallback(() => {
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
        <Sidebar />
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
        <Sidebar />
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
        <Sidebar />
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
        <Sidebar />
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
      <Sidebar />

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
                    onClick={() => setShowLeaveConfirm(true)}
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

                {/* Leave confirmation modal */}
                <AnimatePresence>
                  {showLeaveConfirm && (
                    <div style={{
                      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.font,
                    }} onClick={() => setShowLeaveConfirm(false)}>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        style={{
                          background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
                          padding: 28, width: 360, maxWidth: '90vw',
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 12 }}>Leave Tournament?</div>
                        <div style={{ fontSize: 14, color: C.muted, marginBottom: 24 }}>
                          You will lose your spot and cannot rejoin. Are you sure?
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button
                            onClick={() => setShowLeaveConfirm(false)}
                            style={{
                              flex: 1, padding: '10px', background: 'transparent',
                              border: `1px solid ${C.border}`, borderRadius: 8,
                              color: C.muted, fontFamily: C.font, cursor: 'pointer', fontSize: 14,
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => { setShowLeaveConfirm(false); handleLeaveTournament() }}
                            disabled={leaving}
                            style={{
                              flex: 1, padding: '10px', background: C.danger, border: 'none', borderRadius: 8,
                              color: '#fff', fontWeight: 700, fontFamily: C.font, fontSize: 14,
                              cursor: leaving ? 'not-allowed' : 'pointer', opacity: leaving ? 0.6 : 1,
                            }}
                          >
                            Leave
                          </button>
                        </div>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>

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
