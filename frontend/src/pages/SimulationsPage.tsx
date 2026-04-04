import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AlertTriangle, ArrowDown, ArrowUp, GitCompare, Trash2, TrendingUp, Trophy, X, Zap } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts'
import api from '../lib/axios'
import { Sidebar } from '../components/Sidebar'
import { METRIC_TOOLTIPS } from '../constants/simulation-metrics'
import CustomSelect from '../components/CustomSelect'
import { C, T, barTrack, barFill, microLabel, primaryButtonStyle, sectionHeaderStyle } from '../styles/tokens'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Bot {
  id: string
  name: string
  active: boolean
  strategy?: { tier?: string }
}

interface Simulation {
  id: string
  bot_id: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  hand_count: number
  progress_hands: number
  opponent_profile: 'AGGRESSIVE_SHARKS' | 'TIGHT_PASSIVE' | 'CURRENT_META'
  table_size?: number
  created_at: string
  completed_at: string | null
  progress?: number
  config_snapshot?: { botName?: string; tableSize?: number; opponents?: { id: string; name: string }[] }
}

interface SimulationResult {
  total_profit: number
  bb_per_100: number
  win_rate: number
  vpip: number
  pfr: number
  aggression_factor: number
  heatmap_data: Record<string, { wins: number; losses: number; hands: number }>
  equity_realization: number
  profit_curve?: number[]
}

type OpponentProfile = 'AGGRESSIVE_SHARKS' | 'TIGHT_PASSIVE' | 'CURRENT_META'
type TableSize = 2 | 3 | 6 | 9

// ─── Opponent mix config ──────────────────────────────────────────────────────

const MIX_INFO: Record<OpponentProfile, { label: string; desc: string; color: string }> = {
  AGGRESSIVE_SHARKS: {
    label: 'Shark Tank',
    desc: 'A cutthroat table — 3-bet machines and bluff-heavy sharks dominate, with a few nits folding under pressure.',
    color: '#e24b4a',
  },
  TIGHT_PASSIVE: {
    label: 'Fish Pond',
    desc: 'A passive pond of nits and calling stations, with a couple of sharks lurking in late position.',
    color: '#f59e0b',
  },
  CURRENT_META: {
    label: 'Pure Meta',
    desc: 'A balanced field reflecting real-world competition — half GTO-adjacent regulars, split evenly between sharks and nits.',
    color: '#00e5ff',
  },
}

/** Fractional seat weights per player type, mirroring backend LINEUP_DISTRIBUTIONS. */
const LINEUP_DISTRIBUTION: Record<OpponentProfile, { Shark: number; Nit: number; Meta: number }> = {
  AGGRESSIVE_SHARKS: { Shark: 0.75, Nit: 0.25, Meta: 0 },
  TIGHT_PASSIVE:     { Shark: 0.25, Nit: 0.75, Meta: 0 },
  CURRENT_META:      { Shark: 0.25, Nit: 0.25, Meta: 0.5 },
}

const PLAYER_TYPE_COLOR: Record<string, string> = {
  Shark: '#e24b4a',
  Nit: '#f59e0b',
  Meta: '#00e5ff',
}

/** Returns an ordered array of circle colors for the mix preview. */
function getMixCircles(profile: OpponentProfile, tableSize: number): string[] {
  const total = tableSize - 1
  const dist = LINEUP_DISTRIBUTION[profile]
  const entries = Object.entries(dist).filter(([, w]) => w > 0) as [string, number][]
  const floors = entries.map(([type, w]) => ({ type, raw: w * total, count: Math.floor(w * total) }))
  const remainder = total - floors.reduce((s, f) => s + f.count, 0)
  floors.sort((a, b) => (b.raw - b.count) - (a.raw - a.count))
  for (let i = 0; i < remainder; i++) floors[i].count++
  const circles: string[] = []
  for (const { type, count } of floors) {
    for (let i = 0; i < count; i++) circles.push(PLAYER_TYPE_COLOR[type] ?? C.muted)
  }
  return circles
}

// ─── Chart tooltip (module scope — must not be defined inside render) ──────────

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number }>
  label?: number
}

const CustomTooltip = ({ active, payload, label }: ChartTooltipProps) => {
  if (!active || !payload?.length) return null
  const valA = payload.find(p => p.dataKey === 'a')?.value ?? 0
  const valB = payload.find(p => p.dataKey === 'b')?.value ?? 0
  const delta = valB - valA
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
      padding: '8px 12px', fontSize: 11, fontFamily: C.font,
    }}>
      <div style={{ color: C.muted, marginBottom: 4 }}>Hand {label}</div>
      <div style={{ color: '#06b6d4', marginBottom: 2 }}>A: {valA >= 0 ? '+' : ''}{valA}</div>
      <div style={{ color: '#f97316', marginBottom: 4 }}>B: {valB >= 0 ? '+' : ''}{valB}</div>
      <div style={{ color: delta >= 0 ? C.success : C.danger, fontWeight: 700 }}>
        Δ {delta >= 0 ? '+' : ''}{delta}
      </div>
    </div>
  )
}

/** Parses config_snapshot.opponents to produce "6 Sharks, 2 Nits" style summary. */
function getLineupBreakdown(sim: Simulation): string | null {
  const opponents = sim.config_snapshot?.opponents
  if (!opponents || opponents.length === 0) return null
  const counts: Record<string, number> = {}
  for (const opp of opponents) {
    const type = opp.id.includes('shark') ? 'Sharks'
               : opp.id.includes('tight') ? 'Nits'
               : opp.id.includes('meta')  ? 'Meta'
               : 'Other'
    counts[type] = (counts[type] ?? 0) + 1
  }
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([type, n]) => `${n} ${type}`)
    .join(', ')
}

const MIX_LABEL: Record<OpponentProfile, string> = {
  AGGRESSIVE_SHARKS: 'Shark Tank',
  TIGHT_PASSIVE: 'Fish Pond',
  CURRENT_META: 'Pure Meta',
}

const TABLE_POSITIONS: Record<number, string[]> = {
  2: ['BTN/SB', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO'],
}

// ─── Mini Table Map ───────────────────────────────────────────────────────────

function MiniTableMap({ seats, showWarning }: { seats: number; showWarning?: boolean }) {
  const cx = 60
  const cy = 44
  const rx = 42, ry = 24
  const seatR = 6
  const angles = Array.from({ length: seats }, (_, i) => (2 * Math.PI * i) / seats - Math.PI / 2)

  const heroIndex = angles.reduce((maxI, angle, i) =>
    Math.sin(angle) > Math.sin(angles[maxI]) ? i : maxI, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <svg width={120} height={88} style={{ display: 'block' }}>
        <defs>
          <filter id="hero-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#06b6d4" floodOpacity="0.85" />
          </filter>
        </defs>
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#1a5232" stroke="#256b40" strokeWidth={1.5} />
        {angles.map((angle, i) => {
          const x = cx + (rx + 10) * Math.cos(angle)
          const y = cy + (ry + 8) * Math.sin(angle)
          const isHero = i === heroIndex
          return (
            <circle
              key={i} cx={x} cy={y} r={seatR}
              fill={isHero ? '#06b6d4' : '#3f3f46'}
              stroke={isHero ? '#00e5ff' : '#71717a'}
              strokeWidth={isHero ? 1.5 : 1}
              filter={isHero ? 'url(#hero-glow)' : undefined}
            />
          )
        })}
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{seats}P Table</div>
        <div style={{ color: C.muted, fontSize: 11 }}>{seats - 1} opponent{seats - 1 !== 1 ? 's' : ''}</div>
        {showWarning && (
          <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 2, letterSpacing: 0.3 }}>
            Slow to compute
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Simulation['status'] }) {
  const colors: Record<Simulation['status'], string> = {
    PENDING: '#6b7280',
    RUNNING: '#f59e0b',
    COMPLETED: '#1d9e75',
    FAILED: '#e24b4a',
  }
  return (
    <span style={{
      display: 'inline-block', padding: '3px 9px', borderRadius: 4,
      background: `${colors[status]}22`, color: colors[status],
      fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1,
    }}>
      {status}
    </span>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{ ...barTrack, marginTop: 6 }}>
      <div style={barFill(Math.min(100, pct), C.accent, true)} />
    </div>
  )
}

// ─── Metric tooltip ───────────────────────────────────────────────────────────

function MetricTooltip({ label, tip }: { label: string; tip: string }) {
  const [show, setShow] = useState(false)
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'help' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {label}
      <span style={{
        fontSize: 9, color: C.accent, border: `1px solid ${C.accent}`, borderRadius: '50%',
        width: 13, height: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        lineHeight: 1, flexShrink: 0,
      }}>?</span>
      {show && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
          background: '#0d1a2e', border: `1px solid ${C.accent}`, borderRadius: 6,
          padding: '8px 10px', width: 220, fontSize: 12, color: '#d1d5db',
          zIndex: 999, lineHeight: 1.5, pointerEvents: 'none', whiteSpace: 'normal',
          textTransform: 'none', letterSpacing: 'normal', fontWeight: 400,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          {tip}
        </div>
      )}
    </span>
  )
}

// ─── Action icon tooltip (matches MyBots hover pattern) ──────────────────────

function ActionTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
          transform: 'translateX(-50%)',
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 6,
          padding: '4px 8px', fontSize: 11, color: C.text, whiteSpace: 'nowrap',
          pointerEvents: 'none', zIndex: 100,
        }}>
          {label}
        </div>
      )}
    </div>
  )
}

// ─── Position heatmap grid ────────────────────────────────────────────────────

function Heatmap({ data, tableSize }: { data: Record<string, { wins: number; losses: number; hands: number }>; tableSize: number }) {
  const positions = TABLE_POSITIONS[tableSize] ?? TABLE_POSITIONS[9]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 8 }}>
      {positions.map(pos => {
        const entry = data[pos]
        if (!entry || entry.hands === 0) return (
          <div key={pos} style={{ background: C.border, borderRadius: 8, padding: '10px 8px', textAlign: 'center', opacity: 0.4 }}>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{pos}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>—</div>
          </div>
        )
        const winPct = entry.hands > 0 ? (entry.wins / entry.hands) * 100 : 0
        const intensity = Math.abs(winPct - 50) / 50
        const bgColor = winPct >= 50
          ? `rgba(29,158,117,${0.1 + intensity * 0.5})`
          : `rgba(226,75,74,${0.1 + intensity * 0.4})`
        return (
          <div key={pos} style={{ background: bgColor, borderRadius: 8, padding: '10px 8px', textAlign: 'center', border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 12, color: C.text, fontWeight: 700 }}>{pos}</div>
            <div style={{ fontSize: 15, color: winPct >= 50 ? C.success : C.danger, fontWeight: 700, marginTop: 2 }}>{winPct.toFixed(0)}%</div>
            <div style={{ fontSize: 12, color: C.muted }}>{entry.hands}h</div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Shared label style ───────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = { ...microLabel, display: 'block', marginBottom: 8 }

// ─── Compare Mode components ─────────────────────────────────────────────────

/** Inline Δ badge: green arrow up / red arrow down */
function Delta({ value, unit = '', higherIsBetter = true }: { value: number; unit?: string; higherIsBetter?: boolean }) {
  if (Math.abs(value) < 0.005) return <span style={{ fontSize: 11, color: C.muted }}>—</span>
  const improved = higherIsBetter ? value > 0 : value < 0
  const color = improved ? C.success : C.danger
  const sign = value > 0 ? '+' : ''
  const formatted = Math.abs(value) < 10 ? value.toFixed(2) : value.toFixed(1)
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {improved ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
      {sign}{formatted}{unit}
    </span>
  )
}

function ComparePanel({
  simA, simB, resultA, resultB,
  fmtBb, fmtPct, fmtAF, simLabel,
}: {
  simA: Simulation; simB: Simulation
  resultA: SimulationResult; resultB: SimulationResult
  fmtBb: (v: number) => string; fmtPct: (v: number) => string; fmtAF: (v: number) => string
  simLabel: (s: Simulation) => string
}) {
  const metrics: {
    label: string
    a: number; b: number
    fmt: (v: number) => string
    delta: number; unit: string
    higherIsBetter: boolean
    colA: string; colB: string
  }[] = [
    {
      label: 'BB/100',
      a: resultA.bb_per_100, b: resultB.bb_per_100,
      fmt: fmtBb,
      delta: resultB.bb_per_100 - resultA.bb_per_100, unit: '',
      higherIsBetter: true,
      colA: resultA.bb_per_100 >= 0 ? C.accent : C.danger,
      colB: resultB.bb_per_100 >= 0 ? C.accent : C.danger,
    },
    {
      label: 'VPIP',
      a: resultA.vpip, b: resultB.vpip,
      fmt: fmtPct,
      delta: (resultB.vpip - resultA.vpip) * 100, unit: '%',
      higherIsBetter: false,
      colA: C.text, colB: C.text,
    },
    {
      label: 'PFR',
      a: resultA.pfr, b: resultB.pfr,
      fmt: fmtPct,
      delta: (resultB.pfr - resultA.pfr) * 100, unit: '%',
      higherIsBetter: true,
      colA: C.text, colB: C.text,
    },
    {
      label: 'Agg Factor',
      a: resultA.aggression_factor, b: resultB.aggression_factor,
      fmt: fmtAF,
      delta: resultB.aggression_factor - resultA.aggression_factor, unit: '',
      higherIsBetter: true,
      colA: C.text, colB: C.text,
    },
    {
      label: 'Total Profit',
      a: resultA.total_profit, b: resultB.total_profit,
      fmt: v => v >= 0 ? `+${v}` : `${v}`,
      delta: resultB.total_profit - resultA.total_profit, unit: '',
      higherIsBetter: true,
      colA: resultA.total_profit >= 0 ? C.accent : C.danger,
      colB: resultB.total_profit >= 0 ? C.accent : C.danger,
    },
  ]

  // Position heatmap comparison
  const allPositions = Array.from(new Set([
    ...Object.keys(resultA.heatmap_data),
    ...Object.keys(resultB.heatmap_data),
  ]))

  // Comparison insights
  const insights: { icon: React.ReactNode; color: string; text: string }[] = []

  const bbDelta = resultB.bb_per_100 - resultA.bb_per_100
  if (Math.abs(bbDelta) > 0.5) {
    insights.push({
      icon: <TrendingUp size={14} />,
      color: bbDelta > 0 ? C.success : C.danger,
      text: bbDelta > 0
        ? `Run B earns ${bbDelta.toFixed(1)} more BB/100 — a meaningful win-rate improvement.`
        : `Run A outperforms by ${Math.abs(bbDelta).toFixed(1)} BB/100 — Run B regressed overall.`,
    })
  }

  const aggDelta = resultB.aggression_factor - resultA.aggression_factor
  const profitDelta = resultB.total_profit - resultA.total_profit
  if (aggDelta > 0.3 && profitDelta < 0) {
    insights.push({
      icon: <AlertTriangle size={14} />,
      color: C.warning,
      text: 'Run B has higher aggression but lower profit — over-bluffing may be bleeding EV.',
    })
  } else if (aggDelta > 0.3 && profitDelta >= 0) {
    insights.push({
      icon: <TrendingUp size={14} />,
      color: C.success,
      text: 'Run B is more aggressive and more profitable — the pressure game is working.',
    })
  }

  const pfrDelta = (resultB.pfr - resultA.pfr) * 100
  const vpipDelta = (resultB.vpip - resultA.vpip) * 100
  if (pfrDelta > 2 && vpipDelta < 1) {
    insights.push({
      icon: <Zap size={14} />,
      color: C.accent,
      text: 'Run B raises more pre-flop without playing more hands — tighter 3-bet discipline improving.',
    })
  }

  // Biggest position swing
  let bestSwing: { pos: string; delta: number } | null = null
  for (const pos of allPositions) {
    const dA = resultA.heatmap_data[pos], dB = resultB.heatmap_data[pos]
    if (!dA || !dB || dA.hands === 0 || dB.hands === 0) continue
    const delta = (dB.wins / dB.hands) - (dA.wins / dA.hands)
    if (!bestSwing || Math.abs(delta) > Math.abs(bestSwing.delta)) bestSwing = { pos, delta }
  }
  if (bestSwing && Math.abs(bestSwing.delta) > 0.03) {
    const { pos, delta } = bestSwing
    insights.push({
      icon: <Trophy size={14} />,
      color: delta > 0 ? C.success : C.danger,
      text: delta > 0
        ? `Biggest gain: ${pos} improved ${(delta * 100).toFixed(1)}% win rate in Run B.`
        : `Biggest leak: ${pos} dropped ${(Math.abs(delta) * 100).toFixed(1)}% win rate in Run B.`,
    })
  }

  if (insights.length === 0) {
    insights.push({
      icon: <Trophy size={14} />,
      color: C.muted,
      text: 'Runs are closely matched — differences are within normal variance.',
    })
  }

  const colHeader = (label: string, color: string) => (
    <div style={{ fontSize: 10, color, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Run A / Run B labels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 72px', gap: 8 }}>
        <div style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.3)', borderRadius: 6, padding: '7px 10px' }}>
          {colHeader('Run A', C.accent)}
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {simLabel(simA)}
          </div>
        </div>
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, padding: '7px 10px' }}>
          {colHeader('Run B', C.warning)}
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {simLabel(simB)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {colHeader('Δ B−A', C.muted)}
        </div>
      </div>

      {/* Equity Curve Chart */}
      {(() => {
        const curveA = resultA.profit_curve
        const curveB = resultB.profit_curve
        const hasCurves = curveA && curveA.length > 1 && curveB && curveB.length > 1
        const chartData = hasCurves
          ? Array.from({ length: Math.max(curveA!.length, curveB!.length) }, (_, i) => ({
              hand: i * 100,
              a: curveA![i] ?? curveA![curveA!.length - 1],
              b: curveB![i] ?? curveB![curveB!.length - 1],
            }))
          : []

        return (
          <div>
            <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
              Equity Curve
            </div>
            {hasCurves ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis
                    dataKey="hand"
                    tick={{ fill: C.muted, fontSize: 10 }}
                    tickFormatter={v => v >= 1000 ? `${v / 1000}k` : String(v)}
                    stroke={C.border}
                  />
                  <YAxis
                    tick={{ fill: C.muted, fontSize: 10 }}
                    tickFormatter={v => v >= 0 ? `+${v}` : String(v)}
                    stroke={C.border}
                    width={48}
                  />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="a" stroke="#06b6d4" strokeWidth={2} dot={false} name="Run A" />
                  <Line type="monotone" dataKey="b" stroke="#f97316" strokeWidth={2} dot={false} name="Run B" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ fontSize: 12, color: C.muted, padding: '14px 0', textAlign: 'center' }}>
                No curve data — re-run both simulations to generate equity curves.
              </div>
            )}
          </div>
        )
      })()}

      {/* Metrics diff rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {metrics.map(m => {
          const hasSignificantDelta = Math.abs(m.delta) >= 0.005
          const winnerA = hasSignificantDelta && (m.higherIsBetter ? m.a > m.b : m.a < m.b)
          const winnerB = hasSignificantDelta && (m.higherIsBetter ? m.b > m.a : m.b < m.a)
          const winGlow: React.CSSProperties = {
            boxShadow: '0 0 0 1px rgba(29,158,117,0.5)',
            borderRadius: 4, padding: '1px 5px',
            background: 'rgba(29,158,117,0.08)',
          }
          return (
            <div key={m.label} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 72px', gap: 8, alignItems: 'center',
              background: '#0d0d22', border: `1px solid ${C.border}`, borderRadius: 7, padding: '9px 12px',
            }}>
              <div>
                <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: m.colA, display: 'inline-block', ...(winnerA ? winGlow : {}) }}>{m.fmt(m.a)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, letterSpacing: 0.7, marginBottom: 2 }}>&nbsp;</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: m.colB, display: 'inline-block', ...(winnerB ? winGlow : {}) }}>{m.fmt(m.b)}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Delta value={m.delta} unit={m.unit} higherIsBetter={m.higherIsBetter} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Position heatmap comparison */}
      <div>
        <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
          Win Rate by Position
        </div>
        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 1fr 72px', gap: 6, padding: '0 4px 6px', borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}>
          <span />
          <span style={{ fontSize: 10, color: C.accent, fontWeight: 700, letterSpacing: 1 }}>RUN A</span>
          <span style={{ fontSize: 10, color: C.warning, fontWeight: 700, letterSpacing: 1 }}>RUN B</span>
          <span style={{ fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: 1, textAlign: 'center' }}>Δ</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {allPositions.map(pos => {
            const dA = resultA.heatmap_data[pos], dB = resultB.heatmap_data[pos]
            const wrA = dA && dA.hands > 0 ? dA.wins / dA.hands : null
            const wrB = dB && dB.hands > 0 ? dB.wins / dB.hands : null
            const delta = wrA !== null && wrB !== null ? (wrB - wrA) * 100 : null
            // bar fill intensity
            const fillA = wrA !== null ? `rgba(0,229,255,${(wrA * 0.6).toFixed(2)})` : 'transparent'
            const fillB = wrA !== null ? `rgba(245,158,11,${((wrB ?? 0) * 0.6).toFixed(2)})` : 'transparent'
            return (
              <div key={pos} style={{
                display: 'grid', gridTemplateColumns: '44px 1fr 1fr 72px', gap: 6, alignItems: 'center',
                background: '#0d0d22', border: `1px solid ${C.border}`, borderRadius: 5, padding: '6px 8px',
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>{pos}</span>
                <span style={{
                  fontSize: 13, fontWeight: 600, color: C.accent,
                  background: fillA, borderRadius: 4, padding: '1px 6px', display: 'inline-block',
                }}>
                  {wrA !== null ? `${(wrA * 100).toFixed(1)}%` : '—'}
                </span>
                <span style={{
                  fontSize: 13, fontWeight: 600, color: C.warning,
                  background: fillB, borderRadius: 4, padding: '1px 6px', display: 'inline-block',
                }}>
                  {wrB !== null ? `${(wrB * 100).toFixed(1)}%` : '—'}
                </span>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {delta !== null
                    ? <Delta value={delta} unit="%" higherIsBetter={true} />
                    : <span style={{ fontSize: 11, color: C.muted }}>—</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Comparison Insights */}
      <div style={{
        background: '#0d0d22', border: '1px solid rgba(0,229,255,0.3)',
        borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
          Comparison Insights
        </div>
        {insights.map((ins, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ color: ins.color, flexShrink: 0, marginTop: 1 }}>{ins.icon}</span>
            <span style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{ins.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Simulation Insights ─────────────────────────────────────────────────────

const META_TIPS: Record<OpponentProfile, string> = {
  AGGRESSIVE_SHARKS: 'Focus on protecting your blinds against high-frequency stealers. Tighten your 3-bet range from the blinds.',
  TIGHT_PASSIVE: 'Exploit the nits — increase your steal frequency from the BTN and CO against passive defenders.',
  CURRENT_META: 'Against a balanced field, focus on exploiting positional edges and maintaining a balanced 3-bet range.',
}

function SimulationInsights({ result, opponentProfile }: { result: SimulationResult; opponentProfile: OpponentProfile }) {
  // Overall Rating
  const bb = result.bb_per_100
  const rating = bb > 5
    ? { label: 'Crushing', color: C.success }
    : bb >= 1
    ? { label: 'Winning', color: C.accent }
    : bb >= -1
    ? { label: 'Breakeven', color: C.warning }
    : { label: 'Losing', color: C.danger }

  // Big Leak: position with lowest win rate
  const posEntries = Object.entries(result.heatmap_data)
    .filter(([, d]) => d.hands > 0)
    .map(([pos, d]) => ({ pos, wr: d.wins / d.hands }))
  const worstPos = posEntries.length > 0
    ? posEntries.reduce((a, b) => b.wr < a.wr ? b : a)
    : null

  // Style Analysis
  let styleMsg: string
  let styleColor: string
  if (result.aggression_factor < 1.5) {
    styleMsg = 'Playing too passively. Look for more bluffing and thin-value opportunities.'
    styleColor = C.warning
  } else if (result.vpip > 0.35 && result.pfr < result.vpip * 0.5) {
    styleMsg = 'Calling station tendencies detected — raise more pre-flop instead of calling.'
    styleColor = C.warning
  } else if (result.vpip < 0.15) {
    styleMsg = 'Playing too tight. Loosen up your range, especially from late position.'
    styleColor = C.warning
  } else {
    styleMsg = 'Aggression factor and VPIP/PFR ratio look balanced.'
    styleColor = C.success
  }

  const row = (icon: React.ReactNode, iconColor: string, children: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ color: iconColor, flexShrink: 0, marginTop: 2 }}>{icon}</span>
      <span style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{children}</span>
    </div>
  )

  return (
    <div style={{
      background: '#0d0d22',
      border: '1px solid rgba(0,229,255,0.3)',
      borderRadius: 10,
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <div style={{ fontSize: 12, color: C.accent, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
        Simulation Insights
      </div>

      {/* Overall Rating */}
      {row(
        <Trophy size={16} />,
        rating.color,
        <>
          <span style={{ color: C.muted }}>Overall: </span>
          <span style={{
            display: 'inline-block', padding: '1px 8px', borderRadius: 4,
            background: `${rating.color}22`, color: rating.color,
            fontWeight: 700, fontSize: 12, letterSpacing: 0.5,
          }}>
            {rating.label}
          </span>
          <span style={{ color: C.muted, fontSize: 12, marginLeft: 6 }}>({bb >= 0 ? '+' : ''}{bb.toFixed(1)} BB/100)</span>
        </>
      )}

      {/* Big Leak */}
      {worstPos && row(
        <AlertTriangle size={16} />,
        C.danger,
        <>
          <span style={{ color: C.muted }}>Big Leak: </span>
          <span style={{ fontWeight: 600 }}>{worstPos.pos}</span>
          {' '}has your lowest win rate at{' '}
          <span style={{ color: C.danger, fontWeight: 600 }}>{(worstPos.wr * 100).toFixed(1)}%</span>.
          {' '}Study your range from this position.
        </>
      )}

      {/* Style Analysis */}
      {row(
        <TrendingUp size={16} />,
        styleColor,
        <>
          <span style={{ color: C.muted }}>Style: </span>
          {styleMsg}
        </>
      )}

      {/* Meta Tip */}
      {row(
        <Zap size={16} />,
        C.accent,
        <>
          <span style={{ color: C.muted }}>Meta Tip: </span>
          {META_TIPS[opponentProfile]}
        </>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', background: '#0d0d22',
  border: `1px solid ${C.border}`, borderRadius: 8, color: C.text,
  fontSize: 15, fontFamily: C.font, outline: 'none', boxSizing: 'border-box',
}

// ─── Main page ────────────────────────────────────────────────────────────────

function CompareModePanel({ compareIds, simulations, compareResults, loadingCompare, clearCompare, formatBbPer100, formatPct, formatAF, simLabel }: {
  compareIds: string[]
  simulations: Simulation[]
  compareResults: Record<string, SimulationResult>
  loadingCompare: Record<string, boolean>
  clearCompare: () => void
  formatBbPer100: (v: number) => string
  formatPct: (v: number) => string
  formatAF: (v: number) => string
  simLabel: (s: Simulation) => string
}) {
  const [idA, idB] = compareIds
  const simA = simulations.find(s => s.id === idA)
  const simB = simulations.find(s => s.id === idB)
  const resA = compareResults[idA]
  const resB = compareResults[idB]
  const loading = loadingCompare[idA] || loadingCompare[idB]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GitCompare size={18} color={C.accent} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Compare Mode</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>Δ B − A</div>
          </div>
        </div>
        <button
          onClick={clearCompare}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: `1px solid ${C.border}`, borderRadius: 6,
            color: C.muted, cursor: 'pointer', fontSize: 13, padding: '5px 10px',
            fontFamily: C.font,
          }}
        >
          <X size={13} /> Exit Compare
        </button>
      </div>
      <div style={{ height: 1, background: C.border }} />
      {loading || !resA || !resB ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 0' }}>
          <div style={{ width: 32, height: 32, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'rp-spin 0.8s linear infinite' }} />
          <div style={{ fontSize: 14, color: C.muted }}>Loading comparison data…</div>
        </div>
      ) : simA && simB ? (
        <ComparePanel
          simA={simA} simB={simB}
          resultA={resA} resultB={resB}
          fmtBb={formatBbPer100} fmtPct={formatPct} fmtAF={formatAF}
          simLabel={simLabel}
        />
      ) : null}
    </div>
  )
}

export default function SimulationsPage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [selectedBotId, setSelectedBotId] = useState('')
  const [handCount, setHandCount] = useState(1000)
  const [opponentProfile, setOpponentProfile] = useState<OpponentProfile>('CURRENT_META')
  const [tableSize, setTableSize] = useState<TableSize>(9)
  const [hoveredSize, setHoveredSize] = useState<TableSize | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitDebounced, setSubmitDebounced] = useState(false)
  const [formError, setFormError] = useState('')

  const [simulations, setSimulations] = useState<Simulation[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [hoveredSimId, setHoveredSimId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [clearConfirm, setClearConfirm] = useState(false)

  const [selectedSim, setSelectedSim] = useState<Simulation | null>(null)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [loadingResult, setLoadingResult] = useState(false)
  const [quickStartBanner, setQuickStartBanner] = useState(false)

  // ── Compare mode ──────────────────────────────────────────────────────────
  const [compareIds, setCompareIds] = useState<[string, string] | [string] | []>([])
  const [compareResults, setCompareResults] = useState<Record<string, SimulationResult>>({})
  const [loadingCompare, setLoadingCompare] = useState<Record<string, boolean>>({})
  const compareMode = compareIds.length === 2

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const selectedSimRef = useRef<Simulation | null>(null)
  const resultRef = useRef<SimulationResult | null>(null)
  const loadingResultRef = useRef(false)
  const location = useLocation()

  // Keep refs in sync so polling callbacks always have fresh values
  useEffect(() => { selectedSimRef.current = selectedSim }, [selectedSim])
  useEffect(() => { resultRef.current = result }, [result])
  useEffect(() => { loadingResultRef.current = loadingResult }, [loadingResult])

  // Sequential init: fetch bots → fetch sims → cold-start or auto-select
  useEffect(() => {
    async function init() {
      const botList = await fetchBots()
      const simList = await fetchSimulations()

      if (simList.length === 0 && botList.length > 0) {
        // Cold start: run a starter simulation
        setQuickStartBanner(true)
        await runStarterSimulation(botList[0].id)
      } else if (simList.length > 0) {
        // Auto-select the most recent sim (list is newest-first from the API)
        const latest = simList[0]
        loadResult(latest)
      }
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Polling: restart interval whenever the running-sim set changes
  useEffect(() => {
    const hasRunning = simulations.some(s => s.status === 'PENDING' || s.status === 'RUNNING')
    if (hasRunning) {
      pollingRef.current = setInterval(fetchSimulations, 3000)
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [simulations])

  // Auto-load result the moment the selected sim transitions to COMPLETED
  useEffect(() => {
    if (
      selectedSim?.status === 'COMPLETED' &&
      !resultRef.current &&
      !loadingResultRef.current
    ) {
      loadResult(selectedSim)
      setQuickStartBanner(false)
    }
  }, [selectedSim?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchBots(): Promise<Bot[]> {
    try {
      const res = await api.get('/bots/my')
      const list: Bot[] = Array.isArray(res.data) ? res.data : res.data.data ?? []
      const active = list.filter((b: Bot) => b.active)
      setBots(active)
      const urlBotId = new URLSearchParams(location.search).get('botId')
      if (urlBotId && active.some((b: Bot) => b.id === urlBotId)) {
        setSelectedBotId(urlBotId)
      } else if (active.length > 0) {
        setSelectedBotId(active[0].id)
      }
      return active
    } catch {
      return []
    }
  }

  async function fetchSimulations(): Promise<Simulation[]> {
    try {
      const res = await api.get('/simulations')
      const list: Simulation[] = res.data.simulations ?? []
      setSimulations(list)
      setLoadingList(false)
      // Keep selectedSim metadata fresh during polling
      const current = selectedSimRef.current
      if (current) {
        const updated = list.find(s => s.id === current.id)
        if (updated) setSelectedSim(updated)
      }
      return list
    } catch {
      setLoadingList(false)
      return []
    }
  }

  async function runStarterSimulation(botId: string) {
    setSubmitting(true)
    try {
      await api.post('/simulations', {
        botId,
        handCount: 1000,
        opponentProfile: 'CURRENT_META',
        tableSize: 2,
      })
      const simList = await fetchSimulations()
      // Auto-select the newly created sim so the results panel shows progress
      if (simList.length > 0) loadResult(simList[0])
    } catch { /* silent — banner will stay hidden */ }
    finally { setSubmitting(false) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!selectedBotId) { setFormError('Please select a bot'); return }
    setSubmitting(true)
    if (tableSize === 9) {
      setSubmitDebounced(true)
      setTimeout(() => setSubmitDebounced(false), 2000)
    }
    try {
      await api.post('/simulations', { botId: selectedBotId, handCount, opponentProfile, tableSize })
      await fetchSimulations()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message ?? 'Failed to start simulation'
      setFormError(Array.isArray(msg) ? (msg as string[]).join(', ') : String(msg))
    } finally {
      setSubmitting(false)
    }
  }

  async function loadResult(sim: Simulation) {
    setSelectedSim(sim)
    setResult(null)
    if (sim.status !== 'COMPLETED') return
    setLoadingResult(true)
    try {
      const res = await api.get(`/simulations/${sim.id}/result`)
      setResult(res.data)
    } catch { /* silent */ }
    finally { setLoadingResult(false) }
  }

  async function handleReRun(sim: Simulation) {
    const sz = (sim.table_size ?? sim.config_snapshot?.tableSize ?? 9) as TableSize
    const botName = sim.config_snapshot?.botName
    const botId = bots.find(b => b.name === botName)?.id ?? selectedBotId
    if (!botId) return
    setTableSize(sz)
    setHandCount(sim.hand_count)
    setOpponentProfile(sim.opponent_profile)
    setSelectedBotId(botId)
    setFormError('')
    setSubmitting(true)
    if (sz === 9) {
      setSubmitDebounced(true)
      setTimeout(() => setSubmitDebounced(false), 2000)
    }
    try {
      await api.post('/simulations', { botId, handCount: sim.hand_count, opponentProfile: sim.opponent_profile, tableSize: sz })
      await fetchSimulations()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message ?? 'Failed to start simulation'
      setFormError(Array.isArray(msg) ? (msg as string[]).join(', ') : String(msg))
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteSimulation(id: string) {
    try {
      await api.delete(`/simulations/${id}`)
    } catch { /* already gone — still clean up UI */ }

    const updated = simulations.filter(s => s.id !== id)
    setSimulations(updated)
    setConfirmDeleteId(null)

    if (selectedSim?.id === id) {
      if (updated.length > 0) loadResult(updated[0])
      else { setSelectedSim(null); setResult(null) }
    }

    if ((compareIds as string[]).includes(id)) {
      setCompareIds(compareIds.filter(cid => cid !== id) as [] | [string])
      const nr = { ...compareResults }; delete nr[id]; setCompareResults(nr)
      const nl = { ...loadingCompare }; delete nl[id]; setLoadingCompare(nl)
    }
  }

  async function clearAllSimulations() {
    const deletable = simulations.filter(s => s.status === 'COMPLETED' || s.status === 'FAILED')
    await Promise.allSettled(deletable.map(s => api.delete(`/simulations/${s.id}`)))
    const remaining = simulations.filter(s => s.status === 'PENDING' || s.status === 'RUNNING')
    setSimulations(remaining)
    setClearConfirm(false)
    if (selectedSim && deletable.some(s => s.id === selectedSim.id)) {
      if (remaining.length > 0) loadResult(remaining[0])
      else { setSelectedSim(null); setResult(null) }
    }
    setCompareIds([]); setCompareResults({}); setLoadingCompare({})
  }

  async function fetchCompareResult(simId: string) {
    if (compareResults[simId] || loadingCompare[simId]) return
    setLoadingCompare(prev => ({ ...prev, [simId]: true }))
    try {
      const res = await api.get(`/simulations/${simId}/result`)
      setCompareResults(prev => ({ ...prev, [simId]: res.data }))
    } catch { /* silent */ }
    finally { setLoadingCompare(prev => ({ ...prev, [simId]: false })) }
  }

  function toggleCompare(sim: Simulation, e: React.MouseEvent | React.ChangeEvent) {
    e.stopPropagation()
    if (sim.status !== 'COMPLETED') return
    const alreadyIn = compareIds.includes(sim.id as never)
    if (alreadyIn) {
      setCompareIds(compareIds.filter(id => id !== sim.id) as [] | [string])
    } else {
      if (compareIds.length >= 2) return          // hard cap at 2
      const next = [...compareIds, sim.id] as [string] | [string, string]
      setCompareIds(next)
      fetchCompareResult(sim.id)
    }
  }

  function clearCompare() {
    setCompareIds([])
    setCompareResults({})
    setLoadingCompare({})
  }

  const formatBbPer100 = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`
  const formatPct = (v: number) => `${(v * 100).toFixed(1)}%`
  const formatAF = (v: number) => v >= 9000 ? '∞' : v.toFixed(2)
  const formatDateShort = (raw: string | null | undefined): string => {
    if (!raw) return '—'
    const d = new Date(raw)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function simLabel(sim: Simulation): string {
    const botName = sim.config_snapshot?.botName ?? 'Bot'
    const sz = sim.table_size ?? sim.config_snapshot?.tableSize ?? 9
    const mix = MIX_LABEL[sim.opponent_profile] ?? sim.opponent_profile
    return `${botName} vs ${sz}-Max ${mix}`
  }

  const TABLE_SIZES: TableSize[] = [2, 3, 6, 9]
  const isButtonDisabled = submitting || submitDebounced || bots.length === 0
  const hasRunningSimulation = simulations.some(s => s.status === 'PENDING' || s.status === 'RUNNING')
  const runningSimProgress = simulations.find(s => s.status === 'RUNNING') ?? simulations.find(s => s.status === 'PENDING') ?? null

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.bg, fontFamily: C.font }}>
      <Sidebar />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 28px', borderBottom: `1px solid ${C.border}`, background: '#0d0d22', flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>Simulations</div>
          <div style={{ marginLeft: 14, fontSize: 15, color: C.muted }}>
            Test your bot against opponent mixes in an isolated sandbox
          </div>
        </div>

        <main style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

          {/* ── Left column (60%) ─────────────────────────────────────────────── */}
          <div style={{ flex: '0 0 60%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto', padding: '28px' }}>

            {/* New Simulation form */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 28px', boxShadow: '0 4px 24px rgba(0,0,0,0.45)' }}>
              <div style={{ ...sectionHeaderStyle, marginBottom: 22 }}>New Simulation</div>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                {/* Bot selector */}
                <div>
                  <label style={labelStyle}>Bot</label>
                  <CustomSelect
                    value={selectedBotId}
                    onChange={setSelectedBotId}
                    options={bots.length === 0
                      ? [{ value: '', label: 'No active bots found' }]
                      : bots.map(b => ({ value: b.id, label: b.name }))}
                    placeholder={bots.length === 0 ? undefined : 'Select a bot…'}
                    style={{ width: '100%' }}
                  />
                </div>

                {/* Hand count */}
                <div>
                  <label style={labelStyle}>
                    Hand Count{' '}
                    <span style={{ color: C.muted, fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 13 }}>(1,000 – 10,000)</span>
                  </label>
                  <input
                    type="number"
                    min={1000}
                    max={10000}
                    step={500}
                    value={handCount}
                    onChange={e => setHandCount(Number(e.target.value))}
                    style={inputStyle}
                  />
                </div>

                {/* Table Size selector — grid of cards */}
                <div>
                  <style>{`
                    .table-size-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
                    @media (max-width: 600px) { .table-size-grid { grid-template-columns: repeat(2, 1fr); } }
                  `}</style>
                  <label style={labelStyle}>Table Size</label>
                  <div className="table-size-grid">
                    {TABLE_SIZES.map(sz => {
                      const selected = tableSize === sz
                      const hovered = hoveredSize === sz && !selected
                      return (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setTableSize(sz)}
                          onMouseEnter={() => setHoveredSize(sz)}
                          onMouseLeave={() => setHoveredSize(null)}
                          style={{
                            padding: '16px 8px', borderRadius: 12, cursor: 'pointer', fontFamily: C.font,
                            background: selected ? 'rgba(0,229,255,0.08)' : 'rgba(13,13,34,0.4)',
                            border: selected ? '2px solid #00e5ff' : `1px solid ${hovered ? '#3f3f6e' : C.border}`,
                            boxShadow: selected ? '0 0 15px rgba(6,182,212,0.3)' : 'none',
                            transform: hovered ? 'translateY(-2px)' : 'none',
                            transition: 'all 0.2s',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
                          }}
                        >
                          <MiniTableMap seats={sz} showWarning={sz === 9} />
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Choose Your Lineup */}
                <div>
                  <label style={labelStyle}>Choose Your Lineup</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(Object.keys(MIX_INFO) as OpponentProfile[]).map(profile => {
                      const info = MIX_INFO[profile]
                      const selected = opponentProfile === profile
                      const circles = getMixCircles(profile, tableSize)
                      return (
                        <button
                          key={profile}
                          type="button"
                          onClick={() => setOpponentProfile(profile)}
                          style={{
                            padding: '12px 16px', borderRadius: 14, textAlign: 'left', cursor: 'pointer', fontFamily: C.font,
                            background: selected ? `${info.color}12` : 'transparent',
                            border: `1px solid ${selected ? info.color : C.border}`,
                            boxShadow: selected ? `0 0 12px ${info.color}30` : 'none',
                            transition: 'all 0.2s',
                          }}
                        >
                          <div style={{ fontSize: 14, fontWeight: 600, color: selected ? info.color : C.text }}>{info.label}</div>
                          <div style={{ fontSize: 13, color: C.muted, marginTop: 3, lineHeight: 1.4 }}>{info.desc}</div>
                          {/* Mix Preview */}
                          <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                            {circles.map((color, i) => (
                              <span key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                            ))}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {formError && (
                  <div style={{ padding: '11px 16px', background: 'rgba(226,75,74,0.1)', border: `1px solid ${C.danger}`, borderRadius: 8, color: C.danger, fontSize: 14 }}>
                    {formError}
                  </div>
                )}

                {submitting || hasRunningSimulation ? (
                  <div>
                    <ProgressBar pct={runningSimProgress && runningSimProgress.hand_count > 0
                      ? (runningSimProgress.progress_hands / runningSimProgress.hand_count) * 100
                      : 0} />
                    <div style={{ fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 8 }}>
                      {runningSimProgress?.status === 'RUNNING'
                        ? `Simulating hand ${runningSimProgress.progress_hands.toLocaleString()} / ${runningSimProgress.hand_count.toLocaleString()}...`
                        : 'Starting...'}
                    </div>
                  </div>
                ) : (
                  <button
                    type="submit"
                    disabled={isButtonDisabled}
                    style={{
                      ...primaryButtonStyle,
                      padding: '12px 24px', fontSize: 15,
                      ...(isButtonDisabled && {
                        background: C.border,
                        boxShadow: 'none',
                        color: C.muted,
                        cursor: 'not-allowed',
                        opacity: 0.7,
                      }),
                    }}
                  >
                    Run Simulation
                  </button>
                )}
              </form>
            </div>

            {/* ── Past Simulations — flat table ─────────────────────────────── */}
            <div>
              {/* Section header row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={sectionHeaderStyle}>Past Simulations</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {compareIds.length > 0 && (
                    <>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: compareMode ? 'rgba(0,229,255,0.1)' : 'rgba(245,158,11,0.08)',
                        border: `1px solid ${compareMode ? 'rgba(0,229,255,0.4)' : 'rgba(245,158,11,0.4)'}`,
                        borderRadius: 6, padding: '4px 10px',
                      }}>
                        <GitCompare size={13} color={compareMode ? C.accent : C.warning} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: compareMode ? C.accent : C.warning }}>
                          {compareMode ? 'Compare Mode Active' : `${compareIds.length}/2 selected`}
                        </span>
                      </div>
                      <button
                        onClick={clearCompare}
                        title="Clear selection"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          background: 'none', border: `1px solid ${C.border}`, borderRadius: 5,
                          color: C.muted, cursor: 'pointer', fontSize: 12, padding: '4px 8px',
                          fontFamily: C.font,
                        }}
                      >
                        <X size={12} /> Clear
                      </button>
                    </>
                  )}
                  {simulations.length > 0 && !compareMode && (
                    <button
                      onClick={() => clearConfirm ? clearAllSimulations() : setClearConfirm(true)}
                      onMouseLeave={() => setClearConfirm(false)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: clearConfirm ? 'rgba(226,75,74,0.12)' : 'none',
                        border: `1px solid ${clearConfirm ? 'rgba(226,75,74,0.5)' : C.border}`,
                        borderRadius: 5, color: clearConfirm ? '#e24b4a' : C.muted,
                        cursor: 'pointer', fontSize: 12, padding: '4px 8px',
                        fontFamily: C.font, transition: 'all 0.15s',
                      }}
                    >
                      <Trash2 size={12} />
                      {clearConfirm ? 'Confirm clear?' : 'Clear History'}
                    </button>
                  )}
                </div>
              </div>

              {loadingList ? (
                <div style={{ color: C.muted, fontSize: 14, padding: '12px 0' }}>Loading...</div>
              ) : simulations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', borderRadius: 12, border: `1px dashed ${C.border}` }}>
                  <div style={{ fontSize: 40, marginBottom: 14 }}>🎮</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 6 }}>No simulations yet</div>
                  <div style={{ fontSize: 14, color: C.muted }}>Start your first simulation using the form above</div>
                </div>
              ) : (
                <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                  {/* Column headers */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '28px 1fr auto auto',
                    padding: '9px 16px', background: '#0d0d22',
                    borderBottom: `1px solid ${C.border}`, gap: 8,
                  }}>
                    <span />
                    <span style={{ fontSize: 12, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>Simulation</span>
                    <span style={{ fontSize: 12, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'right', marginRight: 24 }}>Date</span>
                    <span style={{ fontSize: 12, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'right' }}>Status</span>
                  </div>

                  {simulations.map((sim, idx) => {
                    const isSelected = selectedSim?.id === sim.id
                    const isHovered = hoveredSimId === sim.id
                    const isCompared = compareIds.includes(sim.id as never)
                    const compareSlot = compareIds.indexOf(sim.id as never)  // 0 = Run A, 1 = Run B
                    const canCompare = sim.status === 'COMPLETED'
                    const atMax = compareIds.length >= 2 && !isCompared
                    const progress = sim.hand_count > 0 ? Math.round((sim.progress_hands / sim.hand_count) * 100) : 0
                    const isLast = idx === simulations.length - 1

                    const slotColor = compareSlot === 0 ? C.accent : C.warning
                    const rowBg = isCompared
                      ? (compareSlot === 0 ? 'rgba(0,229,255,0.05)' : 'rgba(245,158,11,0.05)')
                      : isSelected ? C.accentDim
                      : isHovered ? 'rgba(255,255,255,0.02)' : 'transparent'
                    const leftBorder = isCompared ? slotColor : isSelected ? C.accent : isHovered ? 'rgba(0,229,255,0.4)' : 'transparent'

                    return (
                      <div
                        key={sim.id}
                        onMouseEnter={() => setHoveredSimId(sim.id)}
                        onMouseLeave={() => { setHoveredSimId(null); setConfirmDeleteId(null) }}
                        onClick={() => { if (!compareMode) loadResult(sim) }}
                        style={{
                          padding: '12px 16px',
                          cursor: compareMode ? 'default' : 'pointer',
                          borderBottom: isLast ? 'none' : `1px solid ${C.border}`,
                          borderLeft: `3px solid ${leftBorder}`,
                          background: rowBg,
                          transition: 'all 0.15s',
                          fontFamily: C.font,
                        }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 8, alignItems: 'center' }}>

                          {/* Checkbox */}
                          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {canCompare ? (
                              <ActionTooltip label={atMax ? 'Deselect a run to add another' : isCompared ? 'Remove from compare' : 'Add to compare'}>
                                <div
                                  onClick={e => toggleCompare(sim, e)}
                                  style={{
                                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                                    border: `2px solid ${isCompared ? slotColor : atMax ? C.border : C.muted}`,
                                    background: isCompared ? `${slotColor}22` : 'transparent',
                                    cursor: atMax ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.15s',
                                  }}
                                >
                                  {isCompared && (
                                    <span style={{ fontSize: 10, fontWeight: 900, color: slotColor, lineHeight: 1 }}>
                                      {compareSlot === 0 ? 'A' : 'B'}
                                    </span>
                                  )}
                                </div>
                              </ActionTooltip>
                            ) : (
                              <div style={{ width: 18, height: 18 }} />
                            )}
                          </div>

                          {/* Label */}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, color: C.text, fontWeight: isSelected || isCompared ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {simLabel(sim)}
                            </div>
                            <div style={{ display: 'flex', gap: 10, marginTop: 3, alignItems: 'center' }}>
                              <span style={{ fontSize: 13, color: C.muted }}>{sim.hand_count.toLocaleString()} hands</span>
                              {isCompared && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: slotColor, background: `${slotColor}18`, borderRadius: 3, padding: '1px 5px', letterSpacing: 0.5 }}>
                                  RUN {compareSlot === 0 ? 'A' : 'B'}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Date + rerun + status */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                            <span style={{ fontSize: 13, color: C.muted }}>
                              {formatDateShort(sim.status === 'COMPLETED' ? sim.completed_at : sim.created_at)}
                            </span>
                            {isHovered && !compareMode && (
                              <ActionTooltip label="Re-run simulation">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleReRun(sim) }}
                                  style={{
                                    background: 'none', border: `1px solid ${C.border}`, borderRadius: 4,
                                    color: C.muted, cursor: 'pointer', fontSize: 13, padding: '2px 7px',
                                    fontFamily: C.font, lineHeight: 1.4,
                                  }}
                                >↺</button>
                              </ActionTooltip>
                            )}
                            <StatusBadge status={sim.status} />
                            {isHovered && !compareMode && (
                              confirmDeleteId === sim.id ? (
                                <button
                                  onClick={e => { e.stopPropagation(); deleteSimulation(sim.id) }}
                                  style={{
                                    background: 'rgba(226,75,74,0.15)', border: '1px solid rgba(226,75,74,0.5)',
                                    borderRadius: 4, color: '#e24b4a', cursor: 'pointer', fontSize: 11,
                                    padding: '2px 7px', fontFamily: C.font, lineHeight: 1.4, whiteSpace: 'nowrap',
                                  }}
                                >Confirm?</button>
                              ) : (
                                <ActionTooltip label="Delete simulation">
                                  <button
                                    onClick={e => { e.stopPropagation(); setConfirmDeleteId(sim.id) }}
                                    style={{
                                      background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                                      display: 'flex', alignItems: 'center', color: C.muted,
                                      transition: 'color 0.15s',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                                    onMouseLeave={e => (e.currentTarget.style.color = C.muted)}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </ActionTooltip>
                              )
                            )}
                          </div>
                        </div>

                        {(sim.status === 'PENDING' || sim.status === 'RUNNING') && (
                          <div style={{ marginTop: 6, paddingLeft: 36 }}>
                            <ProgressBar pct={progress} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Right column (40%) — Results Panel ───────────────────────────── */}
          <div style={{
            flex: '0 0 40%', overflowY: 'auto', padding: '28px 24px',
            background: C.resultsBg,
            borderLeft: `1px solid ${C.border}`,
          }}>
            <style>{`@keyframes rp-spin { to { transform: rotate(360deg) } }`}</style>

            {/* ── Compare Mode view ──────────────────────────────────────────── */}
            {compareMode ? (
              <CompareModePanel
                compareIds={compareIds}
                simulations={simulations}
                compareResults={compareResults}
                loadingCompare={loadingCompare}
                clearCompare={clearCompare}
                formatBbPer100={formatBbPer100}
                formatPct={formatPct}
                formatAF={formatAF}
                simLabel={simLabel}
              />
            ) : loadingList && !selectedSim ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                <div style={{ width: 32, height: 32, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'rp-spin 0.8s linear infinite' }} />
                <div style={{ fontSize: 14, color: C.muted }}>Loading simulations…</div>
              </div>
            ) : !selectedSim ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <div style={{ fontSize: 14, color: C.muted }}>Preparing your first simulation…</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Quick Start banner */}
                {quickStartBanner && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'rgba(0,229,255,0.07)', border: '1px solid rgba(0,229,255,0.3)',
                    borderRadius: 8, padding: '10px 14px',
                  }}>
                    <Zap size={15} color={C.accent} style={{ flexShrink: 0 }} />
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>Quick Start</span>
                      <span style={{ fontSize: 13, color: C.muted, marginLeft: 8 }}>
                        Running your first sample simulation (2-player, 1k hands, Pure Meta)…
                      </span>
                    </div>
                  </div>
                )}

                {/* Results header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={sectionHeaderStyle}>Results</div>
                    <div style={{ fontSize: T.sm, color: C.muted, marginTop: 2 }}>{simLabel(selectedSim)}</div>
                  </div>
                  <StatusBadge status={selectedSim.status} />
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: C.border }} />

                {/* PENDING / RUNNING */}
                {(selectedSim.status === 'PENDING' || selectedSim.status === 'RUNNING') && (
                  <div style={{ textAlign: 'center', padding: '28px 0' }}>
                    <style>{`@keyframes sim-spin { to { transform: rotate(360deg) } }`}</style>
                    <div style={{
                      width: 36, height: 36, margin: '0 auto 14px',
                      border: `3px solid ${C.border}`, borderTopColor: C.accent,
                      borderRadius: '50%', animation: 'sim-spin 0.8s linear infinite',
                    }} />
                    <div style={{ fontSize: 14, color: C.muted, marginBottom: 10 }}>
                      {selectedSim.status === 'PENDING' ? 'Queued...' : `Running — ${selectedSim.progress_hands.toLocaleString()} / ${selectedSim.hand_count.toLocaleString()} hands`}
                    </div>
                    <ProgressBar pct={selectedSim.hand_count > 0 ? (selectedSim.progress_hands / selectedSim.hand_count) * 100 : 0} />
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>Auto-updating every 3s</div>
                  </div>
                )}

                {/* FAILED */}
                {selectedSim.status === 'FAILED' && (
                  <div style={{ color: C.danger, fontSize: 14, textAlign: 'center', padding: '16px 0' }}>
                    Simulation failed. Please try again.
                  </div>
                )}

                {/* COMPLETED */}
                {selectedSim.status === 'COMPLETED' && (
                  <>
                    {loadingResult ? (
                      <div style={{ color: C.muted, fontSize: 14, textAlign: 'center', padding: '16px 0' }}>Loading results...</div>
                    ) : result ? (
                      <>
                        {/* Simulation Insights */}
                        <SimulationInsights result={result} opponentProfile={selectedSim.opponent_profile} />

                        {/* Key metrics 2×3 grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          {[
                            { label: 'bb/100', value: formatBbPer100(result.bb_per_100), color: result.bb_per_100 >= 0 ? C.accent : '#FF4B4B', rawValue: undefined as number | undefined },
                            { label: 'Win Rate', value: formatPct(result.win_rate), color: result.win_rate >= 0.3 ? C.success : C.muted, rawValue: undefined as number | undefined },
                            { label: 'VPIP', value: formatPct(result.vpip), color: C.text, rawValue: result.vpip },
                            { label: 'PFR', value: formatPct(result.pfr), color: C.text, rawValue: result.pfr },
                            { label: 'Agg Factor', value: formatAF(result.aggression_factor), color: C.text, rawValue: undefined as number | undefined },
                            { label: 'Total Profit', value: result.total_profit >= 0 ? `+${result.total_profit}` : `${result.total_profit}`, color: result.total_profit >= 0 ? C.accent : '#FF4B4B', rawValue: undefined as number | undefined },
                          ].map(({ label, value, color, rawValue }) => (
                            <div key={label} style={{ background: '#0d0d22', border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px' }}>
                              <div style={{ fontSize: 12, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                                <MetricTooltip label={label} tip={METRIC_TOOLTIPS[label] ?? ''} />
                              </div>
                              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color, display: 'flex', alignItems: 'center' }}>
                                {value}
                                {rawValue !== undefined && rawValue < 0.05 && (
                                  <span title="Low Activity — bot may be too tight" style={{ fontSize: 12, color: C.warning, marginLeft: 6, fontWeight: 400 }}>⚠</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Lineup breakdown */}
                        {(() => {
                          const breakdown = getLineupBreakdown(selectedSim)
                          return breakdown ? (
                            <div style={{ fontSize: 13, color: C.muted }}>
                              Played against: <span style={{ color: C.text }}>{breakdown}</span>
                            </div>
                          ) : null
                        })()}

                        {/* Position heatmap */}
                        <div>
                          <div style={{ fontSize: 13, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
                            Win Rate by Position
                          </div>
                          <Heatmap
                            data={result.heatmap_data}
                            tableSize={selectedSim.table_size ?? selectedSim.config_snapshot?.tableSize ?? 9}
                          />
                        </div>
                      </>
                    ) : (
                      <div style={{ color: C.muted, fontSize: 14, textAlign: 'center' }}>No results found</div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

        </main>
      </div>
    </div>
  )
}
