import { useState, useRef, useCallback, useMemo } from 'react'

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const
type RangeAction = 'raise' | 'call' | 'fold' | null
type RangeChart = Record<string, RangeAction>

const RANGE_POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as const
type RangePosition = (typeof RANGE_POSITIONS)[number]

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#0a0a1a',
  card: '#13132a',
  border: '#1e1e3f',
  accent: '#00e5ff',
  text: '#ffffff',
  muted: '#9ca3af',
  success: '#f97316', // Raise — orange
  warning: '#00e5ff', // Call  — cyan
  danger: '#6b7280',  // Fold  — grey
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

function getActionLabel(action: RangeAction, isWatermark: boolean): string {
  switch (action) {
    case 'raise': return 'R'
    case 'call': return 'C'
    case 'fold': return 'F'
    case null: return isWatermark ? 'F' : '\u00B7'
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
  /** Tier 3: per-position range overrides */
  positionalRanges?: Partial<Record<RangePosition, RangeChart>>
  /** Tier 3: callback when a position-specific range changes */
  onPositionalChange?: (pos: RangePosition, rangeChart: RangeChart) => void
}

// ─── Main component ────────────────────────────────────────────────────────

export default function RangeChartComponent({
  rangeChart = {},
  onChange,
  positionalRanges,
  onPositionalChange,
}: RangeChartProps) {
  const [paintAction, setPaintAction] = useState<RangeAction>('raise')
  const [activePos, setActivePos] = useState<RangePosition | null>(null)
  const isPaintingRef = useRef(false)
  const pendingRef = useRef<RangeChart>({})
  const localOverrides = useRef<Record<string, RangeAction>>({})
  const [, forceRender] = useState(0)

  const isPositionalMode = !!onPositionalChange

  // Active chart: position-specific or global
  const activeChart: RangeChart = useMemo(() => {
    if (activePos !== null && positionalRanges) {
      return positionalRanges[activePos] ?? {}
    }
    return rangeChart ?? {}
  }, [activePos, positionalRanges, rangeChart])

  // Does the active position have any data?
  const positionHasData = useMemo(() => {
    if (activePos === null) return true
    const chart = positionalRanges?.[activePos]
    return chart !== undefined && Object.keys(chart).length > 0
  }, [activePos, positionalRanges])

  // Effective action for a cell: local override (during drag) or actual chart value
  const getEffectiveAction = useCallback(
    (hand: string): RangeAction => {
      if (hand in localOverrides.current) return localOverrides.current[hand]
      return activeChart[hand] || null
    },
    [activeChart],
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
    const updated = { ...activeChart }
    for (const [hand, action] of Object.entries(pendingRef.current)) {
      if (action === null) {
        delete updated[hand]
      } else {
        updated[hand] = action
      }
    }
    pendingRef.current = {}
    localOverrides.current = {}
    if (activePos !== null && onPositionalChange) {
      onPositionalChange(activePos, updated)
    } else {
      onChange(updated)
    }
  }, [activeChart, activePos, onPositionalChange, onChange])

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
  const handleClearAll = () => {
    if (activePos !== null && onPositionalChange) {
      onPositionalChange(activePos, {})
    } else {
      onChange({})
    }
    localOverrides.current = {}
    pendingRef.current = {}
  }

  const handleSetAllRaise = () => {
    const newChart: RangeChart = {}
    ALL_HANDS.forEach((hand) => { newChart[hand] = 'raise' })
    if (activePos !== null && onPositionalChange) {
      onPositionalChange(activePos, newChart)
    } else {
      onChange(newChart)
    }
    localOverrides.current = {}
    pendingRef.current = {}
  }

  // Tab switch: flush pending first
  const handleTabChange = (pos: RangePosition | null) => {
    if (isPaintingRef.current) {
      isPaintingRef.current = false
      flushChanges()
    }
    localOverrides.current = {}
    pendingRef.current = {}
    setActivePos(pos)
  }

  // Range statistics — unset combos are counted as Fold
  const stats = useMemo(() => {
    let raiseC = 0, callC = 0, foldC = 0
    for (const hand of ALL_HANDS) {
      const action = activeChart[hand] || null
      const combos = getComboCount(hand)
      if (action === 'raise') raiseC += combos
      else if (action === 'call') callC += combos
      else foldC += combos // null → defaults to Fold
    }
    return { raiseC, callC, foldC }
  }, [activeChart])

  const PAINT_MODES: { action: RangeAction; label: string; color: string }[] = [
    { action: 'raise', label: 'Raise', color: C.success },
    { action: 'call', label: 'Call', color: C.warning },
    { action: 'fold', label: 'Fold', color: C.danger },
    { action: null, label: 'Clear', color: C.muted },
  ]

  return (
    <div>
      {/* Position Tab Bar (Tier 3 only) */}
      {isPositionalMode && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div
            style={{
              display: 'flex',
              gap: '0.375rem',
              flexWrap: 'wrap',
            }}
          >
            {/* Global tab */}
            <button
              onClick={() => handleTabChange(null)}
              style={{
                padding: '0.4rem 0.875rem',
                background: activePos === null ? `${C.accent}18` : 'transparent',
                border: `2px solid ${activePos === null ? C.accent : C.border}`,
                color: activePos === null ? C.accent : C.muted,
                borderRadius: '0.375rem',
                fontFamily: C.font,
                fontSize: '0.9rem',
                fontWeight: activePos === null ? 'bold' : 'normal',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              Global
            </button>
            {/* Position tabs */}
            {RANGE_POSITIONS.map((pos) => {
              const isActive = activePos === pos
              const hasData = positionalRanges?.[pos] !== undefined &&
                Object.keys(positionalRanges[pos]!).length > 0
              return (
                <button
                  key={pos}
                  onClick={() => handleTabChange(pos)}
                  style={{
                    padding: '0.4rem 0.875rem',
                    background: isActive ? `${C.accent}18` : 'transparent',
                    border: `2px solid ${isActive ? C.accent : C.border}`,
                    color: isActive ? C.accent : C.muted,
                    borderRadius: '0.375rem',
                    fontFamily: C.font,
                    fontSize: '0.9rem',
                    fontWeight: isActive ? 'bold' : 'normal',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    position: 'relative',
                  }}
                >
                  {pos}
                  {/* Dot indicator for positions with data */}
                  {hasData && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        background: C.accent,
                        display: 'block',
                      }}
                    />
                  )}
                </button>
              )
            })}
          </div>

          {/* Inheriting from Global notice */}
          {activePos !== null && !positionHasData && (
            <div
              style={{
                marginTop: '0.625rem',
                padding: '0.5rem 0.75rem',
                background: `${C.accent}08`,
                border: `1px solid ${C.accent}30`,
                borderRadius: '0.375rem',
                fontSize: '0.75rem',
                color: C.muted,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span style={{ color: C.accent, fontSize: '0.875rem' }}>ℹ</span>
              <span>
                Inheriting from Global — paint any cell to create a{' '}
                <strong style={{ color: C.text }}>{activePos}</strong>-specific override
              </span>
            </div>
          )}
        </div>
      )}

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
                boxShadow: isActive ? `0 0 0 2px ${mode.color}` : 'none',
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
          {/* Suited axis label */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: '2px', marginBottom: '2px' }}>
            <span style={{ fontSize: '0.65rem', color: `${C.muted}70`, fontFamily: C.font, letterSpacing: '0.02em' }}>
              Suited ↙
            </span>
          </div>

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
                  fontSize: '0.8rem',
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
            <div key={rowIdx} style={{ display: 'flex', gap: '2px', marginBottom: rowIdx === RANKS.length - 1 ? '0' : '2px' }}>
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8rem',
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
                const isUnset = action === null
                const color = isUnset ? C.border : getActionColor(action)
                const label = getActionLabel(action, /* watermark= */ isUnset)

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
                      background: isUnset ? `${C.border}18` : `${color}20`,
                      border: `1px solid ${color}`,
                      borderRadius: '0.2rem',
                      color: isUnset ? '#d4d4d8' : color,
                      fontFamily: C.font,
                      fontSize: '0.75rem',
                      fontWeight: isUnset ? 'normal' : 'bold',
                      cursor: 'crosshair',
                      transition: 'background 0.08s',
                    }}
                    title={`${hand}: ${isUnset ? 'unset (defaults to Fold)' : action}`}
                  >
                    {label}
                  </div>
                )
              })}
            </div>
          ))}
          {/* Offsuit axis label */}
          <div style={{ display: 'flex', paddingLeft: '32px', marginTop: '2px' }}>
            <span style={{ fontSize: '0.65rem', color: `${C.muted}70`, fontFamily: C.font, letterSpacing: '0.02em' }}>
              ↖ Offsuit
            </span>
          </div>
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
            Range Coverage
          </span>
          <span style={{ fontSize: '0.75rem', color: C.muted }}>
            {((stats.raiseC / TOTAL_COMBOS) * 100).toFixed(1)}% R &nbsp;/&nbsp;
            {((stats.callC / TOTAL_COMBOS) * 100).toFixed(1)}% C &nbsp;/&nbsp;
            {((stats.foldC / TOTAL_COMBOS) * 100).toFixed(1)}% F
          </span>
        </div>

        {/* Segmented progress bar */}
        <div
          style={{
            height: '6px',
            background: C.border,
            borderRadius: '3px',
            overflow: 'hidden',
            marginBottom: '0.75rem',
            display: 'flex',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${(stats.raiseC / TOTAL_COMBOS) * 100}%`,
              background: C.success,
              transition: 'width 0.2s',
            }}
          />
          <div
            style={{
              height: '100%',
              width: `${(stats.callC / TOTAL_COMBOS) * 100}%`,
              background: C.warning,
              transition: 'width 0.2s',
            }}
          />
          <div
            style={{
              height: '100%',
              width: `${(stats.foldC / TOTAL_COMBOS) * 100}%`,
              background: `${C.danger}60`,
              transition: 'width 0.2s',
            }}
          />
        </div>

        {/* Breakdown */}
        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.875rem' }}>
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
          fontSize: '1rem',
          flexWrap: 'wrap',
          alignItems: 'center',
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
          <div style={{ width: '0.875rem', height: '0.875rem', background: `${C.border}18`, border: `1px solid ${C.border}`, borderRadius: '0.2rem' }} />
          <span style={{ color: C.muted }}>Unset</span>
        </div>
        <span style={{ color: `${C.muted}80`, fontSize: '0.7rem' }}>
          Unset cells default to: <strong style={{ color: C.muted }}>Fold</strong>
        </span>
        <span style={{ color: C.muted, marginLeft: 'auto', fontSize: '0.7rem' }}>
          Click & drag to paint cells
        </span>
      </div>
    </div>
  )
}
