import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/axios'
import GameSpectator from './GameSpectator'
import TournamentContext from '../components/tournaments/TournamentContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CurrentTableInfo {
  tableId: string
  tableNumber: number
  seatPosition: number
  remainingPlayers: number
  currentBlindLevel: number
  gameId: string | null
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#0a0a1a',
  card: '#13132a',
  border: '#1e1e3f',
  accent: '#00e5ff',
  text: '#ffffff',
  muted: '#9ca3af',
  danger: '#e24b4a',
  font: "'Trebuchet MS', sans-serif",
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TournamentLivePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [tableInfo, setTableInfo] = useState<CurrentTableInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [eliminated, setEliminated] = useState(false)
  const [, setTournamentFinished] = useState(false)
  const [tournamentStatus, setTournamentStatus] = useState<string | null>(null)

  // Fetch current table info
  useEffect(() => {
    if (id) {
      fetchCurrentTable()
      // Poll every 30 seconds to check for table changes
      const interval = setInterval(() => {
        fetchCurrentTable()
      }, 30000)
      return () => clearInterval(interval)
    }
  }, [id])

  // Check tournament status when eliminated
  useEffect(() => {
    if (eliminated && id) {
      const checkTournamentStatus = async () => {
        try {
          const res = await api.get(`/tournaments/${id}`)
          setTournamentStatus(res.data.status)

          // Only auto-redirect if tournament is completely finished
          if (res.data.status === 'finished') {
            setTournamentFinished(true)
            setTimeout(() => {
              navigate(`/tournaments/${id}/results`)
            }, 1000)
          }
        } catch (err) {
          // Silently fail
        }
      }
      checkTournamentStatus()
      // Poll every 5 seconds while waiting for tournament to finish
      const interval = setInterval(checkTournamentStatus, 5000)
      return () => clearInterval(interval)
    }
  }, [eliminated, id, navigate])

  async function fetchCurrentTable() {
    try {
      const res = await api.get(`/tournaments/${id}/my-current-table`)
      setTableInfo(res.data)
      setError('')
      setEliminated(false)
    } catch (err: unknown) {
      const statusCode = (err as { response?: { status?: number } })?.response?.status
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to load tournament table'

      // 404 means user is eliminated or not playing
      if (statusCode === 404) {
        setEliminated(true)
        setError('')
      } else {
        setError(message)
      }
      setTableInfo(null)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: C.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: C.muted,
          fontFamily: C.font,
        }}
      >
        Loading tournament...
      </div>
    )
  }

  if (eliminated) {
    const isFinished = tournamentStatus === 'finished'

    return (
      <div
        style={{
          minHeight: '100vh',
          background: C.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: C.font,
        }}
      >
        <div
          style={{
            textAlign: 'center',
            padding: '40px',
            maxWidth: 400,
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 20 }}>
            {isFinished ? '🏁' : '⏸️'}
          </div>
          <h1 style={{ fontSize: 24, color: C.text, marginBottom: 8 }}>
            {isFinished ? 'Tournament Finished' : 'Your Bot Eliminated'}
          </h1>
          <p style={{ fontSize: 14, color: C.muted, marginBottom: 24, lineHeight: 1.6 }}>
            {isFinished
              ? 'Your bot has been eliminated. Check the results to see your final position.'
              : 'Your bot has been eliminated but the tournament is still running. Check back when the tournament finishes!'}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            {isFinished && (
              <button
                onClick={() => {
                  if (id) {
                    navigate(`/tournaments/${id}/results`)
                  }
                }}
                style={{
                  padding: '12px 24px',
                  background: 'linear-gradient(90deg, #00e5ff, #0070ff)',
                  border: 'none',
                  borderRadius: 8,
                  color: '#000',
                  fontWeight: 700,
                  fontSize: 14,
                  fontFamily: C.font,
                  cursor: 'pointer',
                  flex: 1,
                }}
              >
                View Results
              </button>
            )}
            <button
              onClick={() => {
                if (id) {
                  navigate(`/tournaments/${id}`)
                }
              }}
              style={{
                padding: '12px 24px',
                background: 'transparent',
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: C.text,
                fontWeight: 700,
                fontSize: 14,
                fontFamily: C.font,
                cursor: 'pointer',
                flex: 1,
              }}
            >
              Back to Tournament
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: C.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: C.font,
        }}
      >
        <div
          style={{
            textAlign: 'center',
            padding: '40px',
            maxWidth: 400,
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 20 }}>⚠️</div>
          <h1 style={{ fontSize: 24, color: C.text, marginBottom: 8 }}>
            Error
          </h1>
          <p style={{ fontSize: 14, color: C.danger, marginBottom: 24 }}>
            {error}
          </p>
          <button
            onClick={() => {
              if (id) {
                navigate(`/tournaments/${id}`)
              }
            }}
            style={{
              padding: '12px 24px',
              background: 'linear-gradient(90deg, #00e5ff, #0070ff)',
              border: 'none',
              borderRadius: 8,
              color: '#000',
              fontWeight: 700,
              fontSize: 14,
              fontFamily: C.font,
              cursor: 'pointer',
            }}
          >
            Back to Tournament
          </button>
        </div>
      </div>
    )
  }

  if (!tableInfo || !tableInfo.gameId) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: C.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: C.font,
        }}
      >
        <div
          style={{
            textAlign: 'center',
            padding: '40px',
            maxWidth: 400,
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 20 }}>⏳</div>
          <h1 style={{ fontSize: 24, color: C.text, marginBottom: 8 }}>
            Waiting for Game
          </h1>
          <p style={{ fontSize: 14, color: C.muted }}>
            Your bot is waiting to be seated at a table. This should start soon.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: C.bg,
        fontFamily: C.font,
      }}
    >
      {/* Main game area */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <GameSpectator gameId={tableInfo.gameId} />
      </div>

      {/* Tournament context sidebar */}
      <TournamentContext
        tournamentId={id || ''}
        currentTable={tableInfo}
        onEliminated={() => setEliminated(true)}
      />
    </div>
  )
}
