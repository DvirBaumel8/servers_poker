import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/axios'
import { useAuthStore } from '../store/authStore'
import { Sidebar } from '../components/Sidebar'
import BotSelectionModal from '../components/tournaments/BotSelectionModal'
import { useTournamentSocket } from '../hooks/useTournamentSocket'

// ─── Types ────────────────────────────────────────────────────────────────────

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
  // canJoin = isRegistrationOpen && !hasJoined (reserved for future use)

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
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontFamily: C.font }}>
          Loading tournament details...
        </div>
      </div>
    )
  }

  if (!tournament) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>
        <Sidebar />
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
