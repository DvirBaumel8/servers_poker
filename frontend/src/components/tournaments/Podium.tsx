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
}

interface PodiumProps {
  topThree: ResultEntry[]
  userId?: string
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  card: '#13132a',
  cardHover: '#161630',
  border: '#1e1e3f',
  accent: '#00e5ff',
  accentDim: 'rgba(0,229,255,0.08)',
  text: '#ffffff',
  muted: '#9ca3af',
  success: '#1d9e75',
  warning: '#f59e0b',
  font: "'Trebuchet MS', sans-serif",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMedalColor(position: number): string {
  switch (position) {
    case 1:
      return '#ffd700' // Gold
    case 2:
      return '#c0c0c0' // Silver
    case 3:
      return '#cd7f32' // Bronze
    default:
      return C.accent
  }
}

function getMedalEmoji(position: number): string {
  switch (position) {
    case 1:
      return '🥇'
    case 2:
      return '🥈'
    case 3:
      return '🥉'
    default:
      return '🏅'
  }
}

function getHeightPercent(position: number): number {
  switch (position) {
    case 1:
      return 100
    case 2:
      return 75
    case 3:
      return 60
    default:
      return 50
  }
}

// ─── PodiumPlace (module-scope to avoid re-creation on every render) ──────────

function PodiumPlace({ entry, position, currentUserId }: { entry?: ResultEntry; position: 1 | 2 | 3; currentUserId?: string }) {
    if (!entry) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          <div
            style={{
              width: '100%',
              height: `${getHeightPercent(position)}%`,
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '8px 8px 0 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: C.muted,
              fontSize: 12,
            }}
          >
            —
          </div>
          <div
            style={{
              textAlign: 'center',
              padding: '12px',
              fontSize: 12,
              color: C.muted,
              width: '100%',
            }}
          >
            Position {position}
          </div>
        </div>
      )
    }

    const isCurrentUser = currentUserId === entry.userId
    const medalColor = getMedalColor(position)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
        {/* Medal */}
        <div
          style={{
            fontSize: 32,
            marginBottom: 8,
            filter: position === 1 ? 'drop-shadow(0 0 8px rgba(255,215,0,0.8))' : 'none',
          }}
        >
          {getMedalEmoji(position)}
        </div>

        {/* Podium block */}
        <div
          style={{
            width: '100%',
            height: `${getHeightPercent(position)}%`,
            background:
              position === 1
                ? 'linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,215,0,0.1))'
                : position === 2
                  ? 'linear-gradient(135deg, rgba(192,192,192,0.2), rgba(192,192,192,0.1))'
                  : 'linear-gradient(135deg, rgba(205,127,50,0.2), rgba(205,127,50,0.1))',
            border: `2px solid ${medalColor}`,
            borderRadius: '8px 8px 0 0',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: '12px',
            minHeight: 120,
            position: 'relative',
            boxShadow:
              position === 1 ? `0 0 20px rgba(255,215,0,0.3)` : 'none',
            outline: isCurrentUser ? `2px dashed ${C.accent}` : 'none',
            outlineOffset: isCurrentUser ? 2 : 0,
          }}
        >
          {/* Position number (large) */}
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 12,
              fontSize: 32,
              fontWeight: 700,
              color: medalColor,
              opacity: 0.3,
            }}
          >
            {position}
          </div>
        </div>

        {/* Bot name */}
        <div
          style={{
            marginTop: 12,
            textAlign: 'center',
            width: '100%',
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: C.text,
              marginBottom: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {entry.botName}
          </div>
          <div
            style={{
              fontSize: 12,
              color: C.muted,
              marginBottom: 6,
            }}
          >
            {entry.userName}
          </div>

          {/* Payout */}
          {entry.payout > 0 && (
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: medalColor,
                marginTop: 4,
              }}
            >
              💰 ${entry.payout.toLocaleString()}
            </div>
          )}

          {/* Current user badge */}
          {isCurrentUser && (
            <div
              style={{
                fontSize: 10,
                color: C.accent,
                marginTop: 8,
                textTransform: 'uppercase',
                letterSpacing: 1,
                fontWeight: 600,
              }}
            >
              ← Your bot
            </div>
          )}
        </div>
      </div>
    )
  }

// ─── Component ────────────────────────────────────────────────────────────────

export default function Podium({ topThree, userId }: PodiumProps) {
  // Arrange positions for visual podium: 2nd (left), 1st (center), 3rd (right)
  const first = topThree[0]
  const second = topThree[1]
  const third = topThree[2]

  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        alignItems: 'flex-end',
        justifyContent: 'center',
        minHeight: 400,
        marginBottom: 32,
      }}
    >
      {/* 2nd place (left) */}
      <div style={{ flex: 1, minWidth: 200 }}>
        <PodiumPlace entry={second} position={2} currentUserId={userId} />
      </div>

      {/* 1st place (center - tallest) */}
      <div style={{ flex: 1, minWidth: 200 }}>
        <PodiumPlace entry={first} position={1} currentUserId={userId} />
      </div>

      {/* 3rd place (right) */}
      <div style={{ flex: 1, minWidth: 200 }}>
        <PodiumPlace entry={third} position={3} currentUserId={userId} />
      </div>
    </div>
  )
}
