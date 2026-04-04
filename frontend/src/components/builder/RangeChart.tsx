import { useState, useRef, useCallback, useMemo } from 'react'

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const
type RangeAction = 'raise' | 'call' | 'fold' | null
type RangeChart = Record<string, RangeAction>

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#0a0a1a',
  card: '#13132a',
  border: '#1e1e3f',
  accent: '#00e5ff',
  text: '#ffffff',
  muted: '#9ca3af',
  success: '#1d9e75', // Raise
  warning: '#b5851b', // Call
  danger: '#e24b4a', // Fold
  font: "'Trebuchet MS', sans-serif",
}

// ─── Color / label helpers ────────────────────────────────────────────────────

function getActionColor(action: RangeAction): string {
  switch (action) {
    case 'raise': return C.success
    case 'call': return C.warning
    case 'fold': return C.danger
    case null: return C.border
    default: return C.border
  }
}

function getActionLabel(action: RangeAction): string {
  switch (action) {
    case 'raise': return 'R'
    case 'call': return 'C'
    case 'fold': return 'F'
    case null: return '\u00B7'
    default: return '\u00B7'
  }
}

// ─── Combo weight calculation ─────────────────────────────────────────────────

const TOTAL_COMBOS = 1326 // 13*6 + 78*4 + 78*12

function getComboCount(notation: string): number {
  if (notation.length === 2) return 6       // pair (AA, KK, ...)
  if (notation.endsWith('s')) return 4      // suited
  return 12                                  // offsuit
}

// ─── Build 13x13 matrix (static) ─────────────────────────────────────────────

function buildMatrix(): string[][] {
  const matrix: string[][] = Array(13).fill(null).map(() => Array(13).fill(''))
  for (let i = 0; i < RANKS.length; i++) {
    for (let j = 0; j < RANKS.length; j++) {
      if (i === j) {
        matrix[i][j] = `${RANKS[i]}${RANKS[j]}`
      } else if (i < j) {
        matrix[i][j] = `${RANKS[i]}${RANKS[j]}s`
      } else {
        matrix[i][j] = `${RANKS[j]}${RANKS[i]}o`
      }
    }
  }
  return matrix
}

const MATRIX = buildMatrix()

function generateAllHandNotations(): string[] {
  const hands: string[] = []
  for (const row of MATRIX) {
    for (const hand of row) {
      if (hand) hands.push(hand)
    }
  }
  return hands
}

const ALL_HANDS = generateAllHandNotations()

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
  const [paintAction, setPaintAction] = useState<RangeAction>('raise')
  const isPaintingRef = useRef(false)
  const pendingRef = useRef<RangeChart>({})
  const localOverrides = useRef<Record<string, RangeAction>>({})
  const [, forceRender] = useState(0)

  // Effective action for a cell: local override (during drag) or actual chart value
  const getEffectiveAction = useCallback(
    (hand: string): RangeAction => {
      if (hand in localOverrides.current) return localOverrides.current[hand]
      return rangeChart[hand] || null
    },
    [rangeChart],
  )

  // Paint a single cell
  const paintCell = useCallback(
    (hand: string) => {
      const newAction = paintAction
      localOverrides.current[hand] = newAction
      pendingRef.current[hand] = newAction
      forceRender((n) => n + 1)
    },
    [paintAction],
  )

  // Flush pending changes to parent
  const flushChanges = useCallback(() => {
    if (Object.keys(pendingRef.current).length === 0) return
    const updated = { ...rangeChart }
    for (const [hand, action] of Object.entries(pendingRef.current)) {
      if (action === null) {
        delete updated[hand]
      } else {
        updated[hand] = action
      }
    }
    pendingRef.current = {}
    localOverrides.current = {}
    onChange(updated)
  }, [rangeChart, onChange])

  // Mouse handlers
  const handleMouseDown = useCallback(
    (hand: string) => {
      isPaintingRef.current = true
      paintCell(hand)
    },
    [paintCell],
  )

  const handleMouseEnter = useCallback(
    (hand: string) => {
      if (!isPaintingRef.current) return
      paintCell(hand)
    },
    [paintCell],
  )

  const handleMouseUp = useCallback(() => {
    if (!isPaintingRef.current) return
    isPaintingRef.current = false
    flushChanges()
  }, [flushChanges])

  // Touch handlers
  const handleTouchStart = useCallback(
    (hand: string, e: React.TouchEvent) => {
      e.preventDefault()
      isPaintingRef.current = true
      paintCell(hand)
    },
    [paintCell],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isPaintingRef.current) return
      const touch = e.touches[0]
      const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null
      const hand = el?.dataset?.hand
      if (hand && !(hand in pendingRef.current)) {
        paintCell(hand)
      }
    },
    [paintCell],
  )

  const handleTouchEnd = useCallback(() => {
    if (!isPaintingRef.current) return
    isPaintingRef.current = false
    flushChanges()
  }, [flushChanges])

  // Bulk actions
  const handleClearAll = () => onChange({})
  const handleSetAllRaise = () => {
    const newChart: RangeChart = {}
    ALL_HANDS.forEach((hand) => { newChart[hand] = 'raise' })
    onChange(newChart)
  }

  // Range statistics
  const stats = useMemo(() => {
    let raiseC = 0, callC = 0, foldC = 0, totalPlayed = 0
    for (const hand of ALL_HANDS) {
      const action = rangeChart[hand] || null
      if (action === null) continue
      const combos = getComboCount(hand)
      totalPlayed += combos
      if (action === 'raise') raiseC += combos
      else if (action === 'call') callC += combos
      else if (action === 'fold') foldC += combos
    }
    return {
      totalPlayed,
      pct: ((totalPlayed / TOTAL_COMBOS) * 100).toFixed(1),
      raiseC,
      callC,
      foldC,
    }
  }, [rangeChart])

  const PAINT_MODES: { action: RangeAction; label: string; color: string }[] = [
    { action: 'raise', label: 'Raise', color: C.success },
    { action: 'call', label: 'Call', color: C.warning },
    { action: 'fold', label: 'Fold', color: C.danger },
    { action: null, label: 'Clear', color: C.muted },
  ]

  return (
    <div>
      {/* Paint mode selector + bulk actions */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
        }}
      >
        {PAINT_MODES.map((mode) => {
          const isActive = paintAction === mode.action
          return (
            <button
              key={mode.label}
              onClick={() => setPaintAction(mode.action)}
              style={{
                padding: '0.5rem 1rem',
                background: isActive ? `${mode.color}30` : 'transparent',
                border: `2px solid ${isActive ? mode.color : C.border}`,
                color: isActive ? mode.color : C.muted,
                borderRadius: '0.375rem',
                fontFamily: C.font,
                fontSize: '0.8rem',
                fontWeight: isActive ? 'bold' : 'normal',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {mode.label}
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        <button
          onClick={handleClearAll}
          style={{
            padding: '0.5rem 0.75rem',
            background: 'transparent',
            border: `1px solid ${C.border}`,
            color: C.muted,
            borderRadius: '0.375rem',
            fontFamily: C.font,
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
        >
          Clear All
        </button>
        <button
          onClick={handleSetAllRaise}
          style={{
            padding: '0.5rem 0.75rem',
            background: `${C.success}15`,
            border: `1px solid ${C.success}50`,
            color: C.success,
            borderRadius: '0.375rem',
            fontFamily: C.font,
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
        >
          Raise All
        </button>
      </div>

      {/* Grid */}
      <div
        style={{
          padding: '0.75rem',
          background: 'rgba(0, 229, 255, 0.02)',
          borderRadius: '0.5rem',
          border: `1px solid ${C.border}`,
          overflowX: 'auto',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchEnd={handleTouchEnd}
      >
        <div style={{ display: 'inline-block', minWidth: '100%' }}>
          {/* Header row */}
          <div style={{ display: 'flex', gap: '2px', marginBottom: '2px' }}>
            <div style={{ width: '30px' }} />
            {RANKS.map((rank) => (
              <div
                key={rank}
                style={{
                  width: '30px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem',
                  fontWeight: 'bold',
                  color: C.muted,
                }}
              >
                {rank}
              </div>
            ))}
          </div>

          {/* Grid rows */}
          {MATRIX.map((row, rowIdx) => (
            <div key={rowIdx} style={{ display: 'flex', gap: '2px', marginBottom: '2px' }}>
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem',
                  fontWeight: 'bold',
                  color: C.muted,
                }}
              >
                {RANKS[rowIdx]}
              </div>

              {row.map((hand, colIdx) => {
                if (!hand)
                  return <div key={`${rowIdx}-${colIdx}`} style={{ width: '30px' }} />

                const action = getEffectiveAction(hand)
                const color = getActionColor(action)
                const label = getActionLabel(action)

                return (
                  <div
                    key={hand}
                    data-hand={hand}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      handleMouseDown(hand)
                    }}
                    onMouseEnter={() => handleMouseEnter(hand)}
                    onTouchStart={(e) => handleTouchStart(hand, e)}
                    onTouchMove={handleTouchMove}
                    style={{
                      width: '30px',
                      height: '30px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: `${color}20`,
                      border: `1px solid ${color}`,
                      borderRadius: '0.2rem',
                      color,
                      fontFamily: C.font,
                      fontSize: '0.65rem',
                      fontWeight: 'bold',
                      cursor: 'crosshair',
                      transition: 'background 0.08s',
                    }}
                    title={`${hand}: ${action || 'null'}`}
                  >
                    {label}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Range Statistics */}
      <div
        style={{
          marginTop: '1rem',
          padding: '1rem',
          background: 'rgba(0, 229, 255, 0.02)',
          borderRadius: '0.375rem',
          border: `1px solid ${C.border}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem',
          }}
        >
          <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: C.text }}>
            Playing {stats.totalPlayed} / {TOTAL_COMBOS} combos ({stats.pct}%)
          </span>
        </div>

        {/* Progress bar */}
        <div
          style={{
            height: '6px',
            background: C.border,
            borderRadius: '3px',
            overflow: 'hidden',
            marginBottom: '0.75rem',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${(stats.totalPlayed / TOTAL_COMBOS) * 100}%`,
              background: `linear-gradient(to right, ${C.success}, ${C.accent})`,
              borderRadius: '3px',
              transition: 'width 0.2s',
            }}
          />
        </div>

        {/* Breakdown */}
        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem' }}>
          <span style={{ color: C.success }}>
            Raise: {stats.raiseC} ({((stats.raiseC / TOTAL_COMBOS) * 100).toFixed(1)}%)
          </span>
          <span style={{ color: C.warning }}>
            Call: {stats.callC} ({((stats.callC / TOTAL_COMBOS) * 100).toFixed(1)}%)
          </span>
          <span style={{ color: C.danger }}>
            Fold: {stats.foldC} ({((stats.foldC / TOTAL_COMBOS) * 100).toFixed(1)}%)
          </span>
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: '1.5rem',
          marginTop: '0.75rem',
          padding: '0.75rem',
          background: 'rgba(0, 229, 255, 0.02)',
          borderRadius: '0.375rem',
          border: `1px solid ${C.border}`,
          fontSize: '0.8rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '0.875rem', height: '0.875rem', background: C.success, borderRadius: '0.2rem' }} />
          <span style={{ color: C.muted }}>Raise</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '0.875rem', height: '0.875rem', background: C.warning, borderRadius: '0.2rem' }} />
          <span style={{ color: C.muted }}>Call</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '0.875rem', height: '0.875rem', background: C.danger, borderRadius: '0.2rem' }} />
          <span style={{ color: C.muted }}>Fold</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '0.875rem', height: '0.875rem', background: C.border, borderRadius: '0.2rem' }} />
          <span style={{ color: C.muted }}>Unset</span>
        </div>
        <span style={{ color: C.muted, marginLeft: 'auto', fontSize: '0.7rem' }}>
          Click & drag to paint cells
        </span>
      </div>
    </div>
  )
}
