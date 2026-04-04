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

interface ResultsTableProps {
  results: ResultEntry[]
  userId?: string
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  card: '#13132a',
  border: '#1e1e3f',
  accent: '#00e5ff',
  accentDim: 'rgba(0,229,255,0.08)',
  text: '#ffffff',
  muted: '#9ca3af',
  success: '#1d9e75',
  font: "'Trebuchet MS', sans-serif",
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ResultsTable({ results, userId }: ResultsTableProps) {
  const getMedalEmoji = (rank: number) => {
    switch (rank) {
      case 1:
        return '🥇'
      case 2:
        return '🥈'
      case 3:
        return '🥉'
      default:
        return null
    }
  }

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return '#ffd700'
      case 2:
        return '#c0c0c0'
      case 3:
        return '#cd7f32'
      default:
        return C.text
    }
  }

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '60px 1fr 1fr 120px',
          gap: 16,
          padding: 16,
          borderBottom: `1px solid ${C.border}`,
          background: '#0d0d22',
        }}
      >
        <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
          Rank
        </div>
        <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
          Bot
        </div>
        <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
          Player
        </div>
        <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right' }}>
          Prize
        </div>
      </div>

      {/* Rows */}
      {results.map((entry, idx) => {
        const isCurrentUser = userId === entry.userId
        const isTopThree = entry.rank <= 3

        return (
          <div
            key={entry.botId}
            style={{
              display: 'grid',
              gridTemplateColumns: '60px 1fr 1fr 120px',
              gap: 16,
              padding: 14,
              borderBottom: idx < results.length - 1 ? `1px solid ${C.border}` : 'none',
              background: isCurrentUser ? C.accentDim : 'transparent',
              border: isCurrentUser ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
              borderLeft: isCurrentUser ? `4px solid ${C.accent}` : 'none',
              fontSize: 13,
              transition: 'background 0.2s',
            }}
          >
            {/* Rank */}
            <div
              style={{
                fontWeight: 700,
                color: isTopThree ? getRankColor(entry.rank) : C.text,
                fontSize: isTopThree ? 16 : 13,
              }}
            >
              {getMedalEmoji(entry.rank)} {entry.isTied ? `T-${entry.rank}` : `#${entry.rank}`}
            </div>

            {/* Bot name */}
            <div style={{ color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {entry.botName}
              {isCurrentUser && (
                <span style={{ color: C.accent, fontSize: 11, marginLeft: 8, fontWeight: 400 }}>
                  (you)
                </span>
              )}
            </div>

            {/* Player name */}
            <div style={{ color: C.muted }}>
              {entry.userName}
            </div>

            {/* Prize */}
            <div
              style={{
                textAlign: 'right',
                fontWeight: 600,
                color: entry.payout > 0 ? C.success : C.muted,
              }}
            >
              {entry.payout > 0 ? `$${entry.payout.toLocaleString()}` : '—'}
            </div>
          </div>
        )
      })}

      {/* Empty state */}
      {results.length === 0 && (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            color: C.muted,
          }}
        >
          No results available
        </div>
      )}
    </div>
  )
}
