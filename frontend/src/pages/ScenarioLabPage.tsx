import { useEffect, useRef, useState } from 'react'
import api from '../lib/axios'
import { Sidebar } from '../components/Sidebar'
import CustomSelect from '../components/CustomSelect'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Bot {
  id: string
  name: string
  active: boolean
  strategy?: { tier?: string }
}

interface ScenarioResult {
  primaryAction: { type: string; amount?: number }
  source: 'range_chart' | 'rule' | 'personality' | 'position_override'
  explanation: string
  handNotation?: string
  ruleId?: string
  distribution: { fold: number; check: number; call: number; raise: number }
}

type Slot = 'board0' | 'board1' | 'board2' | 'board3' | 'board4' | 'hand0' | 'hand1'

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#0a0a1a',
  card: '#13132a',
  border: '#1e1e3f',
  accent: '#00e5ff',
  accentDim: 'rgba(0,229,255,0.08)',
  text: '#ffffff',
  muted: '#9ca3af',
  danger: '#e24b4a',
  success: '#1d9e75',
  font: "'Trebuchet MS', sans-serif",
}

// ─── Card constants ───────────────────────────────────────────────────────────

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const
const SUITS = ['s', 'h', 'd', 'c'] as const
const SUIT_GLYPH: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }
const SUIT_COLOR: Record<string, string> = { s: '#1a1a2e', h: '#dc2626', d: '#dc2626', c: '#1a1a2e' }

function CardFace({ card, width = 72, height = 104 }: { card: string; width?: number; height?: number }) {
  const rank = card.slice(0, -1)
  const suit = card.slice(-1)
  const color = SUIT_COLOR[suit] ?? '#000'
  return (
    <div style={{
      width, height, borderRadius: 8, flexShrink: 0,
      background: 'linear-gradient(160deg, #ffffff 0%, #f4f4f4 60%, #eeeeee 100%)',
      boxShadow: '0 6px 18px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.3)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      position: 'relative', userSelect: 'none',
    }}>
      <div style={{ position: 'absolute', top: 5, left: 7, fontSize: 12, fontWeight: 700, color, lineHeight: 1 }}>
        {rank}
      </div>
      <div style={{ fontSize: Math.round(height * 0.32), color, lineHeight: 1 }}>
        {SUIT_GLYPH[suit]}
      </div>
      <div style={{ position: 'absolute', bottom: 5, right: 7, fontSize: 12, fontWeight: 700, color, lineHeight: 1, transform: 'rotate(180deg)' }}>
        {rank}
      </div>
    </div>
  )
}

function EmptySlot({ width = 72, height = 104, onClick }: { width?: number; height?: number; onClick?: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width, height, borderRadius: 8, flexShrink: 0,
        border: `2px dashed ${hov ? C.accent : 'rgba(0,229,255,0.3)'}`,
        background: hov ? 'rgba(0,229,255,0.06)' : 'rgba(0,229,255,0.02)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s',
      }}
    >
      {onClick && (
        <span style={{ fontSize: 20, color: hov ? C.accent : 'rgba(0,229,255,0.3)', transition: 'color 0.15s' }}>+</span>
      )}
    </div>
  )
}

function CardSlot({ card, onClick, width = 72, height = 104 }: {
  card: string | null; onClick: () => void; width?: number; height?: number
}) {
  return card
    ? (
      <div onClick={onClick} style={{ cursor: 'pointer', position: 'relative' }} title="Click to change">
        <CardFace card={card} width={width} height={height} />
        <div style={{
          position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%',
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, color: C.muted,
        }}>✕</div>
      </div>
    )
    : <EmptySlot width={width} height={height} onClick={onClick} />
}

function CardPicker({
  used,
  onSelect,
  onClose,
}: {
  used: Set<string>
  onSelect: (card: string) => void
  onClose: () => void
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: '20px 24px', boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          maxWidth: 540,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ color: C.text, fontFamily: C.font, fontWeight: 700, fontSize: 15 }}>Select a Card</span>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
          >✕</button>
        </div>
        {/* Suit header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 36px)', gap: 4, marginBottom: 2 }}>
          {RANKS.map(r => (
            <div key={r} style={{ textAlign: 'center', fontSize: 11, color: C.muted, fontFamily: C.font, fontWeight: 700 }}>{r}</div>
          ))}
        </div>
        {SUITS.map(suit => (
          <div key={suit} style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 36px)', gap: 4, marginBottom: 4 }}>
            {RANKS.map(rank => {
              const card = rank + suit
              const isUsed = used.has(card)
              return (
                <button
                  key={card}
                  disabled={isUsed}
                  onClick={() => onSelect(card)}
                  style={{
                    width: 36, height: 50, borderRadius: 5, border: 'none',
                    background: isUsed ? 'rgba(255,255,255,0.04)' : 'linear-gradient(160deg, #ffffff, #eeeeee)',
                    opacity: isUsed ? 0.25 : 1,
                    cursor: isUsed ? 'not-allowed' : 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 1, padding: 0,
                    boxShadow: isUsed ? 'none' : '0 2px 6px rgba(0,0,0,0.4)',
                    transition: 'transform 0.1s, opacity 0.1s',
                  }}
                  onMouseEnter={(e) => { if (!isUsed) (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
                >
                  <span style={{ fontSize: 10, fontWeight: 700, color: SUIT_COLOR[suit], lineHeight: 1 }}>{rank}</span>
                  <span style={{ fontSize: 13, color: SUIT_COLOR[suit], lineHeight: 1 }}>{SUIT_GLYPH[suit]}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function TierBadge({ tier }: { tier?: string }) {
  if (!tier) return null
  const map: Record<string, { label: string; color: string }> = {
    quick: { label: 'Quick', color: '#6b7280' },
    strategy: { label: 'Strategy', color: '#0070ff' },
    pro: { label: 'Pro', color: C.accent },
  }
  const t = map[tier] ?? map.quick
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
      color: t.color, border: `1px solid ${t.color}`, borderRadius: 4, padding: '1px 5px', marginLeft: 6,
    }}>{t.label}</span>
  )
}

function SourceBadge({ source }: { source: ScenarioResult['source'] }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    range_chart: { label: 'Range Chart', color: '#0070ff', bg: 'rgba(0,112,255,0.1)' },
    rule: { label: 'Rule Match', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
    personality: { label: 'Personality', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
    position_override: { label: 'Position Override', color: C.accent, bg: C.accentDim },
  }
  const s = map[source] ?? map.personality
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
      color: s.color, background: s.bg, border: `1px solid ${s.color}33`,
    }}>{s.label}</span>
  )
}

function ActionBar({ label, pct, isActive }: { label: string; pct: number; isActive: boolean }) {
  const barColor = label === 'Fold'
    ? C.danger
    : label === 'Check'
      ? '#6b7280'
      : 'linear-gradient(90deg, #00e5ff, #0070ff)'
  const [shown, setShown] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 50)
    return () => clearTimeout(t)
  }, [])
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: isActive ? C.text : C.muted, fontFamily: C.font, fontWeight: isActive ? 700 : 400 }}>
          {label}
        </span>
        <span style={{ fontSize: 13, color: isActive ? C.accent : C.muted, fontFamily: C.font, fontWeight: 700 }}>
          {pct}%
        </span>
      </div>
      <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }} ref={ref}>
        <div style={{
          height: '100%', borderRadius: 4,
          background: barColor,
          width: shown ? `${pct}%` : '0%',
          transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
          opacity: isActive ? 1 : 0.5,
        }} />
      </div>
    </div>
  )
}

const POSITIONS = ['UTG', 'UTG+1', 'HJ', 'CO', 'BTN', 'SB', 'BB']

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ScenarioLabPage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [selectedBotId, setSelectedBotId] = useState('')
  const [cards, setCards] = useState<Record<Slot, string | null>>({
    board0: null, board1: null, board2: null, board3: null, board4: null,
    hand0: null, hand1: null,
  })
  const [pot, setPot] = useState(100)
  const [toCall, setToCall] = useState(20)
  const [minRaise, setMinRaise] = useState(40)
  const [position, setPosition] = useState('BTN')
  const [currentAction, setCurrentAction] = useState('')
  const [pickerSlot, setPickerSlot] = useState<Slot | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScenarioResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get('/bots/my?limit=50').then(r => {
      const items: Bot[] = r.data?.data ?? r.data?.bots ?? r.data ?? []
      setBots(items)
      if (items.length > 0) setSelectedBotId(items[0].id)
    }).catch(() => {})
  }, [])

  const usedCards = new Set(Object.values(cards).filter(Boolean) as string[])

  function openPicker(slot: Slot) {
    setPickerSlot(slot)
  }

  function selectCard(card: string) {
    if (pickerSlot === null) return
    setCards(prev => ({ ...prev, [pickerSlot]: card }))
    setPickerSlot(null)
    setResult(null)
  }

  async function analyze() {
    if (!selectedBotId) { setError('Select a bot first.'); return }
    if (!cards.hand0 || !cards.hand1) { setError("Set the Hero's hand (both cards)."); return }
    setError(null)
    setLoading(true)
    setResult(null)
    try {
      const communityCards = [cards.board0, cards.board1, cards.board2, cards.board3, cards.board4]
        .filter(Boolean) as string[]
      const res = await api.post(`/bots/${selectedBotId}/scenario`, {
        holeCards: [cards.hand0, cards.hand1],
        communityCards,
        position,
        pot,
        toCall,
        minRaise,
        currentAction: currentAction || undefined,
      })
      setResult(res.data)
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Analysis failed.')
    } finally {
      setLoading(false)
    }
  }

  const selectedBot = bots.find(b => b.id === selectedBotId)
  const actionType = result?.primaryAction.type ?? ''
  const actionColor =
    actionType === 'fold' ? C.danger :
    actionType === 'check' ? '#9ca3af' :
    C.accent

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: C.font }}>
      <Sidebar />
      {/* Card picker modal */}
      {pickerSlot !== null && (
        <CardPicker
          used={usedCards}
          onSelect={selectCard}
          onClose={() => setPickerSlot(null)}
        />
      )}

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0, padding: '28px 32px', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18"/>
            </svg>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: 1 }}>
              Scenario <span style={{ color: C.accent }}>Lab</span>
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: C.muted }}>
            Build a specific hand and see how your bot reasons through the decision.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

          {/* ── Left panel: Setup ─────────────────────────────────────────── */}
          <div style={{ width: 440, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Bot selector */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 18px' }}>
              <label style={{ display: 'block', fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                Bot Profile
              </label>
              <CustomSelect
                value={selectedBotId}
                onChange={v => { setSelectedBotId(v); setResult(null) }}
                options={bots.map(b => ({ value: b.id, label: `${b.name} [${b.strategy?.tier ?? '?'}]` }))}
                placeholder="— Select a bot —"
                style={{ width: '100%' }}
                size="sm"
              />
              {selectedBot && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: C.muted }}>Tier:</span>
                  <TierBadge tier={selectedBot.strategy?.tier} />
                </div>
              )}
            </div>

            {/* Board */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 18px' }}>
              <label style={{ display: 'block', fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
                Board (Community Cards)
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {([0, 1, 2, 3, 4] as const).map(i => (
                  <CardSlot
                    key={i}
                    card={cards[`board${i}` as Slot]}
                    onClick={() => openPicker(`board${i}` as Slot)}
                    width={68}
                    height={98}
                  />
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: C.muted }}>
                Leave empty for preflop · 3 = flop · 4 = turn · 5 = river
              </div>
            </div>

            {/* Hero's hand */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 18px' }}>
              <label style={{ display: 'block', fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
                Hero's Hand
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <CardSlot card={cards.hand0} onClick={() => openPicker('hand0')} width={80} height={114} />
                <CardSlot card={cards.hand1} onClick={() => openPicker('hand1')} width={80} height={114} />
              </div>
            </div>

            {/* Game state inputs */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 18px' }}>
              <label style={{ display: 'block', fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>
                Game State
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
                {[
                  { label: 'Pot (chips)', value: pot, setter: setPot },
                  { label: 'To Call', value: toCall, setter: setToCall },
                  { label: 'Min Raise', value: minRaise, setter: setMinRaise },
                ].map(({ label, value, setter }) => (
                  <div key={label}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
                    <input
                      type="number"
                      value={value}
                      min={0}
                      onChange={e => { setter(Number(e.target.value)); setResult(null) }}
                      style={{
                        width: '100%', boxSizing: 'border-box', padding: '7px 10px',
                        background: '#0a0a1a', border: `1px solid ${C.border}`, borderRadius: 6,
                        color: C.text, fontFamily: C.font, fontSize: 14,
                      }}
                    />
                  </div>
                ))}
                <div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Position</div>
                  <CustomSelect
                    value={position}
                    onChange={v => { setPosition(v); setResult(null) }}
                    options={POSITIONS.map(p => ({ value: p, label: p }))}
                    size="sm"
                  />
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Current Action (description)</div>
                <input
                  type="text"
                  value={currentAction}
                  placeholder="e.g. Facing a 3-bet of 12BB"
                  onChange={e => setCurrentAction(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '7px 10px',
                    background: '#0a0a1a', border: `1px solid ${C.border}`, borderRadius: 6,
                    color: C.text, fontFamily: C.font, fontSize: 14,
                  }}
                />
              </div>
            </div>

            {/* Analyze button */}
            {error && (
              <div style={{ fontSize: 13, color: C.danger, background: 'rgba(226,75,74,0.08)', border: `1px solid rgba(226,75,74,0.3)`, borderRadius: 6, padding: '8px 12px' }}>
                {error}
              </div>
            )}
            <button
              onClick={analyze}
              disabled={loading}
              style={{
                padding: '12px 0', borderRadius: 8, border: 'none',
                background: loading ? 'rgba(0,229,255,0.15)' : 'linear-gradient(90deg, #00e5ff, #0070ff)',
                color: loading ? C.muted : '#000',
                fontFamily: C.font, fontWeight: 700, fontSize: 15, letterSpacing: 1,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'opacity 0.15s',
              }}
            >
              {loading ? 'Analyzing…' : '▶  Analyze Scenario'}
            </button>
          </div>

          {/* ── Right panel: Results ─────────────────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {!result && !loading && (
              <div style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: '48px 32px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.3 }}>🧪</div>
                <div style={{ color: C.muted, fontSize: 14 }}>
                  Set up a scenario on the left and click <strong style={{ color: C.text }}>Analyze</strong> to see the bot's decision.
                </div>
              </div>
            )}

            {loading && (
              <div style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: '48px 32px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 13, color: C.muted }}>Running 20 evaluations…</div>
              </div>
            )}

            {result && !loading && (
              <>
                {/* Decision */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '20px 22px' }}>
                  <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>
                    Decision
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{
                      fontSize: 28, fontWeight: 900, letterSpacing: 2, color: actionColor,
                      textShadow: `0 0 20px ${actionColor}66`,
                      textTransform: 'uppercase',
                    }}>
                      {actionType === 'all_in' ? 'ALL IN' : actionType}
                      {result.primaryAction.amount ? ` · ${result.primaryAction.amount}` : ''}
                    </div>
                    <SourceBadge source={result.source} />
                  </div>
                  {result.handNotation && (
                    <div style={{ marginTop: 10, fontSize: 13, color: C.muted }}>
                      Hand: <span style={{ color: C.accent, fontWeight: 700 }}>{result.handNotation}</span>
                    </div>
                  )}
                  {result.ruleId && (
                    <div style={{ marginTop: 6, fontSize: 12, color: C.muted }}>
                      Rule: <span style={{ color: '#f59e0b' }}>{result.ruleId}</span>
                    </div>
                  )}
                </div>

                {/* Action tendencies */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '20px 22px' }}>
                  <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>
                    Action Tendencies <span style={{ fontSize: 10, color: '#6b7280' }}>(across 20 evaluations)</span>
                  </div>
                  {[
                    { label: 'Raise', pct: result.distribution.raise },
                    { label: 'Call', pct: result.distribution.call },
                    { label: 'Check', pct: result.distribution.check },
                    { label: 'Fold', pct: result.distribution.fold },
                  ].map(({ label, pct }) => {
                    const isActive =
                      (label === 'Raise' && (actionType === 'raise' || actionType === 'all_in')) ||
                      (label === 'Call' && actionType === 'call') ||
                      (label === 'Check' && actionType === 'check') ||
                      (label === 'Fold' && actionType === 'fold')
                    return <ActionBar key={label} label={label} pct={pct} isActive={isActive} />
                  })}
                </div>

                {/* Bot's Reasoning */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '20px 22px' }}>
                  <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
                    Bot's Reasoning
                  </div>
                  <div style={{
                    background: '#08081a', border: `1px solid ${C.border}`, borderRadius: 6,
                    padding: '14px 16px', fontFamily: "'Courier New', monospace",
                    fontSize: 13, color: '#d4dae4', lineHeight: 1.6,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    minHeight: 80,
                  }}>
                    {result.explanation || '(no explanation provided)'}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
