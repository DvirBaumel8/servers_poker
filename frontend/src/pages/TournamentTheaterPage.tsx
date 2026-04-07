import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { C, T, monoStyle } from '../styles/tokens'

// ─── Types (mirrored from backend tournament-log.types.ts) ───────────────────

type StreetCode = 'p' | 'f' | 't' | 'r'

interface ActionMetrics {
  eq: number
  w: [number, number, number] | null
  source: string
  rule_id?: string
  hand_notation?: string
}

interface ActionLog {
  seq: number
  p_id: string
  position: string
  st: StreetCode
  dec: string
  amt?: number
  metrics: ActionMetrics
}

interface HandLog {
  hand_id: string
  hand_number: number
  dealer_bot_id: string
  board: string[]
  initial_stacks: Record<string, number>
  actions: ActionLog[]
}

interface ParticipantInfo {
  elo: number
  dna: { name: string; tier?: string }
}

interface TournamentLogSummary {
  id: string
  timestamp: string
  participants: ParticipantInfo[]
}

interface MasterTournamentLog {
  tournament_summary: TournamentLogSummary
  hands: HandLog[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type HandResult = 'win' | 'loss' | 'bigpot' | 'neutral'

function getHandResult(heroId: string, handIdx: number, hands: HandLog[]): HandResult {
  const thisStacks = hands[handIdx].initial_stacks
  const nextStacks = hands[handIdx + 1]?.initial_stacks
  if (!nextStacks) return 'neutral'

  const heroStart = thisStacks[heroId] ?? 0
  const heroEnd = nextStacks[heroId] ?? 0
  const total = Object.values(thisStacks).reduce((a, b) => a + b, 0)
  const avg = total / Math.max(Object.keys(thisStacks).length, 1)

  if (total > avg * 2) return 'bigpot'
  if (heroEnd > heroStart) return 'win'
  if (heroEnd < heroStart) return 'loss'
  return 'neutral'
}

function communityCardsForState(hand: HandLog, actionIdx: number): string[] {
  if (actionIdx < 0 || hand.actions.length === 0) return []
  const action = hand.actions[actionIdx]
  if (!action) return []
  if (action.st === 'p') return []
  if (action.st === 'f') return hand.board.slice(0, 3)
  if (action.st === 't') return hand.board.slice(0, 4)
  return hand.board // river — show all
}

function getActionLabel(action: ActionLog): string {
  const dec = action.dec.toUpperCase()
  if (action.amt != null && action.amt > 0) return `${dec} ${action.amt.toLocaleString()}`
  return dec
}

function parseCard(card: string): { rank: string; suit: string; suitSymbol: string; color: string } {
  if (!card || card.length < 2) return { rank: '?', suit: '?', suitSymbol: '?', color: '#fff' }
  const rank = card.slice(0, -1)
  const suitChar = card.slice(-1).toLowerCase()
  const suitMap: Record<string, { symbol: string; color: string }> = {
    h: { symbol: '♥', color: '#e53935' },
    d: { symbol: '♦', color: '#e53935' },
    c: { symbol: '♣', color: '#1b5e20' },
    s: { symbol: '♠', color: '#1a237e' },
  }
  const s = suitMap[suitChar] ?? { symbol: '?', color: '#888' }
  return { rank, suit: suitChar, suitSymbol: s.symbol, color: s.color }
}

// Speed in ms per action step
const SPEED_MAP: Record<string, number> = {
  '0.5': 3000,
  '1': 1500,
  '2': 750,
  '4': 375,
}

// 8 fixed seat positions (percentage of table container)
const SEAT_POSITIONS = [
  { left: '18%', top: '10%' },  // 0 top-left
  { left: '38%', top: '3%' },   // 1 top-center-left
  { left: '62%', top: '3%' },   // 2 top-center-right
  { left: '82%', top: '10%' },  // 3 top-right
  { left: '92%', top: '45%' },  // 4 right
  { left: '80%', top: '75%' },  // 5 bottom-right
  { left: '18%', top: '75%' },  // 6 bottom-left
  { left: '7%',  top: '45%' },  // 7 left
]

// Deterministic avatar color from botId
function avatarHue(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff
  return h % 360
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CardBack() {
  return (
    <div style={{
      width: 46, height: 66, borderRadius: 5, flexShrink: 0,
      background: 'linear-gradient(145deg, #9eaab6 0%, #6e7f8d 40%, #4a5a68 100%)',
      border: '1px solid rgba(255,255,255,0.15)',
      boxShadow: '0 3px 8px rgba(0,0,0,0.55)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* crosshatch */}
      <div style={{
        position: 'absolute', inset: 3, borderRadius: 3,
        backgroundImage: `repeating-linear-gradient(45deg,rgba(255,255,255,0.06) 0px,rgba(255,255,255,0.06) 1px,transparent 1px,transparent 6px),
          repeating-linear-gradient(-45deg,rgba(255,255,255,0.06) 0px,rgba(255,255,255,0.06) 1px,transparent 1px,transparent 6px)`,
      }} />
    </div>
  )
}

function CardFace({ card }: { card: string }) {
  const { rank, suitSymbol, color } = parseCard(card)
  return (
    <div style={{
      width: 46, height: 66, borderRadius: 5, flexShrink: 0,
      background: 'linear-gradient(160deg,#ffffff 0%,#f4f4f4 60%,#eeeeee 100%)',
      border: '1px solid rgba(0,0,0,0.15)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.9)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color, fontFamily: "'Trebuchet MS',sans-serif", fontWeight: 700, userSelect: 'none',
      transform: 'perspective(600px) rotateY(2deg)',
    }}>
      <div style={{ fontSize: 18, lineHeight: 1 }}>{rank}</div>
      <div style={{ fontSize: 16, lineHeight: 1 }}>{suitSymbol}</div>
    </div>
  )
}

interface ActionBubbleProps { label: string; visible: boolean }
function ActionBubble({ label, visible }: ActionBubbleProps) {
  if (!visible) return null
  return (
    <div style={{
      position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
      marginBottom: 6, whiteSpace: 'nowrap', zIndex: 20,
      background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(0,245,255,0.4)',
      borderRadius: 8, padding: '4px 10px',
      color: C.accent, fontSize: T.sm, fontWeight: 700, letterSpacing: 0.5,
      animation: 'actionFloat 1.5s ease-out forwards',
      pointerEvents: 'none',
    }}>
      {label}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TournamentTheaterPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const stateLog = (location.state as { log?: MasterTournamentLog } | null)?.log ?? null

  // ── Log state — seeded from navigation state or file upload ──
  const [log, setLog] = useState<MasterTournamentLog | null>(stateLog)

  // ── Hero selection ──
  const [heroId, setHeroId] = useState<string | null>(null)

  // ── Replay state ──
  const [currentHandIdx, setCurrentHandIdx] = useState(0)
  const [currentActionIdx, setCurrentActionIdx] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState<0.5 | 1 | 2 | 4>(1)

  // ── Active bubble ──
  const [bubbleFor, setBubbleFor] = useState<string | null>(null)
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Playback timer ──
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Carousel ref ──
  const carouselRef = useRef<HTMLDivElement>(null)

  // ── Derive bot list from log ──
  const bots = useMemo<Array<{ id: string; name: string; elo: number; tier: string }>>(() => {
    if (!log) return []
    const ids = Object.keys(log.hands[0]?.initial_stacks ?? {})
    return ids.map((id, i) => ({
      id,
      name: log.tournament_summary.participants[i]?.dna?.name ?? `Bot-${id.slice(0, 6)}`,
      elo: log.tournament_summary.participants[i]?.elo ?? 0,
      tier: log.tournament_summary.participants[i]?.dna?.tier ?? '?',
    }))
  }, [log])

  const botNameMap = useMemo(() => {
    const m: Record<string, string> = {}
    bots.forEach(b => { m[b.id] = b.name })
    return m
  }, [bots])

  // ── Current hand ──
  const currentHand = log?.hands[currentHandIdx] ?? null

  // ── Derived replay state ──
  const { communityCards, foldedPlayers, lastActionPerPlayer, potSize, activePlayerStacks } =
    useMemo(() => {
      if (!currentHand) return {
        communityCards: [], foldedPlayers: new Set<string>(),
        lastActionPerPlayer: {} as Record<string, ActionLog>,
        potSize: 0, activePlayerStacks: {} as Record<string, number>,
      }

      const visibleActions = currentActionIdx >= 0
        ? currentHand.actions.slice(0, currentActionIdx + 1)
        : []

      const folded = new Set<string>()
      const lastAct: Record<string, ActionLog> = {}
      const betsThisHand: Record<string, number> = {}

      for (const act of visibleActions) {
        lastAct[act.p_id] = act
        if (act.dec === 'fold') folded.add(act.p_id)
        if (act.amt != null && act.amt > 0) {
          betsThisHand[act.p_id] = (betsThisHand[act.p_id] ?? 0) + act.amt
        }
      }

      const stacks: Record<string, number> = { ...currentHand.initial_stacks }
      for (const [id, bet] of Object.entries(betsThisHand)) {
        stacks[id] = Math.max(0, (stacks[id] ?? 0) - bet)
      }

      const pot = Object.values(betsThisHand).reduce((a, b) => a + b, 0)

      return {
        communityCards: communityCardsForState(currentHand, currentActionIdx),
        foldedPlayers: folded,
        lastActionPerPlayer: lastAct,
        potSize: pot,
        activePlayerStacks: stacks,
      }
    }, [currentHand, currentActionIdx])

  // ── Advance one step ──
  const stepForward = useCallback(() => {
    if (!log || !currentHand) return

    const maxActionIdx = currentHand.actions.length - 1

    if (currentActionIdx < maxActionIdx) {
      const nextIdx = currentActionIdx + 1
      setCurrentActionIdx(nextIdx)
      const action = currentHand.actions[nextIdx]
      if (action) {
        setBubbleFor(action.p_id)
        if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
        bubbleTimerRef.current = setTimeout(() => setBubbleFor(null), 1500)
      }
    } else if (currentHandIdx < log.hands.length - 1) {
      // advance to next hand
      setCurrentHandIdx(h => h + 1)
      setCurrentActionIdx(-1)
      setBubbleFor(null)
    } else {
      // end of replay
      setIsPlaying(false)
    }
  }, [log, currentHand, currentActionIdx, currentHandIdx])

  // ── Auto-play ──
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(stepForward, SPEED_MAP[String(speed)])
    } else {
      if (playTimerRef.current) clearInterval(playTimerRef.current)
    }
    return () => { if (playTimerRef.current) clearInterval(playTimerRef.current) }
  }, [isPlaying, speed, stepForward])

  // ── Scroll carousel to current hand ──
  useEffect(() => {
    const el = carouselRef.current?.children[currentHandIdx] as HTMLElement | undefined
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [currentHandIdx])

  // ── Cleanup on unmount ──
  useEffect(() => () => {
    if (playTimerRef.current) clearInterval(playTimerRef.current)
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
  }, [])

  // ─── No log loaded — show drop zone ──────────────────────────────────────
  if (!log) {
    return (
      <>
        <style>{CSS_ANIMATIONS}</style>
        <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, color: C.text, fontFamily: C.font }}>
          <Sidebar />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LogDropZone onLoad={(parsed) => { setLog(parsed); setHeroId(null); setCurrentHandIdx(0); setCurrentActionIdx(-1) }} />
          </div>
        </div>
      </>
    )
  }

  // ─── Bot selection overlay ────────────────────────────────────────────────
  if (!heroId) {
    return (
      <>
        <style>{`
          @keyframes heroGlow {
            0%,100% { box-shadow: 0 0 0 3px #ffd700, 0 0 20px #ffd700, 0 0 40px rgba(0,245,255,0.3); }
            50% { box-shadow: 0 0 0 3px #ffd700, 0 0 32px #ffd700, 0 0 60px rgba(0,245,255,0.5); }
          }
          @keyframes botCardHover {
            from { transform: translateY(0); }
            to { transform: translateY(-4px); }
          }
        `}</style>
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(5,5,10,0.97)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: C.font, color: C.text,
        }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: 36 }}>🎬</div>
            <div style={{ fontSize: T.h1, fontWeight: 800, marginTop: 8, letterSpacing: 0.5 }}>
              The Theater
            </div>
            <div style={{ color: C.muted, fontSize: T.base, marginTop: 6 }}>
              Choose a bot to follow as your Hero through the tournament
            </div>
          </div>

          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center',
            maxWidth: 800, padding: '0 24px',
          }}>
            {bots.map((bot) => (
              <BotPickCard
                key={bot.id}
                bot={bot}
                onSelect={() => setHeroId(bot.id)}
              />
            ))}
          </div>

          <div style={{ marginTop: 32, color: C.muted, fontSize: T.sm }}>
            {log.hands.length} hands · {bots.length} bots
          </div>
        </div>
      </>
    )
  }

  // ─── Main Theater layout ──────────────────────────────────────────────────
  const isComplete = currentHandIdx >= log.hands.length - 1 &&
    currentActionIdx >= (currentHand?.actions.length ?? 0) - 1

  return (
    <>
      <style>{CSS_ANIMATIONS}</style>
      <div style={{
        display: 'flex', minHeight: '100vh',
        background: '#050508', color: C.text, fontFamily: C.font,
        overflow: 'hidden',
      }}>
        <Sidebar />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Top bar */}
          <div style={{
            height: 48, display: 'flex', alignItems: 'center', gap: 12,
            padding: '0 20px', borderBottom: `1px solid ${C.border}`,
            background: 'rgba(9,9,11,0.9)', flexShrink: 0, backdropFilter: 'blur(8px)',
          }}>
            <button
              onClick={() => navigate(-1)}
              style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1 }}
            >←</button>
            <span style={{ color: C.muted, fontSize: T.sm }}>The Theater</span>
            <span style={{ color: C.border, fontSize: T.sm }}>·</span>
            <span style={{ fontSize: T.sm, color: C.text }}>
              Hand <strong>#{currentHand?.hand_number ?? '-'}</strong>
              <span style={{ color: C.muted }}> / {log.hands.length}</span>
            </span>
            <div style={{ flex: 1 }} />
            {/* Hero indicator */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 12px', borderRadius: 20,
              border: '1px solid rgba(255,215,0,0.3)',
              background: 'rgba(255,215,0,0.06)',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffd700', animation: 'pulse-gold 2s infinite' }} />
              <span style={{ fontSize: T.sm, color: '#ffd700', fontWeight: 600 }}>
                Hero: {botNameMap[heroId]}
              </span>
            </div>
            <button
              onClick={() => { setHeroId(null); setIsPlaying(false); setCurrentHandIdx(0); setCurrentActionIdx(-1) }}
              style={{ background: 'none', border: `1px solid ${C.border}`, color: C.muted, cursor: 'pointer', fontSize: T.sm, padding: '4px 10px', borderRadius: 6, fontFamily: C.font }}
            >
              Switch Hero
            </button>
            <label style={{
              background: 'none', border: `1px solid ${C.border}`, color: C.muted, cursor: 'pointer',
              fontSize: T.sm, padding: '4px 10px', borderRadius: 6, fontFamily: C.font,
            }}>
              Load Log
              <input
                type="file" accept=".json" style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = (ev) => {
                    try {
                      const parsed = JSON.parse(ev.target?.result as string) as MasterTournamentLog
                      setLog(parsed)
                      setHeroId(null)
                      setCurrentHandIdx(0)
                      setCurrentActionIdx(-1)
                      setIsPlaying(false)
                    } catch { /* invalid JSON — ignore */ }
                  }
                  reader.readAsText(file)
                  e.target.value = ''
                }}
              />
            </label>
          </div>

          {/* Table area */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 20px 8px', overflow: 'hidden' }}>
            <PokerTable
              hand={currentHand}
              heroId={heroId}
              bots={bots}
              botNameMap={botNameMap}
              communityCards={communityCards}
              potSize={potSize}
              playerStacks={activePlayerStacks}
              foldedPlayers={foldedPlayers}
              lastActionPerPlayer={lastActionPerPlayer}
              bubbleFor={bubbleFor}
            />
          </div>

          {/* Replay controls + carousel */}
          <div style={{ flexShrink: 0, padding: '0 20px 16px' }}>
            {/* Controls row */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10,
            }}>
              {/* Prev hand */}
              <ControlButton
                onClick={() => { setCurrentHandIdx(h => Math.max(0, h - 1)); setCurrentActionIdx(-1); setIsPlaying(false) }}
                disabled={currentHandIdx === 0}
                title="Previous Hand"
              >⏮</ControlButton>

              {/* Step back */}
              <ControlButton
                onClick={() => {
                  setIsPlaying(false)
                  if (currentActionIdx > -1) setCurrentActionIdx(i => i - 1)
                  else if (currentHandIdx > 0) {
                    const prevHand = log.hands[currentHandIdx - 1]
                    setCurrentHandIdx(h => h - 1)
                    setCurrentActionIdx(prevHand.actions.length - 1)
                  }
                }}
                disabled={currentHandIdx === 0 && currentActionIdx === -1}
                title="Step Back"
              >‹</ControlButton>

              {/* Play/Pause */}
              <button
                onClick={() => {
                  if (isComplete) {
                    setCurrentHandIdx(0); setCurrentActionIdx(-1); setIsPlaying(true)
                  } else {
                    setIsPlaying(p => !p)
                  }
                }}
                style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: isPlaying ? 'rgba(0,245,255,0.15)' : 'linear-gradient(135deg,#06b6d4,#00d4e8)',
                  border: isPlaying ? `2px solid ${C.accent}` : 'none',
                  color: isPlaying ? C.accent : '#000',
                  fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: isPlaying ? `0 0 16px rgba(0,245,255,0.3)` : '0 0 12px rgba(0,245,255,0.25)',
                  transition: 'all 0.2s',
                }}
                title={isComplete ? 'Replay' : isPlaying ? 'Pause' : 'Play'}
              >
                {isComplete ? '↺' : isPlaying ? '⏸' : '▶'}
              </button>

              {/* Step forward */}
              <ControlButton onClick={() => { setIsPlaying(false); stepForward() }} disabled={isComplete} title="Step Forward">›</ControlButton>

              {/* Next hand */}
              <ControlButton
                onClick={() => { setCurrentHandIdx(h => Math.min(log.hands.length - 1, h + 1)); setCurrentActionIdx(-1); setIsPlaying(false) }}
                disabled={currentHandIdx >= log.hands.length - 1}
                title="Next Hand"
              >⏭</ControlButton>

              {/* Speed pills */}
              <div style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
                {([0.5, 1, 2, 4] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    style={{
                      padding: '4px 10px', borderRadius: 16, fontSize: T.xs, fontWeight: 700,
                      cursor: 'pointer', fontFamily: C.font, letterSpacing: 0.3,
                      background: speed === s ? C.accent : 'rgba(255,255,255,0.05)',
                      color: speed === s ? '#000' : C.muted,
                      border: speed === s ? 'none' : `1px solid ${C.border}`,
                      transition: 'all 0.15s',
                    }}
                  >
                    {s}x
                  </button>
                ))}
              </div>

              {/* Action counter */}
              <div style={{ marginLeft: 12, color: C.muted, fontSize: T.xs, ...monoStyle }}>
                {currentActionIdx + 1} / {currentHand?.actions.length ?? 0} actions
              </div>
            </div>

            {/* Hand carousel */}
            <div
              ref={carouselRef}
              style={{
                display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4,
                scrollbarWidth: 'thin', scrollbarColor: `${C.border} transparent`,
              }}
            >
              {log.hands.map((hand, idx) => {
                const result = heroId ? getHandResult(heroId, idx, log.hands) : 'neutral'
                const isActive = idx === currentHandIdx
                return (
                  <HandCard
                    key={hand.hand_id}
                    hand={hand}
                    result={result}
                    isActive={isActive}
                    onClick={() => { setCurrentHandIdx(idx); setCurrentActionIdx(-1); setIsPlaying(false) }}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── BotPickCard ──────────────────────────────────────────────────────────────

function BotPickCard({ bot, onSelect }: { bot: { id: string; name: string; elo: number; tier: string }; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false)
  const hue = avatarHue(bot.id)

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 160, padding: '20px 16px', borderRadius: 12, cursor: 'pointer',
        background: hovered ? 'rgba(28,28,44,0.9)' : 'rgba(18,18,27,0.7)',
        border: hovered ? `1px solid ${C.accent}` : `1px solid rgba(255,255,255,0.08)`,
        boxShadow: hovered ? `0 0 20px rgba(0,245,255,0.15)` : '0 4px 16px rgba(0,0,0,0.4)',
        transition: 'all 0.2s', textAlign: 'center',
        transform: hovered ? 'translateY(-4px)' : 'none',
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 56, height: 56, borderRadius: '50%', margin: '0 auto 12px',
        background: `hsl(${hue},60%,35%)`,
        border: `2px solid hsl(${hue},70%,50%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, fontWeight: 700, color: '#fff',
        boxShadow: hovered ? `0 0 16px hsl(${hue},60%,35%)` : 'none',
        transition: 'box-shadow 0.2s',
      }}>
        {bot.name.charAt(0).toUpperCase()}
      </div>

      <div style={{ fontSize: T.md, fontWeight: 700, marginBottom: 4 }}>{bot.name}</div>
      <div style={{ fontSize: T.xs, color: C.muted, marginBottom: 8 }}>{bot.tier ?? 'Bot'}</div>
      <div style={{ fontSize: T.sm, color: C.gold, fontWeight: 600, ...monoStyle }}>{bot.elo} ELO</div>

      {hovered && (
        <div style={{
          marginTop: 12, padding: '6px 0', borderTop: `1px solid rgba(255,255,255,0.08)`,
          color: C.accent, fontSize: T.xs, fontWeight: 700, letterSpacing: 0.5,
        }}>
          FOLLOW HERO →
        </div>
      )}
    </div>
  )
}

// ─── PokerTable ───────────────────────────────────────────────────────────────

interface PokerTableProps {
  hand: HandLog | null
  heroId: string
  bots: Array<{ id: string; name: string }>
  botNameMap: Record<string, string>
  communityCards: string[]
  potSize: number
  playerStacks: Record<string, number>
  foldedPlayers: Set<string>
  lastActionPerPlayer: Record<string, ActionLog>
  bubbleFor: string | null
}

function PokerTable({
  hand, heroId, bots, botNameMap, communityCards, potSize,
  playerStacks, foldedPlayers, lastActionPerPlayer, bubbleFor,
}: PokerTableProps) {
  const playerIds = hand ? Object.keys(hand.initial_stacks) : bots.map(b => b.id)

  // Pad to 8 seats (fill empties)
  const seats = Array.from({ length: 8 }, (_, i) => playerIds[i] ?? null)

  const dealerBotId = hand?.dealer_bot_id ?? null

  // Determine SB / BB from first actions
  const sbId = hand?.actions.find(a => a.position === 'SB')?.p_id ?? null
  const bbId = hand?.actions.find(a => a.position === 'BB')?.p_id ?? null

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 900, aspectRatio: '900/540' }}>
      {/* Wood rail */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: 'radial-gradient(ellipse at 50% 10%,#a0714f 0%,#7a4a2a 15%,#3d1f0a 50%,#6b3a1f 80%,#4a2510 100%)',
        backgroundImage: `radial-gradient(ellipse at 50% 10%,#a0714f 0%,#7a4a2a 15%,#3d1f0a 50%,#6b3a1f 80%,#4a2510 100%),
          repeating-linear-gradient(92deg,transparent 0px,transparent 12px,rgba(0,0,0,0.08) 12px,rgba(0,0,0,0.08) 14px)`,
        boxShadow: 'inset 0 8px 16px rgba(255,255,255,0.06),inset 0 -6px 12px rgba(0,0,0,0.5),0 8px 50px rgba(0,0,0,0.7),0 16px 80px rgba(0,0,0,0.5)',
      }} />

      {/* Felt surface */}
      <div style={{
        position: 'absolute', inset: '5%',
        borderRadius: '50%',
        background: 'radial-gradient(ellipse at 50% 45%,#256b40 0%,#1a5232 30%,#0e3d22 60%,#062010 100%)',
        backgroundImage: `radial-gradient(ellipse at 50% 45%,#256b40 0%,#1a5232 30%,#0e3d22 60%,#062010 100%),
          repeating-linear-gradient(30deg,transparent 0px,transparent 2px,rgba(255,255,255,0.008) 2px,rgba(255,255,255,0.008) 3px),
          repeating-linear-gradient(60deg,transparent 0px,transparent 2px,rgba(255,255,255,0.008) 2px,rgba(255,255,255,0.008) 3px),
          repeating-linear-gradient(90deg,transparent 0px,transparent 3px,rgba(255,255,255,0.006) 3px,rgba(255,255,255,0.006) 4px)`,
        boxShadow: 'inset 0 4px 24px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 8,
      }}>
        {/* Watermark */}
        <div style={{
          position: 'absolute', fontSize: 110, fontWeight: 900, color: 'rgba(255,255,255,0.025)',
          userSelect: 'none', pointerEvents: 'none', letterSpacing: 8,
        }}>BR</div>

        {/* Community cards */}
        <div style={{ display: 'flex', gap: 8, zIndex: 2 }}>
          {Array.from({ length: 5 }, (_, i) => (
            communityCards[i]
              ? <CardFace key={i} card={communityCards[i]} />
              : <EmptyCardSlot key={i} />
          ))}
        </div>

        {/* Pot */}
        {potSize > 0 && (
          <div style={{ textAlign: 'center', zIndex: 2 }}>
            <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 2 }}>Total Pot</div>
            <div style={{
              fontSize: 36, fontWeight: 800, color: '#ffd700',
              textShadow: '0 0 20px rgba(255,215,0,0.6),0 0 40px rgba(255,215,0,0.3)',
              animation: 'pulse-gold 3s ease-in-out infinite',
              ...monoStyle,
            }}>
              {potSize.toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {/* Player seats */}
      {seats.map((playerId, seatIdx) => {
        if (!playerId) return null
        const pos = SEAT_POSITIONS[seatIdx]
        const isHero = playerId === heroId
        const isFolded = foldedPlayers.has(playerId)
        const chips = playerStacks[playerId] ?? hand?.initial_stacks[playerId] ?? 0
        const lastAction = lastActionPerPlayer[playerId]
        const isDealer = playerId === dealerBotId
        const isSB = playerId === sbId
        const isBB = playerId === bbId
        const displayName = botNameMap[playerId] ?? `Bot-${playerId.slice(0, 6)}`
        const hue = avatarHue(playerId)
        const showBubble = bubbleFor === playerId && lastAction != null

        return (
          <div
            key={playerId}
            style={{
              position: 'absolute',
              left: pos.left, top: pos.top,
              transform: 'translate(-50%,-50%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              opacity: isFolded ? 0.4 : 1,
              filter: isFolded ? 'grayscale(0.7) brightness(0.7)' : 'none',
              transition: 'opacity 0.4s, filter 0.4s',
              zIndex: 5,
            }}
          >
            {/* Action bubble */}
            <div style={{ position: 'relative' }}>
              {showBubble && lastAction && (
                <ActionBubble label={getActionLabel(lastAction)} visible={showBubble} />
              )}

              {/* Avatar */}
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: `hsl(${hue},55%,30%)`,
                border: isHero
                  ? '3px solid transparent'
                  : `2px solid hsl(${hue},50%,40%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700, color: '#fff',
                boxShadow: isHero
                  ? '0 0 0 3px #ffd700,0 0 20px #ffd700,0 0 40px rgba(0,245,255,0.4)'
                  : 'none',
                animation: isHero ? 'heroGlow 2.5s ease-in-out infinite' : 'none',
                transition: 'box-shadow 0.3s',
              }}>
                {displayName.charAt(0).toUpperCase()}
              </div>
            </div>

            {/* Hole cards */}
            <div style={{ display: 'flex', gap: 3 }}>
              <CardBack />
              <CardBack />
            </div>

            {/* Nameplate */}
            <div style={{
              background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
              borderRadius: 6, padding: '4px 8px', textAlign: 'center',
              border: isHero ? `1px solid rgba(255,215,0,0.4)` : `1px solid rgba(255,255,255,0.08)`,
              minWidth: 80,
            }}>
              <div style={{
                fontSize: T.xs, fontWeight: 600, color: isHero ? '#ffd700' : '#d4dae4',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 90,
              }}>
                {isHero ? '★ ' : ''}{displayName}
              </div>
              <div style={{ fontSize: T.sm, fontWeight: 700, color: C.accent, ...monoStyle }}>
                {chips.toLocaleString()}
              </div>
            </div>

            {/* Blind badges */}
            <div style={{ display: 'flex', gap: 3 }}>
              {isDealer && <BlindBadge label="D" color="#1a1a1a" />}
              {isSB && <BlindBadge label="SB" color="#1565c0" />}
              {isBB && <BlindBadge label="BB" color="#b71c1c" />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Supporting components ────────────────────────────────────────────────────

function EmptyCardSlot() {
  return (
    <div style={{
      width: 46, height: 66, borderRadius: 5,
      border: '1px dashed rgba(255,255,255,0.12)',
      background: 'rgba(255,255,255,0.02)',
    }} />
  )
}

function BlindBadge({ label, color }: { label: string; color: string }) {
  return (
    <div style={{
      width: 22, height: 22, borderRadius: '50%', background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: 0.3,
      border: '1px solid rgba(255,255,255,0.2)',
    }}>
      {label}
    </div>
  )
}

function ControlButton({ onClick, disabled, title, children }: {
  onClick: () => void; disabled: boolean; title: string; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 36, height: 36, borderRadius: 8,
        background: disabled ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)',
        border: `1px solid ${disabled ? 'rgba(255,255,255,0.04)' : C.border}`,
        color: disabled ? 'rgba(255,255,255,0.2)' : C.text,
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  )
}

// ─── HandCard (carousel item) ─────────────────────────────────────────────────

const RESULT_ICONS: Record<HandResult, { icon: string; color: string; label: string }> = {
  win:     { icon: '✦', color: '#22c55e', label: 'WIN' },
  loss:    { icon: '✗', color: '#e24b4a', label: 'LOSS' },
  bigpot:  { icon: '◉', color: '#ffd700', label: 'BIG POT' },
  neutral: { icon: '·', color: '#5a6070', label: '' },
}

function HandCard({ hand, result, isActive, onClick }: {
  hand: HandLog; result: HandResult; isActive: boolean; onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const ri = RESULT_ICONS[result]
  const totalPot = Object.values(hand.initial_stacks).reduce((a, b) => a + b, 0)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flexShrink: 0, width: 72, borderRadius: 8, cursor: 'pointer', padding: '8px 6px',
        textAlign: 'center', userSelect: 'none',
        background: isActive
          ? 'rgba(0,245,255,0.12)'
          : hovered ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
        border: isActive
          ? `1px solid ${C.accent}`
          : `1px solid ${hovered ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'}`,
        boxShadow: isActive ? `0 0 12px rgba(0,245,255,0.2)` : 'none',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ fontSize: 18, lineHeight: 1.2, color: ri.color }}>{ri.icon}</div>
      <div style={{ fontSize: T.xs, fontWeight: 700, color: isActive ? C.accent : C.text, marginTop: 4 }}>
        #{hand.hand_number}
      </div>
      {ri.label && (
        <div style={{ fontSize: 9, color: ri.color, fontWeight: 700, letterSpacing: 0.3, marginTop: 2 }}>
          {ri.label}
        </div>
      )}
      <div style={{ fontSize: 9, color: C.muted, marginTop: 3, ...monoStyle }}>
        {totalPot > 999 ? `${(totalPot / 1000).toFixed(1)}k` : totalPot}
      </div>
    </div>
  )
}

// ─── LogDropZone ─────────────────────────────────────────────────────────────

function LogDropZone({ onLoad }: { onLoad: (log: MasterTournamentLog) => void }) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function parseFile(file: File) {
    setError(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as MasterTournamentLog
        if (!parsed.hands || !parsed.tournament_summary) throw new Error('Not a valid MasterTournamentLog')
        onLoad(parsed)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Invalid JSON file')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault(); setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) parseFile(file)
      }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 20, textAlign: 'center', padding: 48,
        width: 480, borderRadius: 20,
        background: dragging ? 'rgba(0,245,255,0.06)' : 'rgba(18,18,27,0.6)',
        border: `2px dashed ${dragging ? C.accent : 'rgba(255,255,255,0.12)'}`,
        boxShadow: dragging ? `0 0 40px rgba(0,245,255,0.15)` : 'none',
        transition: 'all 0.2s', cursor: 'pointer',
      }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef} type="file" accept=".json" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); e.target.value = '' }}
      />

      <div style={{ fontSize: 56 }}>🎬</div>

      <div>
        <div style={{ fontSize: T.h1, fontWeight: 800, letterSpacing: 0.5 }}>The Theater</div>
        <div style={{ color: C.muted, fontSize: T.base, marginTop: 6 }}>
          Tournament Replay System
        </div>
      </div>

      <div style={{
        padding: '16px 24px', borderRadius: 12,
        background: dragging ? 'rgba(0,245,255,0.1)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${dragging ? C.accent : 'rgba(255,255,255,0.08)'}`,
        transition: 'all 0.2s',
      }}>
        <div style={{ fontSize: T.md, fontWeight: 600, color: dragging ? C.accent : C.text }}>
          {dragging ? 'Drop to load' : 'Drop a tournament log here'}
        </div>
        <div style={{ fontSize: T.sm, color: C.muted, marginTop: 4 }}>
          or click to browse · accepts <code style={{ color: C.accent }}>MasterTournamentLog</code> JSON
        </div>
      </div>

      {error && (
        <div style={{ color: C.danger, fontSize: T.sm, padding: '8px 16px', borderRadius: 8, background: 'rgba(226,75,74,0.1)', border: '1px solid rgba(226,75,74,0.2)' }}>
          {error}
        </div>
      )}

      <div style={{ color: C.muted, fontSize: T.xs, lineHeight: 1.8 }}>
        Generated by the Chaos Tournament runner<br />
        <code style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>logs/chaos/{'<preset>'}_results.json</code>
      </div>
    </div>
  )
}

// ─── CSS Animations ───────────────────────────────────────────────────────────

const CSS_ANIMATIONS = `
  @keyframes actionFloat {
    0%   { opacity: 1; transform: translateX(-50%) translateY(0); }
    70%  { opacity: 1; transform: translateX(-50%) translateY(-10px); }
    100% { opacity: 0; transform: translateX(-50%) translateY(-18px); }
  }
  @keyframes pulse-gold {
    0%, 100% { text-shadow: 0 0 20px rgba(255,215,0,0.6), 0 0 40px rgba(255,215,0,0.3), 0 2px 4px rgba(0,0,0,0.8); }
    50%       { text-shadow: 0 0 30px rgba(255,215,0,0.9), 0 0 60px rgba(255,215,0,0.5), 0 2px 4px rgba(0,0,0,0.8); }
  }
  @keyframes heroGlow {
    0%, 100% { box-shadow: 0 0 0 3px #ffd700, 0 0 20px #ffd700, 0 0 40px rgba(0,245,255,0.3); }
    50%       { box-shadow: 0 0 0 3px #ffd700, 0 0 32px #ffd700, 0 0 60px rgba(0,245,255,0.5); }
  }
`
