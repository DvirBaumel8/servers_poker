import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import api from '../lib/axios'
import { useAnalyticsStore } from '../store/analyticsStore'
import { Sidebar } from '../components/Sidebar'
import CustomSelect from '../components/CustomSelect'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tournament {
  id: string
  name: string
  status: string
  finished_at: string | null
  entries_count: number
}

interface HandManifestItem {
  id: string
  hand_number: number
  pot: number
  winner_bot_id: string | null
  winner_name: string | null
  started_at: string | null
  result: 'win' | 'loss' | 'none'
}

interface HandPlayer {
  bot_id: string
  bot_name: string
  position: number
  hole_cards: Array<{ rank: string; suit: string }>
  amount_bet: number
  amount_won: number
  folded: boolean
  won: boolean
  best_hand?: { name: string; cards: Array<{ rank: string; suit: string }> }
}

interface HandAction {
  bot_id: string
  action_type: string
  amount: number
  stage: string
}

interface HandDetail {
  id: string
  hand_number: number
  pot: number
  community_cards: Array<{ rank: string; suit: string }>
  players: HandPlayer[]
  actions: HandAction[]
  started_at: string
  finished_at: string
}

interface LogEntry {
  id: string
  level: 'LOGIC' | 'RISK' | 'CALC'
  text: string
  botName: string
  actionType: string
  potOdds: number
  equity: number
  ev: number
  actionIndex: number
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#050508',
  surface: 'rgba(10,10,20,0.8)',
  card: 'rgba(13,13,28,0.9)',
  border: 'rgba(255,255,255,0.05)',
  accent: '#00d4e8',
  accentDim: 'rgba(0,212,232,0.08)',
  rose: '#e8524a',
  roseDim: 'rgba(232,82,74,0.12)',
  text: '#f0f0f4',
  muted: '#5a6070',
  mutedLight: '#8a9098',
  exec: '#22c55e',
  risk: '#eab308',
  data: '#3b82f6',
  font: "'Trebuchet MS', sans-serif",
  fontMono: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
}

// ─── Equity estimation ────────────────────────────────────────────────────────

const HAND_EQUITY: Record<string, number> = {
  'Royal Flush': 0.99,
  'Straight Flush': 0.97,
  'Four of a Kind': 0.95,
  'Full House': 0.88,
  Flush: 0.75,
  Straight: 0.65,
  'Three of a Kind': 0.55,
  'Two Pair': 0.42,
  'One Pair': 0.28,
  'High Card': 0.12,
}

function estimateEquity(player: HandPlayer): number {
  if (!player.best_hand?.name) return 0.2
  return HAND_EQUITY[player.best_hand.name] ?? 0.2
}

// ─── Per-hand player stats ────────────────────────────────────────────────────

function computePlayerStats(player: HandPlayer, actions: HandAction[]) {
  const mine = actions.filter(a => a.bot_id === player.bot_id)
  const preflop = mine.filter(a => a.stage === 'pre_flop')
  const vpip = preflop.some(a => ['call', 'raise', 'bet', 'all_in'].includes(a.action_type)) ? 100 : 0
  const pfr = preflop.some(a => ['raise', 'bet', 'all_in'].includes(a.action_type)) ? 100 : 0
  const agg = mine.filter(a => ['bet', 'raise', 'all_in'].includes(a.action_type)).length
  const pass = mine.filter(a => a.action_type === 'call').length
  const af = pass === 0 ? (agg > 0 ? 9.9 : 0) : +(agg / pass).toFixed(1)
  const lastAction = mine.filter(a => !['small_blind', 'big_blind'].includes(a.action_type)).at(-1)
  return { vpip, pfr, af, lastAction }
}

// ─── Logic trace builder ──────────────────────────────────────────────────────

function buildLogEntries(hand: HandDetail): LogEntry[] {
  const playerMap = new Map(hand.players.map(p => [p.bot_id, p]))
  const entries: LogEntry[] = []

  hand.actions.forEach((action, idx) => {
    const player = playerMap.get(action.bot_id)
    if (!player) return
    const equity = estimateEquity(player)
    const potOdds = hand.pot > 0 ? (action.amount / (hand.pot + action.amount)) * 100 : 0
    const ev = (equity * hand.pot) - ((1 - equity) * action.amount)

    if (action.action_type === 'bet' || action.action_type === 'raise' || action.action_type === 'all_in') {
      entries.push({
        id: `logic-${idx}`,
        level: 'LOGIC',
        text: `[LOGIC] Rule triggered: ${action.action_type.toUpperCase()}${action.amount > 0 ? ` +${action.amount}BB` : ''}`,
        botName: player.bot_name,
        actionType: action.action_type,
        potOdds,
        equity,
        ev,
        actionIndex: idx,
      })
    }

    if (action.action_type === 'call' && equity < 0.4) {
      entries.push({
        id: `risk-${idx}`,
        level: 'RISK',
        text: `[RISK] Pot odds insufficient (~${Math.round(equity * 100)}% win est.)`,
        botName: player.bot_name,
        actionType: action.action_type,
        potOdds,
        equity,
        ev,
        actionIndex: idx,
      })
    }

    if (action.action_type !== 'fold' && action.action_type !== 'small_blind' && action.action_type !== 'big_blind') {
      entries.push({
        id: `calc-${idx}`,
        level: 'CALC',
        text: `[CALC] Pot odds ${potOdds.toFixed(1)}% | Equity ~${Math.round(equity * 100)}% | EV ${ev > 0 ? '+' : ''}${Math.round(ev)}`,
        botName: player.bot_name,
        actionType: action.action_type,
        potOdds,
        equity,
        ev,
        actionIndex: idx,
      })
    }
  })

  return entries
}

// ─── Suit SVG ─────────────────────────────────────────────────────────────────

function SuitIcon({ suit, size = 10 }: { suit: string; size?: number }) {
  const color = suit === 'hearts' || suit === 'diamonds' ? '#e8524a' : '#f0f0f4'
  const symbols: Record<string, string> = {
    spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
  }
  return <span style={{ color, fontSize: size, lineHeight: 1 }}>{symbols[suit] ?? suit[0].toUpperCase()}</span>
}

function CardDisplay({ card, size = 'sm' }: { card: { rank: string; suit: string }; size?: 'sm' | 'md' }) {
  const w = size === 'md' ? 44 : 32
  const h = size === 'md' ? 60 : 44
  const fs = size === 'md' ? 13 : 11
  const isSuitRed = card.suit === 'hearts' || card.suit === 'diamonds'
  return (
    <div style={{
      width: w, height: h, background: 'linear-gradient(160deg,#ffffff 0%,#f4f4f4 60%,#eeeeee 100%)',
      borderRadius: 4, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 2, boxShadow: '0 3px 8px rgba(0,0,0,0.5)',
      border: '1px solid rgba(255,255,255,0.15)', flexShrink: 0,
    }}>
      <span style={{ fontSize: fs, fontWeight: 700, color: isSuitRed ? '#c0392b' : '#1a1a2e', lineHeight: 1, fontFamily: C.fontMono }}>{card.rank}</span>
      <SuitIcon suit={card.suit} size={fs + 1} />
    </div>
  )
}

function CardBack({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const w = size === 'md' ? 44 : 32
  const h = size === 'md' ? 60 : 44
  return (
    <div style={{
      width: w, height: h,
      background: 'linear-gradient(145deg,#9eaab6 0%,#6e7f8d 40%,#4a5a68 100%)',
      borderRadius: 4, boxShadow: '0 3px 8px rgba(0,0,0,0.5)', flexShrink: 0,
      border: '1px solid rgba(255,255,255,0.1)',
    }} />
  )
}

// ─── Heatmap Scrubber ─────────────────────────────────────────────────────────

function HeatmapScrubber({
  manifest,
  activeIndex,
  onScrub,
}: {
  manifest: HandManifestItem[]
  activeIndex: number
  onScrub: (i: number) => void
}) {
  const deferredIndex = useDeferredValue(activeIndex)
  const [tooltip, setTooltip] = useState<{ x: number; item: HandManifestItem } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  if (manifest.length === 0) return null

  const maxPot = Math.max(...manifest.map(m => m.pot), 1)
  // Each bar occupies 2 SVG units: 1.5 for the bar, 0.5 for the gap
  const svgWidth = manifest.length * 2

  return (
    <div style={{
      position: 'relative', height: 80, background: 'rgba(5,5,12,0.95)',
      borderTop: `1px solid ${C.border}`, flexShrink: 0,
    }} ref={containerRef}>
      {/* Y-axis legend */}
      <div style={{
        position: 'absolute', left: 6, top: 4,
        fontFamily: C.fontMono, fontSize: 9, color: C.muted, pointerEvents: 'none', zIndex: 2,
      }}>
        {maxPot.toLocaleString()}BB
      </div>
      <div style={{
        position: 'absolute', left: 6, bottom: 14,
        fontFamily: C.fontMono, fontSize: 9, color: C.muted, pointerEvents: 'none', zIndex: 2,
      }}>
        0
      </div>

      {/* SVG heatmap bars — 1.5px bar + 0.5px gap per hand (ultra-dense) */}
      <svg
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        viewBox={`0 0 ${svgWidth} 100`}
      >
        {manifest.map((item, i) => {
          const barH = Math.max(4, (Math.log1p(item.pot) / Math.log1p(maxPot)) * 78)
          const color = item.result === 'win' ? C.accent : item.result === 'loss' ? C.rose : C.muted
          const opacity = i === deferredIndex ? 1 : 0.55
          return (
            <rect
              key={item.id}
              x={i * 2}
              y={100 - barH}
              width={1.5}
              height={barH}
              fill={color}
              opacity={opacity}
            />
          )
        })}
      </svg>

      {/* Range slider */}
      <input
        type="range"
        min={0}
        max={manifest.length - 1}
        value={activeIndex}
        onChange={e => onScrub(Number(e.target.value))}
        onMouseMove={e => {
          if (!containerRef.current) return
          const rect = containerRef.current.getBoundingClientRect()
          const ratio = (e.clientX - rect.left) / rect.width
          const idx = Math.min(manifest.length - 1, Math.max(0, Math.round(ratio * (manifest.length - 1))))
          setTooltip({ x: e.clientX - rect.left, item: manifest[idx] })
        }}
        onMouseLeave={() => setTooltip(null)}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          opacity: 0, cursor: 'crosshair', margin: 0,
        }}
      />

      {/* Active position line — high-contrast white */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, width: 2,
        left: `${(activeIndex / Math.max(1, manifest.length - 1)) * 100}%`,
        background: 'white', pointerEvents: 'none',
        boxShadow: '0 0 3px rgba(255,255,255,0.8)',
      }} />

      {/* Hover tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute', bottom: 90, transform: 'translateX(-50%)',
          left: tooltip.x, background: 'rgba(13,13,28,0.97)',
          border: `1px solid ${C.border}`, borderRadius: 6,
          padding: '6px 10px', pointerEvents: 'none', whiteSpace: 'nowrap',
          fontFamily: C.fontMono, fontSize: 11, color: C.text, zIndex: 100,
          boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
        }}>
          <span style={{ color: C.muted }}>Hand #{tooltip.item.hand_number}</span>
          <span style={{ margin: '0 6px', color: C.border }}>|</span>
          <span>Pot: {tooltip.item.pot.toLocaleString()}BB</span>
          <span style={{ margin: '0 6px', color: C.border }}>|</span>
          <span style={{ color: tooltip.item.result === 'win' ? C.accent : tooltip.item.result === 'loss' ? C.rose : C.muted }}>
            {tooltip.item.result === 'win' ? '+WIN' : tooltip.item.result === 'loss' ? '-LOSS' : 'NONE'}
          </span>
        </div>
      )}

      {/* Hand counter */}
      <div style={{
        position: 'absolute', bottom: 4, right: 12,
        fontFamily: C.fontMono, fontSize: 10, color: C.muted, pointerEvents: 'none',
      }}>
        {activeIndex + 1} / {manifest.length}
      </div>
    </div>
  )
}

// ─── Hand History List (Left Panel) ──────────────────────────────────────────

function HandHistoryList({
  manifest,
  activeIndex,
  onSelect,
}: {
  manifest: HandManifestItem[]
  activeIndex: number
  onSelect: (i: number) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll active item into view
  useEffect(() => {
    if (!scrollRef.current) return
    const active = scrollRef.current.querySelector('[data-active="true"]') as HTMLElement | null
    if (active) active.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.border}`,
      background: 'rgba(5,5,12,0.6)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        fontFamily: C.fontMono, fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: 'uppercase',
      }}>
        Hand History
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
        {manifest.map((item, i) => {
          const isActive = i === activeIndex
          const isWin = item.result === 'win'
          const isLoss = item.result === 'loss'
          const resultColor = isWin ? C.exec : isLoss ? C.rose : C.muted
          return (
            <button
              key={item.id}
              data-active={isActive}
              onClick={() => onSelect(i)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 12px',
                background: isActive
                  ? 'rgba(0,212,232,0.12)'
                  : i % 2 === 0 ? 'rgba(10,10,20,0.7)' : 'rgba(5,5,12,0.4)',
                border: 'none',
                borderLeft: isActive ? `3px solid ${C.accent}` : `3px solid transparent`,
                boxShadow: isActive ? 'inset 0 0 24px rgba(0,212,232,0.08)' : 'none',
                cursor: 'pointer',
                transition: 'background 0.15s, box-shadow 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <span style={{ fontFamily: C.fontMono, fontSize: 9, color: C.muted }}>
                  #{item.hand_number}
                </span>
                <span style={{ fontFamily: C.fontMono, fontSize: 11, color: resultColor, fontWeight: 700 }}>
                  {isWin ? '▲ WIN' : isLoss ? '▼ LOSS' : '—'}
                </span>
              </div>
              <div style={{
                fontFamily: C.fontMono, fontSize: 16, color: isActive ? C.accent : C.text,
                fontWeight: 700, lineHeight: 1,
              }}>
                {item.pot.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 400, color: C.mutedLight }}>BB</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Math Matrix popover ──────────────────────────────────────────────────────

function MathMatrix({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          margin: '0 340px 0 0', background: C.card,
          border: `1px solid ${C.border}`, borderRadius: 10,
          padding: 20, width: 280, backdropFilter: 'blur(12px)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.8)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
            Mathematical Matrix
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'Bot', value: entry.botName, color: C.text },
            { label: 'Action', value: entry.actionType.toUpperCase(), color: C.accent },
            { label: 'Pot Odds', value: `${entry.potOdds.toFixed(1)}%`, color: C.data },
            { label: 'Est. Equity', value: `${Math.round(entry.equity * 100)}%`, color: entry.equity > 0.5 ? C.exec : entry.equity < 0.3 ? C.rose : C.risk },
            { label: 'EV (chips)', value: `${entry.ev > 0 ? '+' : ''}${Math.round(entry.ev)}`, color: entry.ev > 0 ? C.exec : C.rose },
            {
              label: 'Range Projection',
              value: entry.equity > 0.6 ? 'Premium range' : entry.equity > 0.4 ? 'Playable range' : 'Marginal / bluff',
              color: C.mutedLight,
            },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.muted }}>{row.label}</span>
              <span style={{ fontFamily: C.fontMono, fontSize: 12, color: row.color, fontWeight: 600 }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Logic Stream ─────────────────────────────────────────────────────────────

function LogicStream({
  entries,
  selectedId,
  onSelect,
}: {
  entries: LogEntry[]
  selectedId: string | null
  onSelect: (entry: LogEntry) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [entries])

  const levelColor = (l: LogEntry['level']) =>
    l === 'LOGIC' ? C.accent : l === 'RISK' ? C.risk : C.mutedLight

  return (
    <div style={{
      width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column',
      borderLeft: `1px solid ${C.border}`, background: 'rgba(5,5,12,0.6)',
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
        fontFamily: C.fontMono, fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: 'uppercase',
      }}>
        Execution Trace — Brain Feed
      </div>
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="Execution trace log"
        style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}
      >
        {entries.length === 0 && (
          <div style={{ padding: '24px 14px', fontFamily: C.fontMono, fontSize: 11, color: C.muted, textAlign: 'center' }}>
            No trace data
          </div>
        )}
        {entries.map(entry => (
          <button
            key={entry.id}
            onClick={() => onSelect(entry)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '6px 14px', background: selectedId === entry.id ? 'rgba(255,255,255,0.05)' : 'transparent',
              border: 'none', borderLeft: selectedId === entry.id ? `2px solid ${levelColor(entry.level)}` : '2px solid transparent',
              cursor: 'pointer', transition: 'background 0.1s',
            }}
          >
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <span style={{
                fontFamily: C.fontMono, fontSize: 9, color: levelColor(entry.level),
                letterSpacing: 1, textTransform: 'uppercase', flexShrink: 0,
                padding: '1px 4px', border: `1px solid ${levelColor(entry.level)}`, borderRadius: 2,
              }}>{entry.level}</span>
              <span style={{ fontFamily: C.fontMono, fontSize: 10, color: C.mutedLight, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {entry.botName}
              </span>
            </div>
            <div style={{ fontFamily: C.fontMono, fontSize: 11, color: C.text, marginTop: 2, lineHeight: 1.4 }}>
              {entry.text}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Decision Chart ───────────────────────────────────────────────────────────

function DecisionChart({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) return null

  const fold = entries.filter(e => e.actionType === 'fold').length
  const call = entries.filter(e => e.actionType === 'call').length
  const raise = entries.filter(e => ['raise', 'bet', 'all_in'].includes(e.actionType)).length
  const total = fold + call + raise || 1

  const bars = [
    { label: 'FOLD', count: fold, color: C.rose },
    { label: 'CALL', count: call, color: C.risk },
    { label: 'RAISE', count: raise, color: C.accent },
  ]

  return (
    <div style={{
      borderTop: `1px solid ${C.border}`, flexShrink: 0,
      padding: '10px 14px 12px',
      background: 'rgba(5,5,12,0.4)',
    }}>
      <div style={{
        fontFamily: C.fontMono, fontSize: 10, color: C.muted,
        letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8,
      }}>
        Decision Split
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {bars.map(bar => {
          const pct = Math.round((bar.count / total) * 100)
          return (
            <div key={bar.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontFamily: C.fontMono, fontSize: 9, color: C.muted, width: 36, textAlign: 'right', flexShrink: 0 }}>{bar.label}</span>
              <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${pct}%`,
                  background: bar.color, borderRadius: 3,
                  transition: 'width 0.4s ease',
                  boxShadow: `0 0 6px ${bar.color}80`,
                }} />
              </div>
              <span style={{ fontFamily: C.fontMono, fontSize: 10, color: bar.color, fontWeight: 600, width: 28, textAlign: 'right', flexShrink: 0 }}>
                {pct}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Session Stats ────────────────────────────────────────────────────────────

function SessionStats({ manifest }: { manifest: HandManifestItem[] }) {
  const total = manifest.length
  if (total === 0) return null
  const wins = manifest.filter(m => m.result === 'win').length
  const losses = manifest.filter(m => m.result === 'loss').length
  const winRate = Math.round((wins / total) * 100)
  const avgPot = Math.round(manifest.reduce((s, m) => s + m.pot, 0) / total)
  const biggestPot = Math.max(...manifest.map(m => m.pot), 0)

  const rows = [
    { label: 'Hands', value: total.toString() },
    { label: 'Win Rate', value: `${winRate}%`, color: winRate >= 50 ? C.exec : C.rose },
    { label: 'W / L', value: `${wins} / ${losses}`, color: C.mutedLight },
    { label: 'Avg Pot', value: `${avgPot.toLocaleString()} BB` },
    { label: 'Peak Pot', value: `${biggestPot.toLocaleString()} BB`, color: C.accent },
  ]

  return (
    <div style={{
      borderTop: `1px solid ${C.border}`, flexShrink: 0,
      padding: '10px 14px 12px',
    }}>
      <div style={{
        fontFamily: C.fontMono, fontSize: 10, color: C.muted,
        letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8,
      }}>
        Session Stats
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {rows.map(row => (
          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: C.fontMono, fontSize: 10, color: C.muted }}>{row.label}</span>
            <span style={{ fontFamily: C.fontMono, fontSize: 11, fontWeight: 600, color: row.color ?? C.text }}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Player Card ──────────────────────────────────────────────────────────────

function PlayerCard({
  player,
  prevEquity,
  isHighlighted,
  isTopEquity,
  actions,
}: {
  player: HandPlayer
  prevEquity: number
  isHighlighted: boolean
  isTopEquity: boolean
  actions: HandAction[]
}) {
  const equity = estimateEquity(player)
  const delta = equity - prevEquity
  const [showDelta, setShowDelta] = useState(false)
  const stats = computePlayerStats(player, actions)

  useEffect(() => {
    if (Math.abs(delta) > 0.05) {
      setShowDelta(true)
      const t = setTimeout(() => setShowDelta(false), 1800)
      return () => clearTimeout(t)
    }
  }, [delta])

  const equityColor = equity > 0.6 ? C.exec : equity < 0.35 ? C.rose : C.risk

  // Equity-based outer glow
  const glowRgb = equity > 0.7 ? '0,212,232' : equity > 0.3 ? '234,179,8' : '232,82,74'
  const equityGlow = player.folded ? 'none' : `0 0 14px rgba(${glowRgb},0.35), 0 0 4px rgba(${glowRgb},0.15)`

  // Last significant action overlay
  const lastAct = stats.lastAction
  const actionLabel = lastAct
    ? `${lastAct.action_type.toUpperCase()}${lastAct.amount > 0 ? ` ${lastAct.amount}` : ''}`
    : null
  const actionLabelColor = lastAct?.action_type === 'fold' ? C.muted
    : ['bet', 'raise', 'all_in'].includes(lastAct?.action_type ?? '') ? C.accent
    : C.risk

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: player.folded ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      style={{
        background: C.card,
        border: `1px solid ${isHighlighted ? C.accent : isTopEquity && !player.folded ? 'rgba(0,212,232,0.5)' : C.border}`,
        borderRadius: 8, padding: '10px 12px',
        boxShadow: isTopEquity && !player.folded ? undefined : equityGlow,
        animation: isTopEquity && !player.folded ? 'pulse-equity 1.8s ease-in-out infinite' : 'none',
        backdropFilter: 'blur(8px)',
        filter: player.folded ? 'grayscale(0.8)' : 'none',
        transition: 'border-color 0.2s',
        position: 'relative',
      }}
    >
      {/* Action overlay pill */}
      {actionLabel && (
        <div style={{
          position: 'absolute', top: 8, right: 10,
          fontFamily: C.fontMono, fontSize: 8, fontWeight: 700,
          color: actionLabelColor, background: 'rgba(0,0,0,0.5)',
          border: `1px solid ${actionLabelColor}40`,
          padding: '1px 5px', borderRadius: 3, letterSpacing: 0.5,
        }}>
          {actionLabel}
        </div>
      )}

      {/* Bot name + position */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>
          {player.bot_name}
        </span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {player.won && (
            <span style={{ fontFamily: C.fontMono, fontSize: 9, color: C.exec, background: 'rgba(34,197,94,0.12)', padding: '1px 5px', borderRadius: 3, border: `1px solid ${C.exec}` }}>
              WIN
            </span>
          )}
          {player.folded && (
            <span style={{ fontFamily: C.fontMono, fontSize: 9, color: C.muted, background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 3 }}>
              FOLD
            </span>
          )}
          <span style={{ fontFamily: C.fontMono, fontSize: 9, color: C.muted }}>P{player.position}</span>
        </div>
      </div>

      {/* Micro-stats: VPIP / PFR / AF */}
      <div style={{ fontFamily: C.fontMono, fontSize: 9, color: C.mutedLight, marginBottom: 8, letterSpacing: 0.3 }}>
        VPIP {stats.vpip}% · PFR {stats.pfr}% · AF {stats.af}
      </div>

      {/* Hole cards */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {player.hole_cards.length > 0
          ? player.hole_cards.map((c, i) => <CardDisplay key={i} card={c} size="sm" />)
          : [0, 1].map(i => <CardBack key={i} size="sm" />)
        }
      </div>

      {/* Equity pulse bar */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontFamily: C.fontMono, fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Equity</span>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <span style={{ fontFamily: C.fontMono, fontSize: 10, color: equityColor, fontWeight: 600 }}>
              {Math.round(equity * 100)}%
            </span>
            <AnimatePresence>
              {showDelta && (
                <motion.span
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  style={{ fontFamily: C.fontMono, fontSize: 9, color: delta > 0 ? C.exec : C.rose, fontWeight: 700 }}
                >
                  {delta > 0 ? '+' : ''}{Math.round(delta * 100)}%
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
          <motion.div
            animate={{ width: `${equity * 100}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            style={{ height: '100%', background: equityColor, borderRadius: 2 }}
          />
        </div>
      </div>

      {/* Best hand */}
      {player.best_hand?.name && (
        <div style={{ fontFamily: C.fontMono, fontSize: 9, color: C.muted, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {player.best_hand.name}
        </div>
      )}

      {/* Chips */}
      {(player.amount_bet > 0 || player.amount_won > 0) && (
        <div style={{ display: 'flex', gap: 10, marginTop: 6, fontFamily: C.fontMono, fontSize: 9 }}>
          {player.amount_bet > 0 && <span style={{ color: C.rose }}>−{player.amount_bet}</span>}
          {player.amount_won > 0 && <span style={{ color: C.exec }}>+{player.amount_won}</span>}
        </div>
      )}
    </motion.div>
  )
}

// ─── Data Loss card ───────────────────────────────────────────────────────────

function DataLossCard({ handNumber }: { handNumber: number }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      flex: 1, gap: 12, color: C.muted, fontFamily: C.fontMono,
    }}>
      <div style={{ fontSize: 28, color: C.risk }}>⚠</div>
      <div style={{ fontSize: 13, color: C.text }}>Data Loss</div>
      <div style={{ fontSize: 11 }}>Hand #{handNumber} — record unavailable or corrupted</div>
    </div>
  )
}

// ─── Action Arena ─────────────────────────────────────────────────────────────

function ActionArena({
  hand,
  loading,
  error,
  handNumber,
}: {
  hand: HandDetail | null
  loading: boolean
  error: boolean
  handNumber: number
}) {
  const prevEquityRef = useRef<Record<string, number>>({})

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: C.fontMono, fontSize: 12, color: C.muted, letterSpacing: 2 }}>LOADING HAND DATA...</div>
      </div>
    )
  }

  if (error || !hand) {
    return <DataLossCard handNumber={handNumber} />
  }

  // Snapshot prev equity before render
  const prevEquity = { ...prevEquityRef.current }
  hand.players.forEach(p => {
    prevEquityRef.current[p.bot_id] = estimateEquity(p)
  })

  const winnerIds = new Set(hand.players.filter(p => p.won).map(p => p.bot_id))
  const pot = Number(hand.pot)
  const cc = hand.community_cards
  const stage = cc.length === 0 ? 'PRE-FLOP' : cc.length === 3 ? 'FLOP' : cc.length === 4 ? 'TURN' : 'RIVER'

  // Mood feedback: detect missed draw (low-equity call)
  const logEntries = buildLogEntries(hand)
  const hasMissedDraw = logEntries.some(e => e.level === 'RISK')

  // Find player with highest equity for pulse glow
  const topEquityBotId = hand.players
    .filter(p => !p.folded)
    .reduce((best, p) => estimateEquity(p) > estimateEquity(best) ? p : best, hand.players[0])?.bot_id ?? ''

  // Split players for orbital layout
  const mid = Math.ceil(hand.players.length / 2)
  const topPlayers = hand.players.slice(0, mid)
  const bottomPlayers = hand.players.slice(mid)

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', padding: '14px 16px', gap: 10, overflow: 'hidden',
      boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.04), inset -1px 0 0 rgba(255,255,255,0.04)',
      background: hasMissedDraw ? 'rgba(232,82,74,0.04)' : 'transparent',
      transition: 'background 0.8s ease',
    }}>

      {/* Top row: Stage badge + hand number */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: C.fontMono, fontSize: 9, color: C.muted, letterSpacing: 1 }}>
          Hand #{hand.hand_number}
        </span>
        <div style={{
          fontFamily: C.fontMono, fontSize: 9, letterSpacing: 3, textTransform: 'uppercase',
          border: `1px solid ${C.border}`, borderRadius: 3, padding: '2px 12px',
          color: C.accent, background: C.accentDim,
        }}>
          {stage}
        </div>
        <span style={{ fontFamily: C.fontMono, fontSize: 9, color: C.muted, visibility: 'hidden' }}>
          Hand #{hand.hand_number}
        </span>
      </div>

      {/* Central Arena: Pot Ticker + Community Cards */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 12, padding: '12px 0', flexShrink: 0,
        borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
      }}>
        {/* Pot ticker — glowing panel */}
        <div style={{
          background: 'rgba(0,212,232,0.05)',
          border: '1px solid rgba(0,212,232,0.2)',
          borderRadius: 8,
          padding: '10px 24px',
          boxShadow: '0 0 20px rgba(0,212,232,0.1), 0 0 40px rgba(0,212,232,0.05)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        }}>
          <div style={{ fontFamily: C.fontMono, fontSize: 9, color: C.muted, letterSpacing: 3, textTransform: 'uppercase' }}>
            Total Pot
          </div>
          <div style={{
            fontFamily: C.fontMono, fontSize: 28, fontWeight: 700, color: C.accent,
            letterSpacing: 2, animation: 'pot-glow 3s ease-in-out infinite',
          }}>
            {pot.toLocaleString()} <span style={{ fontSize: 14, fontWeight: 400, color: C.mutedLight }}>BB</span>
          </div>
        </div>

        {/* Community cards — centered */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 60, justifyContent: 'center' }}>
          {cc.length > 0 ? (
            <AnimatePresence mode="popLayout">
              {cc.map((c, i) => (
                <motion.div
                  key={`${c.rank}-${c.suit}-${i}`}
                  initial={{ opacity: 0, scale: 0.8, rotateY: 90 }}
                  animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.25 }}
                >
                  <CardDisplay card={c} size="md" />
                </motion.div>
              ))}
            </AnimatePresence>
          ) : (
            <span style={{ fontFamily: C.fontMono, fontSize: 10, color: C.muted, letterSpacing: 2 }}>
              PRE-FLOP — NO BOARD
            </span>
          )}
        </div>
      </div>

      {/* Players — orbital arc layout: top row / community center / bottom row */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 0 }}>
        {/* Top arc */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
          <AnimatePresence mode="popLayout">
            {topPlayers.map(player => (
              <PlayerCard
                key={player.bot_id}
                player={player}
                prevEquity={prevEquity[player.bot_id] ?? 0.2}
                isHighlighted={winnerIds.has(player.bot_id)}
                isTopEquity={player.bot_id === topEquityBotId}
                actions={hand.actions}
              />
            ))}
          </AnimatePresence>
        </div>
        {/* Bottom arc */}
        {bottomPlayers.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
            <AnimatePresence mode="popLayout">
              {bottomPlayers.map(player => (
                <PlayerCard
                  key={player.bot_id}
                  player={player}
                  prevEquity={prevEquity[player.bot_id] ?? 0.2}
                  isHighlighted={winnerIds.has(player.bot_id)}
                  isTopEquity={player.bot_id === topEquityBotId}
                  actions={hand.actions}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TournamentAnalyticsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { activeTournamentId, activeHandIndex, setTournament, setHandIndex, selectedLogEntryId, selectLogEntry } = useAnalyticsStore()

  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [tournamentsLoading, setTournamentsLoading] = useState(true)
  const [manifest, setManifest] = useState<HandManifestItem[]>([])
  const [manifestLoading, setManifestLoading] = useState(false)
  const [handDetail, setHandDetail] = useState<HandDetail | null>(null)
  const [handLoading, setHandLoading] = useState(false)
  const [handError, setHandError] = useState(false)
  const [logEntries, setLogEntries] = useState<LogEntry[]>([])
  const [activeLogEntry, setActiveLogEntry] = useState<LogEntry | null>(null)

  const handCache = useRef(new Map<string, HandDetail>())
  const playbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeedLocal] = useState(1)

  // Fetch finished tournaments
  useEffect(() => {
    const idFromUrl = searchParams.get('id')
    api.get<{ data?: Tournament[]; items?: Tournament[] } | Tournament[]>('/tournaments?status=finished&limit=30')
      .then(res => {
        const data = res.data
        const list = Array.isArray(data) ? data : ((data as { data?: Tournament[] }).data ?? (data as { items?: Tournament[] }).items ?? [])
        setTournaments(list)
        if (idFromUrl && !activeTournamentId) {
          setTournament(idFromUrl)
        }
      })
      .catch(() => setTournaments([]))
      .finally(() => setTournamentsLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch manifest when tournament changes
  useEffect(() => {
    if (!activeTournamentId) return
    setManifest([])
    setHandDetail(null)
    setHandError(false)
    handCache.current.clear()
    setManifestLoading(true)

    api.get<{ hands: HandManifestItem[] }>(`/tournaments/${activeTournamentId}/hands-manifest`)
      .then(res => {
        setManifest(res.data.hands ?? [])
        setHandIndex(0)
      })
      .catch(() => setManifest([]))
      .finally(() => setManifestLoading(false))
  }, [activeTournamentId, setHandIndex])

  // Fetch hand detail with cache
  const fetchHand = useCallback(async (index: number) => {
    if (!manifest[index]) return
    const item = manifest[index]
    if (handCache.current.has(item.id)) {
      const cached = handCache.current.get(item.id)!
      setHandDetail(cached)
      setLogEntries(buildLogEntries(cached))
      setHandError(false)
      return
    }
    setHandLoading(true)
    setHandError(false)
    try {
      const res = await api.get<HandDetail>(`/games/hands/${item.id}`)
      handCache.current.set(item.id, res.data)
      setHandDetail(res.data)
      setLogEntries(buildLogEntries(res.data))
    } catch {
      setHandError(true)
      setHandDetail(null)
    } finally {
      setHandLoading(false)
    }
  }, [manifest])

  // Pre-fetch next 3 hands
  const prefetchAhead = useCallback((index: number) => {
    for (let i = 1; i <= 3; i++) {
      const item = manifest[index + i]
      if (item && !handCache.current.has(item.id)) {
        api.get<HandDetail>(`/games/hands/${item.id}`)
          .then(res => handCache.current.set(item.id, res.data))
          .catch(() => {/* silent */})
      }
    }
  }, [manifest])

  useEffect(() => {
    if (manifest.length === 0) return
    fetchHand(activeHandIndex)
    prefetchAhead(activeHandIndex)
  }, [activeHandIndex, manifest, fetchHand, prefetchAhead])

  // Playback timer
  useEffect(() => {
    if (!isPlaying) {
      if (playbackTimer.current) clearTimeout(playbackTimer.current)
      return
    }
    if (activeHandIndex >= manifest.length - 1) {
      setIsPlaying(false)
      return
    }
    playbackTimer.current = setTimeout(() => {
      setHandIndex(activeHandIndex + 1)
    }, 1000 / playbackSpeed)

    return () => { if (playbackTimer.current) clearTimeout(playbackTimer.current) }
  }, [isPlaying, activeHandIndex, manifest.length, playbackSpeed, setHandIndex])

  const handleSelectEntry = (entry: LogEntry) => {
    selectLogEntry(entry.id)
    setActiveLogEntry(entry)
  }

  const currentManifestItem = manifest[activeHandIndex]
  const canFork = !!handDetail

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.bg, color: C.text, overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap');
        * { box-sizing: border-box; }
        input[type=range] { appearance: none; -webkit-appearance: none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 80px; background: rgba(0,212,232,0.6); border-radius: 2px; cursor: col-resize; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        @keyframes pulse-equity {
          0%,100% { box-shadow: 0 0 14px rgba(0,212,232,0.5), 0 0 28px rgba(0,212,232,0.2); }
          50% { box-shadow: 0 0 32px rgba(0,212,232,1), 0 0 60px rgba(0,212,232,0.5), 0 0 80px rgba(0,212,232,0.2); }
        }
        @keyframes pot-glow {
          0%,100% { text-shadow: 0 0 20px rgba(0,212,232,0.6), 0 0 8px rgba(0,212,232,0.3); }
          50% { text-shadow: 0 0 40px rgba(0,212,232,1), 0 0 80px rgba(0,212,232,0.4), 0 0 12px rgba(0,212,232,0.8); }
        }
      `}</style>

      <Sidebar />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
          borderBottom: `1px solid ${C.border}`, background: 'rgba(5,5,12,0.9)',
          backdropFilter: 'blur(8px)', flexWrap: 'wrap', flexShrink: 0,
        }}>
          {/* Title */}
          <div style={{ marginRight: 8 }}>
            <div style={{ fontFamily: C.fontMono, fontSize: 11, color: C.muted, letterSpacing: 2, textTransform: 'uppercase' }}>The Quant Deck</div>
          </div>

          {/* Tournament selector */}
          <CustomSelect
            value={activeTournamentId ?? ''}
            onChange={v => { if (v) setTournament(v) }}
            options={tournaments.map(t => ({ value: t.id, label: `${t.name} (${t.entries_count} players)` }))}
            placeholder={tournamentsLoading ? 'Loading...' : 'Select a tournament'}
            disabled={tournamentsLoading}
            size="sm"
            style={{ minWidth: 220 }}
          />

          {/* Separator */}
          <div style={{ flex: 1 }} />

          {/* Playback controls */}
          {manifest.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setHandIndex(Math.max(0, activeHandIndex - 1))}
                disabled={activeHandIndex === 0}
                style={{ ...btnStyle, opacity: activeHandIndex === 0 ? 0.3 : 1 }}
              >⟨</button>

              <button
                onClick={() => setIsPlaying(p => !p)}
                style={{ ...btnStyle, background: isPlaying ? C.accentDim : 'transparent', color: isPlaying ? C.accent : C.muted }}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>

              <button
                onClick={() => setHandIndex(Math.min(manifest.length - 1, activeHandIndex + 1))}
                disabled={activeHandIndex >= manifest.length - 1}
                style={{ ...btnStyle, opacity: activeHandIndex >= manifest.length - 1 ? 0.3 : 1 }}
              >⟩</button>

              <CustomSelect
                value={String(playbackSpeed)}
                onChange={v => setPlaybackSpeedLocal(Number(v))}
                options={[0.5, 1, 2, 4, 8].map(s => ({ value: String(s), label: `${s}×` }))}
                size="xs"
                style={{ minWidth: 60 }}
              />
            </div>
          )}

          {/* Fork to Simulator */}
          {canFork && currentManifestItem && (
            <button
              onClick={() => navigate('/simulations', { state: { prefill: { handCount: 1000 } } })}
              style={{
                ...btnStyle,
                background: 'rgba(0,212,232,0.1)',
                border: `1px solid ${C.accent}`,
                color: C.accent,
                fontSize: 11,
                padding: '6px 12px',
                gap: 6,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 10 }}>⑂</span> Fork to Simulator
            </button>
          )}
        </div>

        {/* Empty / no tournament state */}
        {!activeTournamentId && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <div style={{ fontFamily: C.fontMono, fontSize: 32, color: 'rgba(255,255,255,0.04)' }}>◈</div>
            <div style={{ fontFamily: C.fontMono, fontSize: 13, color: C.muted }}>Select a finished tournament to begin forensic analysis</div>
          </div>
        )}

        {/* Loading manifest */}
        {activeTournamentId && manifestLoading && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontFamily: C.fontMono, fontSize: 12, color: C.muted, letterSpacing: 2 }}>LOADING MANIFEST...</div>
          </div>
        )}

        {/* Empty manifest */}
        {activeTournamentId && !manifestLoading && manifest.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <div style={{ fontFamily: C.fontMono, fontSize: 13, color: C.muted }}>No hands found for this tournament</div>
          </div>
        )}

        {/* Main IDE layout */}
        {manifest.length > 0 && (
          <>
            {/* 3-Column Mission Control Grid */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '20% 55% 25%', minHeight: 0, overflow: 'hidden' }}>

              {/* Left 20% — Hand History List */}
              <HandHistoryList
                manifest={manifest}
                activeIndex={activeHandIndex}
                onSelect={setHandIndex}
              />

              {/* Center 55% — The Arena */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={`hand-${activeHandIndex}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                  style={{ display: 'flex', overflow: 'hidden' }}
                >
                  <ActionArena
                    hand={handDetail}
                    loading={handLoading}
                    error={handError}
                    handNumber={currentManifestItem?.hand_number ?? activeHandIndex + 1}
                  />
                </motion.div>
              </AnimatePresence>

              {/* Right 25% — Execution Trace + Decision Chart + Session Stats */}
              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <LogicStream
                  entries={logEntries}
                  selectedId={selectedLogEntryId}
                  onSelect={handleSelectEntry}
                />
                <DecisionChart entries={logEntries} />
                <SessionStats manifest={manifest} />
              </div>
            </div>

            {/* Heatmap Scrubber */}
            <HeatmapScrubber
              manifest={manifest}
              activeIndex={activeHandIndex}
              onScrub={setHandIndex}
            />
          </>
        )}
      </div>

      {/* Math Matrix popover */}
      {activeLogEntry && selectedLogEntryId && (
        <MathMatrix
          entry={activeLogEntry}
          onClose={() => { selectLogEntry(null); setActiveLogEntry(null) }}
        />
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${C.border}`,
  borderRadius: 5,
  color: C.mutedLight,
  fontFamily: C.fontMono,
  fontSize: 13,
  padding: '5px 10px',
  cursor: 'pointer',
  lineHeight: 1,
}
