import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/axios'
import { useAuthStore } from '../store/authStore'
import Podium from '../components/tournaments/Podium'
import ResultsTable from '../components/tournaments/ResultsTable'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResultEntry {
  rank: number
  botId: string
  botName: string
  userId: string
  userName: string
  finishPosition: number
  payout: number
  bustLevel?: number
  isTied?: boolean
}

interface TournamentResults {
  tournamentId: string
  tournamentName: string
  finishedAt: Date | null
  totalEntries: number
  results: ResultEntry[]
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#0a0a1a',
  card: '#13132a',
  border: '#1e1e3f',
  accent: '#00e5ff',
  text: '#ffffff',
  muted: '#9ca3af',
  success: '#1d9e75',
  warning: '#f59e0b',
  font: "'Trebuchet MS', sans-serif",
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TournamentResultsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [results, setResults] = useState<TournamentResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (id) {
      fetchResults()
    }
  }, [id])

  async function fetchResults() {
    try {
      const res = await api.get<TournamentResults>(`/tournaments/${id}/results`)
      setResults(res.data)
      setError('')
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Failed to load tournament results'
      setError(message)
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
        Loading results...
      </div>
    )
  }

  if (error || !results) {
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
        <div style={{ textAlign: 'center', padding: '40px', maxWidth: 400 }}>
          <div style={{ fontSize: 40, marginBottom: 20 }}>⚠️</div>
          <h1 style={{ fontSize: 24, color: C.text, marginBottom: 8 }}>
            Error
          </h1>
          <p style={{ fontSize: 14, color: C.muted, marginBottom: 24 }}>
            {error || 'Could not load tournament results'}
          </p>
          <button
            onClick={() => navigate('/tournaments')}
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
            Back to Tournaments
          </button>
        </div>
      </div>
    )
  }

  const topThree = results.results.slice(0, 3)
  const userBot = results.results.find((r) => r.userId === user?.id)

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: C.font }}>
      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes confetti { 0% { opacity: 1; transform: translateY(0) } 100% { opacity: 0; transform: translateY(100px) } }
      `}</style>

      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(0,229,255,0.1), rgba(0,112,255,0.1))',
          borderBottom: `1px solid ${C.border}`,
          padding: '28px',
          textAlign: 'center',
        }}
      >
        <button
          onClick={() => navigate('/tournaments')}
          style={{
            float: 'left',
            background: 'none',
            border: 'none',
            color: C.muted,
            fontSize: 13,
            fontFamily: C.font,
            cursor: 'pointer',
            marginBottom: 16,
          }}
        >
          ← Back to Tournaments
        </button>

        <div style={{ clear: 'both' }}>
          <h1 style={{ fontSize: 36, fontWeight: 700, color: C.text, margin: '0 0 8px 0' }}>
            🏆 {results.tournamentName}
          </h1>
          <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>
            {results.totalEntries} players • {results.finishedAt ? new Date(results.finishedAt).toLocaleDateString() : 'Finishing soon'}
          </p>
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px' }}>
        {/* User's result highlight */}
        {userBot && userBot.rank > 3 && (
          <div
            style={{
              background: 'rgba(0,229,255,0.1)',
              border: `2px solid ${C.accent}`,
              borderRadius: 12,
              padding: 16,
              marginBottom: 32,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 12, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              Your Result
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.accent }}>
              {userBot.isTied ? `T-${userBot.rank}` : `#${userBot.rank}`} Place — {userBot.botName}
            </div>
            {userBot.payout > 0 && (
              <div style={{ fontSize: 14, color: C.success, marginTop: 8, fontWeight: 600 }}>
                💰 Prize: ${userBot.payout.toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* Podium for top 3 */}
        {topThree.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 24, textAlign: 'center' }}>
              Final Standings
            </h2>
            <Podium topThree={topThree} userId={user?.id} />
          </div>
        )}

        {/* Full results table */}
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 16 }}>
            Complete Rankings
          </h2>
          <ResultsTable results={results.results} userId={user?.id} />
        </div>
      </div>
    </div>
  )
}
