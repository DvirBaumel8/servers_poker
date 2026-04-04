import { useEffect, useState } from 'react'
import api from '../../lib/axios'
import { useTournamentSocket } from '../../hooks/useTournamentSocket'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CurrentTableInfo {
  tableId: string
  tableNumber: number
  seatPosition: number
  remainingPlayers: number
  currentBlindLevel: number
  gameId: string | null
}

interface Tournament {
  id: string
  name: string
  status: string
  buy_in: number
  starting_chips: number
  players_per_table: number
}

interface TournamentState {
  tournamentId: string
  name: string
  status: string
  playersRemaining: number
  totalEntrants: number
}

interface TournamentContextProps {
  tournamentId: string
  currentTable: CurrentTableInfo
  onEliminated?: () => void
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#0d0d22',
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function TournamentContext({
  tournamentId,
  currentTable,
}: TournamentContextProps) {
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [state, setState] = useState<TournamentState | null>(null)
  const [loading, setLoading] = useState(true)

  // WebSocket connection for live tournament updates
  const { latestUpdate, connectionStatus } = useTournamentSocket({
    tournamentId,
    enabled: !!tournamentId,
  })

  // Initial load + subscribe to live updates
  useEffect(() => {
    fetchTournamentInfo()
  }, [tournamentId])

  // Update state when WebSocket sends live updates
  useEffect(() => {
    if (latestUpdate) {
      // Convert WebSocket TournamentStateUpdate to our TournamentState format
      setState({
        tournamentId: latestUpdate.tournamentId,
        name: state?.name || 'Tournament',
        status: latestUpdate.status,
        playersRemaining: latestUpdate.current_participants > 0
          ? latestUpdate.current_participants
          : (state?.playersRemaining ?? 0),
        totalEntrants: state?.totalEntrants || 0,
      })
    }
  }, [latestUpdate])

  async function fetchTournamentInfo() {
    try {
      const [tournamentRes, stateRes] = await Promise.all([
        api.get<Tournament>(`/tournaments/${tournamentId}`),
        api.get<TournamentState>(`/tournaments/${tournamentId}/state`),
      ])
      setTournament(tournamentRes.data)
      setState(stateRes.data)
    } catch (err) {
      console.error('Failed to fetch tournament info:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !tournament || !state) {
    return (
      <div
        style={{
          width: 280,
          background: C.bg,
          borderLeft: `1px solid ${C.border}`,
          padding: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: C.muted,
          fontSize: 12,
          fontFamily: C.font,
        }}
      >
        Loading tournament info...
      </div>
    )
  }

  // playerPosition available if needed: Math.max(1, state.playersRemaining - currentTable.remainingPlayers + 1)
  const blindInfo = `Level ${currentTable.currentBlindLevel}`

  return (
    <div
      style={{
        width: 280,
        background: C.bg,
        borderLeft: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: C.font,
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px', borderBottom: `1px solid ${C.border}` }}>
        <h2
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: C.text,
            margin: '0 0 4px 0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {tournament.name}
        </h2>
        <p
          style={{
            fontSize: 11,
            color: C.muted,
            margin: 0,
            textTransform: 'capitalize',
          }}
        >
          {state.status}
        </p>
      </div>

      {/* Tournament info cards */}
      <div style={{ padding: '12px', flex: 1 }}>
        {/* Table & Position */}
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: C.muted,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 6,
            }}
          >
            Table & Position
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>
                Table
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.accent }}>
                #{currentTable.tableNumber}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>
                Seat
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>
                {currentTable.seatPosition}
              </div>
            </div>
          </div>
        </div>

        {/* Players remaining */}
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: C.muted,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 8,
            }}
          >
            Players Remaining
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: C.accent }}>
                {state.playersRemaining}
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                of {state.totalEntrants}
              </div>
            </div>
            <div
              style={{
                textAlign: 'right',
                fontSize: 11,
                color: C.warning,
                fontWeight: 600,
              }}
            >
              Eliminated<br />
              {state.totalEntrants - state.playersRemaining}
            </div>
          </div>

          {/* Progress bar */}
          <div
            style={{
              height: 4,
              background: C.border,
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                background: C.accent,
                width: `${(state.playersRemaining / state.totalEntrants) * 100}%`,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>

        {/* Blind level */}
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: C.muted,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 6,
            }}
          >
            Current Blind
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            {blindInfo}
          </div>
        </div>

        {/* Tournament details */}
        <div
          style={{
            background: 'rgba(0,229,255,0.05)',
            border: `1px solid rgba(0,229,255,0.2)`,
            borderRadius: 8,
            padding: 12,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: C.muted,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 8,
            }}
          >
            Tournament Details
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
              }}
            >
              <span style={{ color: C.muted }}>Buy-in:</span>
              <span style={{ color: C.text, fontWeight: 600 }}>
                ${tournament.buy_in}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
              }}
            >
              <span style={{ color: C.muted }}>Starting:</span>
              <span style={{ color: C.text, fontWeight: 600 }}>
                {tournament.starting_chips.toLocaleString()}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
              }}
            >
              <span style={{ color: C.muted }}>Max/Table:</span>
              <span style={{ color: C.text, fontWeight: 600 }}>
                {tournament.players_per_table}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer note - show connection status */}
      <div
        style={{
          padding: '12px',
          borderTop: `1px solid ${C.border}`,
          fontSize: 10,
          color: connectionStatus === 'connected' ? C.success : C.muted,
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background:
              connectionStatus === 'connected'
                ? C.success
                : connectionStatus === 'connecting'
                  ? C.warning
                  : C.danger,
            animation: connectionStatus === 'connecting' ? 'pulse 1s infinite' : 'none',
          }}
        />
        {connectionStatus === 'connected' ? '🔴 Live Updates' : `${connectionStatus}...`}
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
