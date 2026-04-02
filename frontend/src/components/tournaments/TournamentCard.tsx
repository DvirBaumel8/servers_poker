import { useNavigate } from 'react-router-dom'

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tournament {
  id: string
  name: string
  description?: string
  status: 'registering' | 'running' | 'final_table' | 'finished' | 'cancelled'
  buy_in: number
  starting_chips: number
  scheduled_start_at?: string
  max_participants?: number
  current_participants?: number
  registered_count?: number
}

// ─── Component ────────────────────────────────────────────────────────────────

interface TournamentCardProps {
  tournament: Tournament
  onViewDetails?: () => void
}

export default function TournamentCard({ tournament, onViewDetails }: TournamentCardProps) {
  const navigate = useNavigate()

  const registered = tournament.registered_count ?? tournament.current_participants ?? 0
  const max = tournament.max_participants ?? 64
  const startTime = tournament.scheduled_start_at ? new Date(tournament.scheduled_start_at) : null

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
  const isFull = registered >= max
  const canRegister = tournament.status === 'registering' && !isFull

  const handleClick = () => {
    onViewDetails?.()
    navigate(`/tournaments/${tournament.id}`)
  }

  return (
    <div
      onClick={handleClick}
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
        ;(e.currentTarget as HTMLElement).style.background = C.cardHover
        ;(e.currentTarget as HTMLElement).style.borderColor = C.accent
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.background = C.card
        ;(e.currentTarget as HTMLElement).style.borderColor = C.border
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
            {tournament.name}
          </div>
          {tournament.description && (
            <div
              style={{
                fontSize: 13,
                color: C.muted,
                marginTop: 6,
                lineHeight: 1.4,
              }}
            >
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
          <div
            style={{
              fontSize: 11,
              color: C.muted,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 4,
            }}
          >
            Participants
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
            {registered}/{max}
          </div>
          {isFull && (
            <div style={{ fontSize: 11, color: C.danger, marginTop: 2 }}>
              Tournament full
            </div>
          )}
        </div>
        <div>
          <div
            style={{
              fontSize: 11,
              color: C.muted,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 4,
            }}
          >
            Starts in
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.accent }}>
            {getCountdown()}
          </div>
          {startTime && (
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              {startTime.toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 12,
          paddingTop: 12,
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: C.muted,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 4,
            }}
          >
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
            background: canRegister
              ? 'linear-gradient(90deg, #00e5ff, #0070ff)'
              : C.border,
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
            handleClick()
          }}
        >
          {canRegister
            ? 'View Details'
            : isFull
              ? 'Tournament Full'
              : 'View Details'}
        </button>
      </div>
    </div>
  )
}
