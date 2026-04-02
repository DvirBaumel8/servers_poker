const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const
type RangeAction = 'raise' | 'call' | 'fold' | null
type RangeChart = Record<string, RangeAction>

function generateAllHandNotations(): string[] {
  const hands: string[] = []
  for (let i = 0; i < RANKS.length; i++) {
    for (let j = 0; j < RANKS.length; j++) {
      if (i === j) {
        hands.push(`${RANKS[i]}${RANKS[j]}`)
      } else if (i < j) {
        hands.push(`${RANKS[i]}${RANKS[j]}s`)
      } else {
        hands.push(`${RANKS[j]}${RANKS[i]}o`)
      }
    }
  }
  return hands
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#0a0a1a',
  card: '#13132a',
  border: '#1e1e3f',
  text: '#ffffff',
  muted: '#9ca3af',
  success: '#1d9e75', // Raise
  warning: '#b5851b', // Call
  danger: '#e24b4a', // Fold
  font: "'Trebuchet MS', sans-serif",
}

// ─── Color mapping ────────────────────────────────────────────────────────────

function getActionColor(action: RangeAction): string {
  switch (action) {
    case 'raise':
      return C.success
    case 'call':
      return C.warning
    case 'fold':
      return C.danger
    case null:
      return C.border
    default:
      return C.border
  }
}

function getActionLabel(action: RangeAction): string {
  switch (action) {
    case 'raise':
      return 'R'
    case 'call':
      return 'C'
    case 'fold':
      return 'F'
    case null:
      return '·'
    default:
      return '·'
  }
}

// ─── Types ────────────────────────────────────────────────────────────────

interface RangeChartProps {
  rangeChart: RangeChart | undefined
  onChange: (rangeChart: RangeChart) => void
}

// ─── Main component ────────────────────────────────────────────────────────

export default function RangeChartComponent({
  rangeChart = {},
  onChange,
}: RangeChartProps) {
  const allHands = generateAllHandNotations()

  const handleCellClick = (hand: string) => {
    const currentAction = rangeChart[hand] || null
    const nextAction: RangeAction =
      currentAction === null ? 'raise' : currentAction === 'raise' ? 'call' : currentAction === 'call' ? 'fold' : null

    onChange({
      ...rangeChart,
      [hand]: nextAction === null ? undefined : nextAction,
    })
  }

  const handleClearAll = () => {
    onChange({})
  }

  const handleSetAllRaise = () => {
    const newChart: RangeChart = {}
    allHands.forEach((hand) => {
      newChart[hand] = 'raise'
    })
    onChange(newChart)
  }

  // Create a 13x13 matrix for display
  const matrix: (string | null)[][] = Array(13)
    .fill(null)
    .map(() => Array(13).fill(null))

  for (let i = 0; i < RANKS.length; i++) {
    for (let j = 0; j < RANKS.length; j++) {
      if (i === j) {
        // Diagonal = pairs
        matrix[i][j] = `${RANKS[i]}${RANKS[j]}`
      } else if (i < j) {
        // Upper right = suited
        matrix[i][j] = `${RANKS[i]}${RANKS[j]}s`
      } else {
        // Lower left = offsuit
        matrix[i][j] = `${RANKS[j]}${RANKS[i]}o`
      }
    }
  }

  return (
    <div>
      {/* Controls */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          marginBottom: '1.5rem',
        }}
      >
        <button
          onClick={handleClearAll}
          style={{
            flex: 1,
            padding: '0.75rem',
            background: 'transparent',
            border: `1px solid ${C.border}`,
            color: C.text,
            borderRadius: '0.375rem',
            fontFamily: C.font,
            fontSize: '0.875rem',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          Clear All
        </button>
        <button
          onClick={handleSetAllRaise}
          style={{
            flex: 1,
            padding: '0.75rem',
            background: `${C.success}20`,
            border: `1px solid ${C.success}`,
            color: C.success,
            borderRadius: '0.375rem',
            fontFamily: C.font,
            fontSize: '0.875rem',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          Raise All
        </button>
      </div>

      {/* Grid */}
      <div
        style={{
          padding: '1rem',
          background: 'rgba(0, 229, 255, 0.02)',
          borderRadius: '0.5rem',
          border: `1px solid ${C.border}`,
          overflowX: 'auto',
          marginBottom: '1rem',
        }}
      >
        <div
          style={{
            display: 'inline-block',
            minWidth: '100%',
          }}
        >
          {/* Header row */}
          <div style={{ display: 'flex', gap: '2px', marginBottom: '2px' }}>
            <div style={{ width: '30px' }} /> {/* Empty corner */}
            {RANKS.map((rank) => (
              <div
                key={rank}
                style={{
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  color: C.muted,
                }}
              >
                {rank}
              </div>
            ))}
          </div>

          {/* Grid rows */}
          {matrix.map((row, rowIdx) => (
            <div key={rowIdx} style={{ display: 'flex', gap: '2px', marginBottom: '2px' }}>
              {/* Row header */}
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  color: C.muted,
                }}
              >
                {RANKS[rowIdx]}
              </div>

              {/* Cells */}
              {row.map((hand, colIdx) => {
                if (!hand) return <div key={`${rowIdx}-${colIdx}`} style={{ width: '30px' }} />

                const action = rangeChart[hand] || null
                const color = getActionColor(action)
                const label = getActionLabel(action)

                return (
                  <button
                    key={hand}
                    onClick={() => handleCellClick(hand)}
                    style={{
                      width: '30px',
                      height: '30px',
                      padding: '0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: `${color}20`,
                      border: `1px solid ${color}`,
                      borderRadius: '0.25rem',
                      color,
                      fontFamily: C.font,
                      fontSize: '0.7rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      title: `${hand}: ${action || 'null'}`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = color
                      e.currentTarget.style.color = 'white'
                      e.currentTarget.style.fontWeight = 'bold'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = `${color}20`
                      e.currentTarget.style.color = color
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: '1.5rem',
          padding: '1rem',
          background: 'rgba(0, 229, 255, 0.02)',
          borderRadius: '0.375rem',
          border: `1px solid ${C.border}`,
          fontSize: '0.875rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: '1rem',
              height: '1rem',
              background: C.success,
              borderRadius: '0.25rem',
            }}
          />
          <span>Raise (R)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: '1rem',
              height: '1rem',
              background: C.warning,
              borderRadius: '0.25rem',
            }}
          />
          <span>Call (C)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: '1rem',
              height: '1rem',
              background: C.danger,
              borderRadius: '0.25rem',
            }}
          />
          <span>Fold (F)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: '1rem',
              height: '1rem',
              background: C.border,
              borderRadius: '0.25rem',
            }}
          />
          <span>Null (·)</span>
        </div>
      </div>

      {/* Instructions */}
      <div
        style={{
          marginTop: '1rem',
          padding: '0.75rem',
          background: 'rgba(0, 229, 255, 0.04)',
          borderRadius: '0.375rem',
          fontSize: '0.75rem',
          color: C.muted,
        }}
      >
        Click any cell to cycle through actions: null → raise → call → fold → null
      </div>
    </div>
  )
}
