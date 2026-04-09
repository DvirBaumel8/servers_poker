import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Sidebar } from '../components/Sidebar'
import { C, T, monoStyle } from '../styles/tokens'
import api from '../lib/axios'

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
  hole_cards?: Record<string, string[]>
  actions: ActionLog[]
}

interface ParticipantInfo {
  botId?: string
  botName?: string
  userName?: string
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

type HandOutcome = 'win' | 'loss' | 'fold' | 'neutral'
interface HandResult { outcome: HandOutcome; isBigPot: boolean }

const NEUTRAL_RESULT: HandResult = { outcome: 'neutral', isBigPot: false }

function getBBAmount(hand: HandLog): number {
  // Try explicit blind action first
  const bb = hand.actions.find(a => a.dec === 'bb')
  if (bb?.amt) return bb.amt
  // Infer from first preflop raise: minimum open is typically 2× BB
  const firstRaise = hand.actions.find(a => a.st === 'p' && (a.dec === 'raise' || a.dec === 'all_in') && a.amt != null)
  if (firstRaise?.amt) {
    // The first preflop call amount can indicate BB level
    const firstCall = hand.actions.find(a => a.st === 'p' && a.dec === 'call' && a.amt != null)
    if (firstCall?.amt) return firstCall.amt
  }
  // Fallback: derive from the SB blind synthesis (BB = 2×SB)
  // or use a safe default
  return 20
}

function getHandResult(heroId: string, handIdx: number, hands: HandLog[]): HandResult {
  const hand = hands[handIdx]
  const nextStacks = hands[handIdx + 1]?.initial_stacks
  if (!nextStacks) return NEUTRAL_RESULT

  const heroStart = hand.initial_stacks[heroId] ?? 0
  const heroEnd = nextStacks[heroId] ?? 0

  // Big pot = total pot exceeds 30 big blinds (use canonical pot calculation)
  const potTotal = computeHandTotalPot(hand)
  const bbAmt = getBBAmount(hand)
  const isBigPot = bbAmt > 0 && potTotal >= 30 * bbAmt

  // Detect if hero folded preflop (cheap fold = muted, post-flop loss = red)
  const heroActions = hand.actions.filter(a => a.p_id === heroId)
  const lastHeroAction = heroActions.length > 0 ? heroActions[heroActions.length - 1] : null
  const heroFoldedPreflop = lastHeroAction?.dec === 'fold' && lastHeroAction.st === 'p'

  if (heroEnd > heroStart) return { outcome: 'win', isBigPot }
  if (heroEnd < heroStart) return { outcome: heroFoldedPreflop ? 'fold' : 'loss', isBigPot }
  return { outcome: 'neutral', isBigPot }
}

function getChipDelta(heroId: string, handIdx: number, hands: HandLog[]): number | null {
  const hand = hands[handIdx]
  const thisStacks = hand.initial_stacks
  const nextStacks = hands[handIdx + 1]?.initial_stacks

  // If next hand exists and hero is in both, use stack difference (most accurate)
  if (nextStacks && heroId in thisStacks && heroId in nextStacks) {
    return (nextStacks[heroId] ?? 0) - (thisStacks[heroId] ?? 0)
  }

  // Fallback: compute from pot for last hand or when hero leaves next hand
  // (eliminated after winning, tournament ends, etc.)
  if (heroId in thisStacks) {
    const winners = getHandWinners(hand, handIdx, hands)
    if (winners.includes(heroId)) {
      // Hero won — estimate profit as total pot minus hero's contribution
      const totalPot = computeHandTotalPot(hand)
      const heroBet = computePlayerBet(hand, heroId)
      return totalPot - heroBet
    }
    // Hero lost — lost whatever they bet
    const heroBet = computePlayerBet(hand, heroId)
    return heroBet > 0 ? -heroBet : null
  }

  return null
}

/** Compute how much a specific player bet in a hand (for delta fallback). */
function computePlayerBet(hand: HandLog, playerId: string): number {
  const blinds = synthesizeBlinds(hand)
  let total = 0

  // Blind contribution
  for (const b of blinds) {
    if (b.p_id === playerId) total += b.amt
  }

  // Strip explicit blind actions
  let blindCount = 0
  for (let i = 0; i < hand.actions.length; i++) {
    const a = hand.actions[i]
    if (a.st === 'p' && (a.dec === 'sb' || a.dec === 'bb' || a.dec === 'post')) {
      blindCount++
    } else break
  }

  const streetBets: Record<string, number> = { p: 0, f: 0, t: 0, r: 0 }
  const highBetPerStreet: Record<string, number> = { p: 0, f: 0, t: 0, r: 0 }

  // Seed preflop high from blinds
  for (const b of blinds) {
    const key = 'p'
    const streetTotal = (streetBets[key] ?? 0) + b.amt
    highBetPerStreet[key] = Math.max(highBetPerStreet[key], streetTotal)
  }

  // Track all player bets per street for high-bet calculation
  const allStreetBets: Record<string, Record<string, number>> = { p: {}, f: {}, t: {}, r: {} }
  for (const b of blinds) {
    allStreetBets.p[b.p_id] = (allStreetBets.p[b.p_id] ?? 0) + b.amt
  }

  for (let i = blindCount; i < hand.actions.length; i++) {
    const act = hand.actions[i]
    if (act.dec === 'fold') continue

    const st = act.st as string
    const playerStreetBet = allStreetBets[st]?.[act.p_id] ?? 0
    let addedChips = 0

    if (act.dec === 'call') {
      addedChips = Math.max(0, (highBetPerStreet[st] ?? 0) - playerStreetBet)
      const remaining = (hand.initial_stacks[act.p_id] ?? 0) - total
      if (act.p_id === playerId) addedChips = Math.min(addedChips, remaining)
    } else if (act.dec === 'check') {
      addedChips = 0
    } else if (act.amt != null && act.amt > 0) {
      addedChips = Math.max(0, act.amt - playerStreetBet)
    }

    if (addedChips > 0) {
      if (!allStreetBets[st]) allStreetBets[st] = {}
      allStreetBets[st][act.p_id] = (allStreetBets[st][act.p_id] ?? 0) + addedChips
      highBetPerStreet[st] = Math.max(highBetPerStreet[st] ?? 0, allStreetBets[st][act.p_id])
      if (act.p_id === playerId) total += addedChips
    }
  }

  return total
}

function formatDelta(delta: number): string {
  const sign = delta >= 0 ? '+' : ''
  if (Math.abs(delta) >= 1000) return `${sign}${(delta / 1000).toFixed(1)}k`
  return `${sign}${delta}`
}

/**
 * Compute the true total pot for a hand, including synthesized blinds and
 * inferred call amounts (calls in the log often have amt=undefined).
 * This is the single source of truth used by both hand_summary and isBigPot.
 */
function computeHandTotalPot(hand: HandLog): number {
  const blinds = synthesizeBlinds(hand)
  const blindTotal = blinds.reduce((s, b) => s + b.amt, 0)

  // Strip explicit blind actions at the start (same logic as buildTimeline)
  let blindCount = 0
  for (let i = 0; i < hand.actions.length; i++) {
    const a = hand.actions[i]
    if (a.st === 'p' && (a.dec === 'sb' || a.dec === 'bb' || a.dec === 'post')) {
      blindCount++
    } else break
  }

  const betPerPlayer: Record<string, number> = {}
  const streetBets: Record<string, Record<string, number>> = { p: {}, f: {}, t: {}, r: {} }
  const highBetPerStreet: Record<string, number> = { p: 0, f: 0, t: 0, r: 0 }

  // Seed with blinds
  for (const b of blinds) {
    betPerPlayer[b.p_id] = (betPerPlayer[b.p_id] ?? 0) + b.amt
    streetBets.p[b.p_id] = (streetBets.p[b.p_id] ?? 0) + b.amt
    highBetPerStreet.p = Math.max(highBetPerStreet.p, streetBets.p[b.p_id])
  }

  for (let i = blindCount; i < hand.actions.length; i++) {
    const act = hand.actions[i]
    if (act.dec === 'fold') continue

    const st = act.st as string
    const playerStreetBet = streetBets[st]?.[act.p_id] ?? 0
    let addedChips = 0

    if (act.dec === 'call') {
      addedChips = Math.max(0, (highBetPerStreet[st] ?? 0) - playerStreetBet)
      const remaining = (hand.initial_stacks[act.p_id] ?? 0) - (betPerPlayer[act.p_id] ?? 0)
      addedChips = Math.min(addedChips, remaining)
    } else if (act.dec === 'check') {
      addedChips = 0
    } else if (act.amt != null && act.amt > 0) {
      addedChips = Math.max(0, act.amt - playerStreetBet)
    }

    if (addedChips > 0) {
      betPerPlayer[act.p_id] = (betPerPlayer[act.p_id] ?? 0) + addedChips
      if (!streetBets[st]) streetBets[st] = {}
      streetBets[st][act.p_id] = (streetBets[st][act.p_id] ?? 0) + addedChips
      highBetPerStreet[st] = Math.max(highBetPerStreet[st] ?? 0, streetBets[st][act.p_id])
    }
  }

  return Object.values(betPerPlayer).reduce((a, b) => a + b, 0)
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

/**
 * Build a reliable player-id → position map from the action log.
 * Each action carries its `position` string (BTN, SB, BB, UTG …) straight
 * from the game engine, so this is the source of truth — not key order in
 * `initial_stacks` which can be scrambled by JSON serialisation.
 */
function buildPositionMapFromActions(hand: HandLog): Record<string, string> {
  const map: Record<string, string> = {}
  for (const a of hand.actions) {
    if (!map[a.p_id]) map[a.p_id] = a.position
  }
  return map
}

/**
 * Derive SB and BB from the action-level position tags.
 * Falls back to dealer-relative arithmetic only when no action carries
 * an SB / BB / BTN/SB position string (shouldn't happen in practice).
 */
function synthesizeBlinds(hand: HandLog): Array<{ p_id: string; amt: number; label: string }> {
  const playerIds = Object.keys(hand.initial_stacks)
  const n = playerIds.length
  if (n < 2) return []

  const bbAmt = getBBAmount(hand)
  const sbAmt = Math.floor(bbAmt / 2)

  // Primary: use the position tags from the actions themselves
  const posMap = buildPositionMapFromActions(hand)

  let sbPlayerId: string | null = null
  let bbPlayerId: string | null = null

  for (const [pid, pos] of Object.entries(posMap)) {
    const upper = pos.toUpperCase()
    if (upper === 'SB') sbPlayerId = pid
    else if (upper === 'BB') bbPlayerId = pid
    else if (upper === 'BTN/SB') sbPlayerId = pid  // heads-up
  }

  // If actions didn't include SB or BB (e.g. they folded before logging or
  // all players went all-in pre-action), fall back to players who are NOT in
  // posMap, or to dealer-relative arithmetic.
  if (!sbPlayerId || !bbPlayerId) {
    // Fallback: try to use dealer_bot_id
    if (!hand.dealer_bot_id) return []
    const dealerIdx = playerIds.indexOf(hand.dealer_bot_id)
    if (dealerIdx === -1) return []

    if (n === 2) {
      if (!sbPlayerId) sbPlayerId = playerIds[dealerIdx]
      if (!bbPlayerId) bbPlayerId = playerIds[(dealerIdx + 1) % n]
    } else {
      if (!sbPlayerId) sbPlayerId = playerIds[(dealerIdx + 1) % n]
      if (!bbPlayerId) bbPlayerId = playerIds[(dealerIdx + 2) % n]
    }
  }

  if (!sbPlayerId || !bbPlayerId) return []

  const sbChips = hand.initial_stacks[sbPlayerId] ?? 0
  const bbChips = hand.initial_stacks[bbPlayerId] ?? 0

  return [
    { p_id: sbPlayerId, amt: Math.min(sbAmt, sbChips), label: 'SB' },
    { p_id: bbPlayerId, amt: Math.min(bbAmt, bbChips), label: 'BB' },
  ]
}

function buildTimeline(hand: HandLog, handIdx: number, hands: HandLog[]): TimelineEntry[] {
  // Synthesize blinds from dealer position (not in actions array)
  const blinds = synthesizeBlinds(hand)

  // Also absorb any explicit blind actions at the start (in case a log format includes them)
  let blindCount = 0
  for (let i = 0; i < hand.actions.length; i++) {
    const a = hand.actions[i]
    if (a.st === 'p' && (a.dec === 'sb' || a.dec === 'bb' || a.dec === 'post')) {
      blindCount++
    } else break
  }

  const entries: TimelineEntry[] = [{
    type: 'deal',
    blinds: blinds.length > 0 ? blinds : undefined,
  }]

  let prevStreet = 'p'
  for (let i = blindCount; i < hand.actions.length; i++) {
    const action = hand.actions[i]
    if (action.st !== prevStreet) {
      const cards =
        action.st === 'f' ? hand.board.slice(0, 3)
        : action.st === 't' ? hand.board.slice(0, 4)
        : hand.board
      entries.push({ type: 'board_reveal', street: action.st as 'f' | 't' | 'r', cards })
      prevStreet = action.st
    }
    entries.push({ type: 'action', actionIdx: i, action })
  }

  // Use the canonical pot calculation (infers call amounts, includes blinds)
  const totalPot = computeHandTotalPot(hand)
  const winnerIds = getHandWinners(hand, handIdx, hands)
  entries.push({ type: 'hand_summary', winnerIds, potAmount: totalPot })

  return entries
}

function getActionLabel(action: ActionLog): string {
  const dec = action.dec.toUpperCase()
  if (action.amt != null && action.amt > 0) return `${dec} ${action.amt.toLocaleString()}`
  return dec
}

function getHandWinners(hand: HandLog, handIdx: number, hands: HandLog[]): string[] {
  const nextHand = hands[handIdx + 1]
  if (nextHand) {
    return Object.keys(hand.initial_stacks).filter(
      id => (nextHand.initial_stacks[id] ?? 0) > (hand.initial_stacks[id] ?? 0)
    )
  }
  // Last hand: return sole non-folded player (or first if multiple remain)
  const foldedIds = new Set(hand.actions.filter(a => a.dec === 'fold').map(a => a.p_id))
  const remaining = Object.keys(hand.initial_stacks).filter(id => !foldedIds.has(id))
  return remaining.length > 0 ? [remaining[0]] : []
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
    '♥': { symbol: '♥', color: '#e53935' },
    '♦': { symbol: '♦', color: '#e53935' },
    '♣': { symbol: '♣', color: '#1b5e20' },
    '♠': { symbol: '♠', color: '#1a237e' },
  }
  const s = suitMap[suitChar] ?? { symbol: '?', color: '#888' }
  return { rank, suit: suitChar, suitSymbol: s.symbol, color: s.color }
}

function getStepDelay(entry: TimelineEntry | null, heroId: string, speed: number): number {
  let baseMs: number
  if (!entry || entry.type === 'deal') {
    baseMs = 800
  } else if (entry.type === 'board_reveal') {
    baseMs = 2400
  } else if (entry.type === 'hand_summary') {
    baseMs = 5000
  } else {
    baseMs = entry.action.p_id === heroId ? 4000 : 1600
  }
  return Math.round(baseMs / speed)
}

// Position labels by table size (from dealer position clockwise)
const POSITION_NAMES: Record<number, string[]> = {
  2: ['BTN/SB', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO'],
}

// Position badge colors
const POSITION_COLORS: Record<string, string> = {
  'BTN': '#b8860b',      // dark gold
  'BTN/SB': '#1565c0',   // blue (2-player)
  'SB': '#1565c0',       // blue
  'BB': '#b71c1c',       // red
  'UTG': '#444',
  'UTG+1': '#444',
  'MP': '#444',
  'MP+1': '#444',
  'HJ': '#444',
  'CO': '#555',
}

type TimelineEntry =
  | { type: 'action'; actionIdx: number; action: ActionLog }
  | { type: 'board_reveal'; street: 'f' | 't' | 'r'; cards: string[] }
  | { type: 'deal'; blinds?: Array<{ p_id: string; amt: number; label: string }> }
  | { type: 'hand_summary'; winnerIds: string[]; potAmount: number }

// 8 fixed seat positions (percentage of table container)
// top >= 18% so action-bubble + circle don't overflow the container top
const SEAT_POSITIONS = [
  { left: '18%', top: '22%' },  // 0 top-left
  { left: '38%', top: '14%' },  // 1 top-center-left
  { left: '62%', top: '14%' },  // 2 top-center-right
  { left: '82%', top: '22%' },  // 3 top-right
  { left: '91%', top: '55%' },  // 4 right
  { left: '80%', top: '82%' },  // 5 bottom-right
  { left: '20%', top: '82%' },  // 6 bottom-left
  { left: '9%',  top: '55%' },  // 7 left
]

// Convert seat index to pixel coordinates given container dimensions
function getSeatPixelPos(seatIdx: number, dims: { w: number; h: number }) {
  const pos = SEAT_POSITIONS[seatIdx] ?? SEAT_POSITIONS[0]
  return {
    x: (parseFloat(pos.left) / 100) * dims.w,
    y: (parseFloat(pos.top) / 100) * dims.h,
  }
}

// Clamp winner toast within container bounds
function clampToastPosition(
  seatLeft: string, seatTop: string,
): { top: string; left: string; transformOrigin: string } {
  const leftPct = parseFloat(seatLeft)
  const topPct = parseFloat(seatTop)

  // Prefer above the seat (~14% above)
  let finalTop = topPct - 14
  let origin = 'bottom center'

  // If above would clip top edge, place below
  if (finalTop < 4) {
    finalTop = topPct + 14
    origin = 'top center'
  }

  // Clamp horizontal: keep within 5%-95%
  let finalLeft = leftPct
  if (finalLeft < 12) finalLeft = 12
  if (finalLeft > 88) finalLeft = 88

  return { top: `${finalTop}%`, left: `${finalLeft}%`, transformOrigin: origin }
}

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

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false)
  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', maxWidth: '100%' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(10,10,18,0.96)', border: '1px solid rgba(0,245,255,0.25)',
          borderRadius: 6, padding: '5px 10px',
          color: C.text, fontSize: T.xs, fontWeight: 500, whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          pointerEvents: 'none', zIndex: 999,
        }}>
          {text}
        </div>
      )}
    </div>
  )
}

// ─── usePlayback Hook ─────────────────────────────────────────────────────────

function usePlayback(log: MasterTournamentLog | null, heroId: string | null) {
  const [currentHandIdx, setCurrentHandIdx] = useState(0)
  const [currentActionIdx, setCurrentActionIdx] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState<0.5 | 1 | 1.25 | 1.5 | 2>(1)
  const [bubbleFor, setBubbleFor] = useState<string | null>(null)
  const [brainFeedMessage, setBrainFeedMessage] = useState<string | null>(null)
  const [mergingBets, setMergingBets] = useState<Record<string, number>>({})
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mergingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref to capture current betsThisStreet for use inside stepForward callback
  const betsSnapshotRef = useRef<Record<string, number>>({})

  const currentHand = log?.hands[currentHandIdx] ?? null

  const currentTimeline = useMemo<TimelineEntry[]>(() => {
    if (!currentHand) return []
    return buildTimeline(currentHand, currentHandIdx, log?.hands ?? [])
  }, [currentHand, currentHandIdx, log])

  const currentEntry = currentActionIdx >= 0
    ? currentTimeline[currentActionIdx] ?? null
    : currentTimeline.length > 0 ? currentTimeline[0] : null  // default to deal step
  const isRevealStep = currentEntry?.type === 'board_reveal'
  const isHeroTurn = currentEntry?.type === 'action' && heroId != null && currentEntry.action.p_id === heroId

  // Brain Feed: compute message when it's hero's turn
  useEffect(() => {
    if (!isHeroTurn || currentEntry?.type !== 'action') {
      setBrainFeedMessage(null)
      return
    }
    const { metrics, dec, p_id } = currentEntry.action
    const eqPct = metrics.eq != null && metrics.eq > 0
      ? `Equity: ${(metrics.eq * 100).toFixed(0)}%`
      : null
    const sourceLabel = metrics.source ? `Source: ${metrics.source}` : null

    // Detect if hero is facing an all-in by checking prior actions in the timeline
    const facingAllIn = currentTimeline
      .slice(0, currentActionIdx)
      .some(e => e.type === 'action' && e.action.dec === 'all_in' && e.action.p_id !== p_id)

    const decPhrases: Record<string, string> = {
      fold: 'Chose to surrender',
      call: facingAllIn ? 'Evaluating All-in: Pot Odds vs Equity' : 'Calling to see more',
      raise: 'Aggressing the pot', check: 'Checking to control', all_in: 'Going all-in',
    }
    const decPhrase = decPhrases[dec] ?? dec
    setBrainFeedMessage([eqPct, sourceLabel, decPhrase].filter(Boolean).join(' · '))
  }, [currentEntry, isHeroTurn, currentTimeline, currentActionIdx])

  const stepForward = useCallback(() => {
    if (!log || !currentHand) return
    const maxIdx = currentTimeline.length - 1
    if (currentActionIdx < maxIdx) {
      const nextIdx = currentActionIdx + 1
      const nextEntry = currentTimeline[nextIdx]

      // Snapshot current bets before they clear on board_reveal / hand_summary
      if (nextEntry?.type === 'board_reveal' || nextEntry?.type === 'hand_summary') {
        const snap = betsSnapshotRef.current
        if (Object.keys(snap).length > 0) {
          setMergingBets({ ...snap })
          if (mergingTimerRef.current) clearTimeout(mergingTimerRef.current)
          mergingTimerRef.current = setTimeout(() => setMergingBets({}), 600)
        }
      } else {
        // Clear any lingering merge animation on normal action steps
        setMergingBets({})
      }

      setCurrentActionIdx(nextIdx)
      if (nextEntry?.type === 'action') {
        setBubbleFor(nextEntry.action.p_id)
        if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
        bubbleTimerRef.current = setTimeout(() => setBubbleFor(null), 1500)
      } else {
        setBubbleFor(null)
        if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
      }
    } else if (currentHandIdx < log.hands.length - 1) {
      setCurrentHandIdx(h => h + 1)
      setCurrentActionIdx(-1)
      setBubbleFor(null)
      setBrainFeedMessage(null)
      setMergingBets({})
    } else {
      setIsPlaying(false)
    }
  }, [log, currentHand, currentTimeline, currentActionIdx, currentHandIdx])

  const stepBack = useCallback(() => {
    setIsPlaying(false)
    if (currentActionIdx > 0) {
      setCurrentActionIdx(i => i - 1)
    } else if (currentHandIdx > 0) {
      const prevHand = log?.hands[currentHandIdx - 1]
      setCurrentHandIdx(h => h - 1)
      setCurrentActionIdx(prevHand ? buildTimeline(prevHand, currentHandIdx - 1, log?.hands ?? []).length - 1 : -1)
    }
  }, [currentActionIdx, currentHandIdx, log])

  const goToHand = useCallback((idx: number) => {
    setCurrentHandIdx(idx)
    setCurrentActionIdx(-1)
    setIsPlaying(false)
    setBrainFeedMessage(null)
  }, [])

  const restart = useCallback(() => {
    setCurrentHandIdx(0)
    setCurrentActionIdx(-1)
    setIsPlaying(true)
    setBrainFeedMessage(null)
  }, [])

  // Auto-play with dynamic delay
  useEffect(() => {
    if (!isPlaying || !heroId) return
    const delay = getStepDelay(currentEntry, heroId, speed)
    const timer = setTimeout(stepForward, delay)
    return () => clearTimeout(timer)
  }, [isPlaying, speed, stepForward, currentEntry, heroId])

  // Cleanup on unmount
  useEffect(() => () => {
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
    if (mergingTimerRef.current) clearTimeout(mergingTimerRef.current)
  }, [])

  return {
    currentHandIdx, currentActionIdx, isPlaying, speed,
    currentTimeline, currentEntry, isRevealStep, isHeroTurn,
    bubbleFor, brainFeedMessage, mergingBets, betsSnapshotRef,
    setSpeed, setIsPlaying, stepForward, stepBack, goToHand, restart,
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TournamentTheaterPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const stateLog = (location.state as { log?: MasterTournamentLog } | null)?.log ?? null

  // ── Log state — seeded from navigation state or file upload ──
  const [log, setLog] = useState<MasterTournamentLog | null>(stateLog)

  // ── Hero selection ──
  const [heroId, setHeroId] = useState<string | null>(searchParams.get('h'))

  // ── Tournament display name ──
  const [tournamentName, setTournamentName] = useState<string>(decodeURIComponent(searchParams.get('n') ?? ''))

  // ── Name map from DB (resolves old logs that lack botName/userName in participants) ──
  const [nameMap, setNameMap] = useState<Record<string, { botName: string; userName: string; finishPosition: number | null }>>({})

  // ── Summary overlay (delayed trigger on replay completion) ──
  const [showSummaryOverlay, setShowSummaryOverlay] = useState(false)

  // ── Filter log to only hands where the hero bot was at the table ──
  const filteredLog = useMemo<MasterTournamentLog | null>(() => {
    if (!log || !heroId) return log
    const heroHands = log.hands.filter(h =>
      Object.prototype.hasOwnProperty.call(h.initial_stacks, heroId)
    )
    if (heroHands.length === 0) {
      // Hero not found in any hand — likely a participant ID vs bot ID mismatch.
      // Fall back to unfiltered log so the UI doesn't break.
      console.warn(`[Theater] heroId "${heroId}" not found in any hand's initial_stacks. Showing all hands.`)
      return log
    }
    if (heroHands.length === log.hands.length) return log
    return { ...log, hands: heroHands }
  }, [log, heroId])

  // ── Playback hook ──
  const {
    currentHandIdx, currentActionIdx, isPlaying, speed,
    currentTimeline, currentEntry, isRevealStep, isHeroTurn,
    bubbleFor, brainFeedMessage, mergingBets, betsSnapshotRef,
    setSpeed, setIsPlaying, stepForward, stepBack, goToHand, restart,
  } = usePlayback(filteredLog, heroId)

  // ── Auto-load from URL params on mount (supports refresh) ──
  useEffect(() => {
    const tId = searchParams.get('t')
    const hId = searchParams.get('h')
    if (tId && hId && !log) {
      api.get<{ log_data: MasterTournamentLog; nameMap: Record<string, { botName: string; userName: string }> }>(
        `/tournaments/${tId}/log`
      ).then(res => {
        const { log_data, nameMap: nm } = res.data
        if (log_data?.hands) {
          setLog(log_data)
          setHeroId(hId)
          setNameMap(nm ? Object.fromEntries(Object.entries(nm).map(([k, v]) => [k, { ...v, finishPosition: null }])) : {})
        }
      }).catch(() => {
        setSearchParams({})
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Carousel ref ──
  const carouselRef = useRef<HTMLDivElement>(null)

  // ── Derive bot list from log ──
  const bots = useMemo<Array<{ id: string; name: string; userName: string; elo: number; tier: string }>>(() => {
    if (!log) return []
    const ids = Object.keys(log.hands[0]?.initial_stacks ?? {})
    const parts = log.tournament_summary.participants

    // Build a lookup by botId if the new schema fields are present
    const byBotId = new Map<string, typeof parts[0]>()
    for (const p of parts) {
      if (p.botId) byBotId.set(p.botId, p)
    }

    return ids.map((id, i) => {
      const p = byBotId.get(id) ?? parts[i]
      const nm = nameMap[id]
      return {
        id,
        name: p?.botName ?? nm?.botName ?? p?.dna?.name ?? id.slice(0, 8),
        userName: p?.userName ?? nm?.userName ?? p?.dna?.name ?? id.slice(0, 8),
        elo: p?.elo ?? 0,
        tier: p?.dna?.tier ?? '?',
      }
    })
  }, [log, nameMap])

  const botNameMap = useMemo(() => {
    const m: Record<string, string> = {}
    bots.forEach(b => { m[b.id] = b.name })
    return m
  }, [bots])

  const userNameMap = useMemo(() => {
    const m: Record<string, string> = {}
    bots.forEach(b => { m[b.id] = b.userName })
    return m
  }, [bots])

  // ── Winner (bot with finishPosition=1 from nameMap) ──
  const winnerId = useMemo(() => {
    const entry = Object.entries(nameMap).find(([, v]) => v.finishPosition === 1)
    return entry?.[0] ?? null
  }, [nameMap])

  // ── Current hand (derived from currentHandIdx) ──
  const currentHand = log?.hands[currentHandIdx] ?? null

  // ── Derived replay state ──
  //
  // Calculates pot, stacks, bets, folds, and community cards from the
  // timeline position.  Key insight: the tournament log records `amt` only
  // for raise/all_in.  For call actions `amt` is absent, so we infer the
  // call amount from the current bet level (highBet − player's existing
  // contribution this street).  Blind amounts are synthesized (see
  // `synthesizeBlinds`) because the logger doesn't record blind posts.
  const { communityCards, foldedPlayers, lastActionPerPlayer, potSize, activePlayerStacks, betsThisStreet } =
    useMemo(() => {
      if (!currentHand) return {
        communityCards: [], foldedPlayers: new Set<string>(),
        lastActionPerPlayer: {} as Record<string, ActionLog>,
        potSize: 0, activePlayerStacks: {} as Record<string, number>,
        betsThisStreet: {} as Record<string, number>,
      }

      // Only count real actions (not BOARD_REVEAL beats) for game state
      const visibleActions = currentActionIdx >= 0
        ? currentTimeline
            .slice(0, currentActionIdx + 1)
            .filter((e): e is Extract<TimelineEntry, { type: 'action' }> => e.type === 'action')
            .map(e => e.action)
        : []

      const folded = new Set<string>()
      const lastAct: Record<string, ActionLog> = {}

      // --- Per-street bet tracking to infer call amounts ---
      // betPerPlayerPerStreet[street][p_id] = total chips committed on that street
      const betPerPlayer: Record<string, number> = {}        // total this hand
      const streetBets: Record<string, Record<string, number>> = { p: {}, f: {}, t: {}, r: {} }
      let highBetPerStreet: Record<string, number> = { p: 0, f: 0, t: 0, r: 0 }

      // Seed preflop bets with blind amounts
      const dealEntry = currentTimeline[0]
      if (dealEntry?.type === 'deal' && dealEntry.blinds && currentActionIdx >= 0) {
        for (const b of dealEntry.blinds) {
          betPerPlayer[b.p_id] = (betPerPlayer[b.p_id] ?? 0) + b.amt
          streetBets.p[b.p_id] = (streetBets.p[b.p_id] ?? 0) + b.amt
          highBetPerStreet.p = Math.max(highBetPerStreet.p, streetBets.p[b.p_id])
        }
      }

      for (const act of visibleActions) {
        lastAct[act.p_id] = act
        if (act.dec === 'fold') { folded.add(act.p_id); continue }

        const st = act.st as string
        const playerStreetBet = streetBets[st]?.[act.p_id] ?? 0
        let addedChips = 0

        if (act.dec === 'call') {
          // Call = match the current high bet on this street
          addedChips = Math.max(0, (highBetPerStreet[st] ?? 0) - playerStreetBet)
          // Cap at player's remaining stack
          const remaining = (currentHand.initial_stacks[act.p_id] ?? 0) - (betPerPlayer[act.p_id] ?? 0)
          addedChips = Math.min(addedChips, remaining)
        } else if (act.dec === 'check') {
          addedChips = 0
        } else if (act.amt != null && act.amt > 0) {
          // raise / all_in — amt is the TOTAL bet on this street, not the increment
          addedChips = Math.max(0, act.amt - playerStreetBet)
        }

        if (addedChips > 0) {
          betPerPlayer[act.p_id] = (betPerPlayer[act.p_id] ?? 0) + addedChips
          if (!streetBets[st]) streetBets[st] = {}
          streetBets[st][act.p_id] = (streetBets[st][act.p_id] ?? 0) + addedChips
          highBetPerStreet[st] = Math.max(highBetPerStreet[st] ?? 0, streetBets[st][act.p_id])
        }
      }

      const stacks: Record<string, number> = { ...currentHand.initial_stacks }
      for (const [id, bet] of Object.entries(betPerPlayer)) {
        stacks[id] = Math.max(0, (stacks[id] ?? 0) - bet)
      }

      const pot = Object.values(betPerPlayer).reduce((a, b) => a + b, 0)

      // Board: board_reveal entries show the new cards; action entries use street-based lookup
      const communityCards =
        currentEntry?.type === 'board_reveal'
          ? currentEntry.cards
          : currentEntry?.type === 'action'
            ? communityCardsForState(currentHand, currentEntry.actionIdx)
            : currentEntry?.type === 'hand_summary'
              ? currentHand.board
              : []

      // Bets this street only (for chip animation — clears on board_reveal/hand_summary)
      const currentStreet = visibleActions.length > 0 ? visibleActions[visibleActions.length - 1].st : null
      const betsThisStreet: Record<string, number> = {}
      // Show blind chips on the deal step
      if (currentEntry?.type === 'deal' && currentEntry.blinds) {
        for (const b of currentEntry.blinds) {
          if (b.amt > 0) betsThisStreet[b.p_id] = b.amt
        }
      } else if (currentEntry?.type !== 'board_reveal' && currentEntry?.type !== 'hand_summary') {
        const streetForChips = currentStreet ?? 'p'
        const streetData = streetBets[streetForChips]
        if (streetData) {
          for (const [pid, amt] of Object.entries(streetData)) {
            if (amt > 0) betsThisStreet[pid] = amt
          }
        }
      }

      return {
        communityCards,
        foldedPlayers: folded,
        lastActionPerPlayer: lastAct,
        potSize: pot,
        activePlayerStacks: stacks,
        betsThisStreet,
      }
    }, [currentHand, currentActionIdx, currentTimeline, currentEntry])

  // Keep betsSnapshotRef in sync so stepForward can read it
  betsSnapshotRef.current = betsThisStreet

  // ── Scroll carousel to current hand ──
  useEffect(() => {
    const el = carouselRef.current?.children[currentHandIdx] as HTMLElement | undefined
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [currentHandIdx])

  // ── Keyboard arrow navigation between hands ──
  useEffect(() => {
    if (!log) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        goToHand(Math.min(filteredLog!.hands.length - 1, currentHandIdx + 1))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goToHand(Math.max(0, currentHandIdx - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [log, currentHandIdx, goToHand])

  // ─── Replay completion overlay (must be above early returns — Rules of Hooks) ──
  const isComplete = !!(filteredLog) &&
    currentHandIdx >= filteredLog.hands.length - 1 &&
    currentActionIdx >= currentTimeline.length - 1

  useEffect(() => {
    if (!isComplete) { setShowSummaryOverlay(false); return }
    const timer = setTimeout(() => setShowSummaryOverlay(true), 2000)
    return () => clearTimeout(timer)
  }, [isComplete])

  // ─── No log loaded — show tournament selector ────────────────────────────
  if (!log) {
    return (
      <>
        <style>{CSS_ANIMATIONS}</style>
        <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, color: C.text, fontFamily: C.font }}>
          <Sidebar />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TournamentSelector onLoad={(parsed, heroId, nm, tId, tName) => {
              setLog(parsed)
              setHeroId(heroId)
              setNameMap(nm ? Object.fromEntries(Object.entries(nm).map(([k, v]) => [k, { ...v, finishPosition: null }])) : {})
              setTournamentName(tName)
              setSearchParams({ t: tId, h: heroId, n: encodeURIComponent(tName) })
            }} />
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
            <div style={{ fontSize: T.h1, fontWeight: 800, letterSpacing: 0.5 }}>
              Tournament Analytics
            </div>
            <div style={{ color: C.muted, fontSize: T.base, marginTop: 6 }}>
              Choose a bot to follow through the tournament
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
            {filteredLog!.hands.length} hands · {bots.length} bots
          </div>
        </div>
      </>
    )
  }

  // ─── Main Theater layout ──────────────────────────────────────────────────
  return (
    <>
      <style>{CSS_ANIMATIONS}</style>
      <div style={{
        display: 'flex', minHeight: '100vh',
        background: '#050508', color: C.text, fontFamily: C.font,
        overflow: 'hidden',
      }}>
        <Sidebar />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflowX: 'hidden', overflowY: 'hidden' }}>
          {/* Top bar */}
          <div style={{
            height: 48, display: 'flex', alignItems: 'center', gap: 12,
            padding: '0 20px', borderBottom: `1px solid ${C.border}`,
            background: 'rgba(9,9,11,0.9)', flexShrink: 0, backdropFilter: 'blur(8px)',
          }}>
            <button
              onClick={() => { setLog(null); setHeroId(null); setSearchParams({}); }}
              style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1 }}
            >←</button>
            <span style={{ color: C.muted, fontSize: T.sm }}>Tournament Analytics</span>
            <span style={{ color: C.border, fontSize: T.sm }}>·</span>
            <Tooltip text={tournamentName || log.tournament_summary.id}>
              <span style={{
                fontSize: T.sm, color: C.text, fontWeight: 600,
                maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                display: 'block',
              }}>
                {tournamentName || log.tournament_summary.id.slice(0, 8) + '…'}
              </span>
            </Tooltip>
            <span style={{ color: C.border, fontSize: T.sm }}>·</span>
            <span style={{ fontSize: T.sm, color: C.text }}>
              Hand <strong>#{currentHandIdx + 1}</strong>
              <span style={{ color: C.muted }}> / {filteredLog!.hands.length}</span>
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
                Bot: {botNameMap[heroId]}
              </span>
            </div>
          </div>

          {/* Table area */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 16px 4px', position: 'relative' }}>
            <PokerTable
              hand={currentHand}
              heroId={heroId}
              bots={bots}
              botNameMap={botNameMap}
              userNameMap={userNameMap}
              winnerId={winnerId}
              isComplete={isComplete}
              isHandComplete={currentEntry?.type === 'hand_summary'}
              handWinnerIds={currentEntry?.type === 'hand_summary' ? currentEntry.winnerIds : []}
              communityCards={communityCards}
              potSize={potSize}
              playerStacks={activePlayerStacks}
              foldedPlayers={foldedPlayers}
              lastActionPerPlayer={lastActionPerPlayer}
              bubbleFor={bubbleFor}
              isRevealStep={isRevealStep}
              revealStreet={currentEntry?.type === 'board_reveal' ? currentEntry.street : null}
              betsThisStreet={betsThisStreet}
              mergingBets={mergingBets}
              activePlayerId={currentEntry?.type === 'action' ? currentEntry.action.p_id : null}
              justFoldedId={currentEntry?.type === 'action' && currentEntry.action.dec === 'fold' ? currentEntry.action.p_id : null}
              expectedWinnerId={currentHand && filteredLog ? getHandWinners(currentHand, currentHandIdx, filteredLog.hands)[0] ?? null : null}
              handPotAmount={currentEntry?.type === 'hand_summary' ? currentEntry.potAmount : 0}
            />

            {/* Brain Feed overlay — shown during hero's turn */}
            <AnimatePresence>
              {brainFeedMessage && (
                <motion.div
                  key="brain-feed"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  style={{
                    position: 'absolute', right: 16, bottom: 16, zIndex: 50,
                    background: 'rgba(6,6,18,0.88)', backdropFilter: 'blur(14px)',
                    border: '1px solid rgba(0,245,255,0.35)', borderRadius: 10,
                    padding: '10px 14px', maxWidth: 260,
                    boxShadow: '0 0 24px rgba(0,245,255,0.12)',
                    pointerEvents: 'none',
                  }}
                >
                  <div style={{
                    fontSize: 9, fontWeight: 700, color: C.accent,
                    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4,
                  }}>
                    Brain Feed
                  </div>
                  <div style={{ fontSize: T.xs, color: C.text, lineHeight: 1.55, overflow: 'hidden', wordBreak: 'break-word', ...monoStyle }}>
                    {brainFeedMessage}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Tournament summary overlay */}
            <AnimatePresence>
              {showSummaryOverlay && (
                <TournamentSummaryOverlay
                  heroId={heroId}
                  winnerId={winnerId}
                  heroFinishPosition={nameMap[heroId]?.finishPosition ?? null}
                  totalParticipants={log.tournament_summary.participants.length}
                  totalHands={filteredLog!.hands.length}
                  heroBotName={botNameMap[heroId] ?? 'Unknown'}
                  onDismiss={() => setShowSummaryOverlay(false)}
                  onWatchLastHand={() => {
                    setShowSummaryOverlay(false)
                    goToHand(filteredLog!.hands.length - 1)
                  }}
                  onBackToDashboard={() => {
                    const tId = searchParams.get('t')
                    navigate(tId ? `/tournaments/${tId}/results` : '/tournaments')
                  }}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Replay controls + carousel */}
          <div style={{ flexShrink: 0, padding: '0 20px 16px' }}>
            {/* Progress bar */}
            {(() => {
              const total = currentTimeline.length
              const pct = total > 0 ? ((currentActionIdx + 1) / total) * 100 : 0
              return (
                <div style={{
                  height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 10, overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', width: `${pct}%`,
                    background: `linear-gradient(90deg, ${C.accent}, #00d4e8)`,
                    borderRadius: 2, transition: 'width 0.2s ease',
                    boxShadow: `0 0 6px ${C.accent}`,
                  }} />
                </div>
              )
            })()}

            {/* Controls row */}
            <div style={{
              position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 0,
            }}>
              {/* Center group: nav buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Prev hand */}
                <ControlButton
                  onClick={() => goToHand(Math.max(0, currentHandIdx - 1))}
                  disabled={currentHandIdx === 0}
                  title="Previous Hand"
                >⏮</ControlButton>

                {/* Step back */}
                <ControlButton
                  onClick={() => stepBack()}
                  disabled={currentHandIdx === 0 && currentActionIdx === -1}
                  title="Step Back"
                >‹</ControlButton>

                {/* Play/Pause */}
                <button
                  onClick={() => {
                    if (isComplete) {
                      restart(); setShowSummaryOverlay(false)
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
                  onClick={() => goToHand(Math.min(filteredLog!.hands.length - 1, currentHandIdx + 1))}
                  disabled={currentHandIdx >= filteredLog!.hands.length - 1}
                  title="Next Hand"
                >⏭</ControlButton>
              </div>

              {/* Right group: speed pills + action counter */}
              <div style={{ position: 'absolute', right: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Speed pills */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {([0.5, 1, 1.25, 1.5, 2] as const).map(s => (
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
                <div style={{ color: C.muted, fontSize: T.xs, ...monoStyle, marginLeft: 4 }}>
                  {currentActionIdx + 1} / {currentTimeline.length} steps
                </div>
              </div>
            </div>

            {/* Divider between controls and carousel */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '12px -20px 12px' }} />

            {/* Hand carousel — Stories style */}
            {/* Outer wrapper: explicit height so overflow:auto on scroll div doesn't clip cards */}
            <div style={{ position: 'relative', height: CARD_H + 40, marginTop: 8 }}>
              {/* Left/right edge fade */}
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
                background: 'linear-gradient(to right, #050508 0%, transparent 9%, transparent 91%, #050508 100%)',
              }} />
              <div
                ref={carouselRef}
                data-hide-scroll=""
                style={{
                  display: 'flex', gap: 10, overflowX: 'auto', overflowY: 'visible',
                  padding: '20px 52px 20px',
                  scrollbarWidth: 'none',
                  alignItems: 'center',
                  scrollSnapType: 'x mandatory',
                  scrollBehavior: 'smooth',
                  height: '100%',
                  boxSizing: 'border-box',
                }}
              >
                {filteredLog!.hands.map((hand, idx) => {
                  const result = heroId ? getHandResult(heroId, idx, filteredLog!.hands) : NEUTRAL_RESULT
                  const isActive = idx === currentHandIdx
                  return (
                    <StoryHandCard
                      key={hand.hand_id}
                      hand={hand}
                      result={result}
                      isActive={isActive}
                      onClick={() => goToHand(idx)}
                      heroId={heroId}
                      hands={filteredLog!.hands}
                      handIdx={idx}
                    />
                  )
                })}
              </div>
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

// ─── TournamentSummaryOverlay ─────────────────────────────────────────────────

interface TournamentSummaryOverlayProps {
  heroId: string
  winnerId: string | null
  heroFinishPosition: number | null
  totalParticipants: number
  totalHands: number
  heroBotName: string
  onDismiss: () => void
  onWatchLastHand: () => void
  onBackToDashboard: () => void
}

// Stable confetti config (avoids Math.random in render)
const CONFETTI_PARTICLES = Array.from({ length: 45 }, (_, i) => ({
  left: `${(i * 2.22) % 100}%`,
  size: 4 + (i % 4) * 2,
  color: ['#ffd700', '#06b6d4', '#ffffff', '#ff9800', '#e24b4a', '#1d9e75'][i % 6],
  duration: 2 + (i % 5) * 0.6,
  delay: (i % 12) * 0.12,
  isCircle: i % 3 !== 0,
  drift: (i % 7 - 3) * 8,
}))

function TournamentSummaryOverlay({
  heroId, winnerId, heroFinishPosition, totalParticipants, totalHands,
  heroBotName, onDismiss, onWatchLastHand, onBackToDashboard,
}: TournamentSummaryOverlayProps) {
  const isVictory = heroId === winnerId
  const rank = isVictory ? 1 : (heroFinishPosition ?? null)

  return (
    <motion.div
      key="summary-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: isVictory ? 'rgba(5,5,15,0.85)' : 'rgba(5,5,15,0.88)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: C.font,
      }}
      onClick={onDismiss}
    >
      {/* Victory confetti */}
      {isVictory && CONFETTI_PARTICLES.map((p, i) => (
        <div
          key={`oc-${i}`}
          style={{
            position: 'fixed', top: -12, left: p.left,
            width: p.size, height: p.size,
            borderRadius: p.isCircle ? '50%' : 2,
            background: p.color,
            opacity: 0.85,
            pointerEvents: 'none',
            transform: `translateX(${p.drift}px)`,
            animation: `overlayConfettiBurst ${p.duration}s ease-in forwards`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}

      {/* Close button */}
      <button
        onClick={onDismiss}
        style={{
          position: 'fixed', top: 20, right: 24,
          background: 'none', border: 'none', color: C.muted,
          cursor: 'pointer', fontSize: 24, lineHeight: 1,
          fontFamily: C.font, zIndex: 101,
        }}
        title="Close"
      >x</button>

      {/* Content card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' }}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 460, width: '90vw',
          background: isVictory
            ? 'radial-gradient(circle at 50% 30%, rgba(255,215,0,0.08) 0%, rgba(10,10,20,0.95) 70%)'
            : 'rgba(10,10,20,0.95)',
          border: isVictory
            ? '2px solid rgba(255,215,0,0.4)'
            : '1px solid rgba(226,75,74,0.3)',
          borderRadius: 20,
          padding: '40px 36px 32px',
          textAlign: 'center',
          boxShadow: isVictory
            ? '0 0 60px rgba(255,215,0,0.12), 0 12px 48px rgba(0,0,0,0.6)'
            : '0 12px 48px rgba(0,0,0,0.6)',
        }}
      >
        {isVictory ? (
          /* ── Victory ── */
          <>
            <div style={{ fontSize: 72, animation: 'trophyBounce 0.8s ease-out', marginBottom: 8 }}>
              🏆
            </div>
            <div style={{
              fontSize: 32, fontWeight: 900, color: C.gold,
              letterSpacing: 4, textTransform: 'uppercase',
              animation: 'goldenGlow 2s ease-in-out infinite',
              marginBottom: 6,
            }}>
              Tournament Winner
            </div>
            <div style={{ fontSize: T.lg, color: C.gold, fontWeight: 600, marginBottom: 20, opacity: 0.85 }}>
              {heroBotName}
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 24px', borderRadius: 28,
              border: '2px solid rgba(255,215,0,0.5)',
              background: 'rgba(255,215,0,0.08)',
              animation: 'winnerBadgePulse 2s infinite',
              marginBottom: 20,
            }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: C.gold, ...monoStyle }}>
                1st
              </span>
              <span style={{ fontSize: T.sm, color: C.muted }}>
                of {totalParticipants}
              </span>
            </div>
            <div style={{ fontSize: T.sm, color: C.muted, marginBottom: 28, ...monoStyle }}>
              {totalHands} hands played
            </div>
          </>
        ) : (
          /* ── Elimination ── */
          <>
            <div style={{ fontSize: 56, marginBottom: 12, opacity: 0.9 }}>
              💀
            </div>
            <div style={{
              fontSize: 28, fontWeight: 800, color: C.danger,
              letterSpacing: 3, textTransform: 'uppercase',
              marginBottom: 6,
            }}>
              Eliminated
            </div>
            <div style={{ fontSize: T.lg, color: C.muted, fontWeight: 600, marginBottom: 24, opacity: 0.85 }}>
              {heroBotName}
            </div>
            <div style={{
              display: 'flex', justifyContent: 'center', gap: 32,
              marginBottom: 28,
            }}>
              <div>
                <div style={{ fontSize: T.xs, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                  Final Rank
                </div>
                <div style={{ ...monoStyle }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: C.text }}>
                    {rank != null ? `#${rank}` : '—'}
                  </span>
                  <span style={{ fontSize: T.sm, color: C.muted }}> / {totalParticipants}</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: T.xs, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                  Duration
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: C.text, ...monoStyle }}>
                  {totalHands}
                  <span style={{ fontSize: T.sm, color: C.muted, fontWeight: 400 }}> hands</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
          <button
            onClick={onBackToDashboard}
            style={{
              padding: '10px 24px', borderRadius: 10,
              background: isVictory
                ? 'linear-gradient(135deg, #ffd700, #f59e0b)'
                : `linear-gradient(135deg, ${C.accent}, #00b8d4)`,
              color: isVictory ? '#0a0a14' : '#0a0a14',
              border: 'none', fontWeight: 700, fontSize: T.sm,
              cursor: 'pointer', fontFamily: C.font,
            }}
          >
            Back to Results
          </button>
          {!isVictory && (
            <button
              onClick={onWatchLastHand}
              style={{
                padding: '10px 24px', borderRadius: 10,
                background: 'transparent',
                color: C.danger,
                border: `1px solid ${C.danger}`,
                fontWeight: 600, fontSize: T.sm,
                cursor: 'pointer', fontFamily: C.font,
              }}
            >
              Watch Bust-out Hand
            </button>
          )}
          <button
            onClick={onDismiss}
            style={{
              padding: '10px 20px', borderRadius: 10,
              background: 'none', border: 'none',
              color: C.muted, fontWeight: 500, fontSize: T.sm,
              cursor: 'pointer', fontFamily: C.font,
              textDecoration: 'underline', textUnderlineOffset: 3,
            }}
          >
            Review Hands
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── PokerTable ───────────────────────────────────────────────────────────────

interface PokerTableProps {
  hand: HandLog | null
  heroId: string
  bots: Array<{ id: string; name: string }>
  botNameMap: Record<string, string>
  userNameMap: Record<string, string>
  winnerId: string | null
  isComplete: boolean
  isHandComplete: boolean
  handWinnerIds: string[]
  communityCards: string[]
  potSize: number
  playerStacks: Record<string, number>
  foldedPlayers: Set<string>
  lastActionPerPlayer: Record<string, ActionLog>
  bubbleFor: string | null
  isRevealStep: boolean
  revealStreet: 'f' | 't' | 'r' | null
  betsThisStreet: Record<string, number>
  mergingBets: Record<string, number>
  activePlayerId: string | null
  justFoldedId: string | null
  expectedWinnerId: string | null
  handPotAmount: number
}

// Canonical poker seat order clockwise from dealer
const SEAT_ORDER: string[] = ['BTN', 'BTN/SB', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO']

function PokerTable({
  hand, heroId, bots, botNameMap, userNameMap, winnerId, isComplete, isHandComplete, handWinnerIds,
  communityCards, potSize, playerStacks, foldedPlayers, lastActionPerPlayer, bubbleFor,
  isRevealStep, revealStreet, betsThisStreet, mergingBets, activePlayerId, justFoldedId,
  expectedWinnerId, handPotAmount,
}: PokerTableProps) {
  // Sort players into correct poker seat order using action-level position tags.
  // This ensures the table layout matches the game engine's seating, regardless
  // of how Object.keys(initial_stacks) are ordered after JSON serialisation.
  const playerIds = useMemo(() => {
    if (!hand) return bots.map(b => b.id)
    const raw = Object.keys(hand.initial_stacks)
    const posMap = buildPositionMapFromActions(hand)
    // Sort by canonical seat order; unknowns go to the end
    return [...raw].sort((a, b) => {
      const pa = SEAT_ORDER.indexOf(posMap[a]?.toUpperCase() ?? '')
      const pb = SEAT_ORDER.indexOf(posMap[b]?.toUpperCase() ?? '')
      return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb)
    })
  }, [hand, bots])

  // Pad to 8 seats (fill empties)
  const seats = Array.from({ length: 8 }, (_, i) => playerIds[i] ?? null)

  const dealerBotId = hand?.dealer_bot_id ?? null

  // Track actual pixel dimensions for animation offset calculations
  const tableRef = useRef<HTMLDivElement>(null)
  const [tableDims, setTableDims] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = tableRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setTableDims({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const dealerSeatIdx = dealerBotId ? playerIds.indexOf(dealerBotId) : -1

  // Use action-level position tags (source of truth from game engine).
  // Falls back to dealer-relative arithmetic for players who never acted.
  const positionMap: Record<string, string> = useMemo(() => {
    if (!hand) return {}
    // Primary: positions from actions
    const fromActions = buildPositionMapFromActions(hand)

    // Fill in any players who never acted (e.g. folded pre-action in rare edge cases)
    // using dealer-relative fallback
    const ids = Object.keys(hand.initial_stacks)
    const n = ids.length
    if (n < 2) return fromActions

    // Check if we already have all players covered
    const missing = ids.filter(id => !fromActions[id])
    if (missing.length === 0) return fromActions

    // Fallback: dealer-relative for missing players only
    if (!hand.dealer_bot_id) return fromActions
    const di = ids.indexOf(hand.dealer_bot_id)
    if (di === -1) return fromActions
    const names = POSITION_NAMES[Math.min(n, 9)] ?? POSITION_NAMES[9]
    const fallback = { ...fromActions }
    for (const id of missing) {
      const i = ids.indexOf(id)
      fallback[id] = names[(i - di + n) % n] ?? `Seat${(i - di + n) % n}`
    }
    return fallback
  }, [hand])

  // Delayed winner stack bonus — fires after pot-to-winner animation completes
  const [winnerStackBonus, setWinnerStackBonus] = useState<Record<string, number>>({})
  useEffect(() => {
    if (isHandComplete && handWinnerIds.length > 0 && handPotAmount > 0) {
      const share = Math.round(handPotAmount / handWinnerIds.length)
      const timer = setTimeout(() => {
        const bonus: Record<string, number> = {}
        for (const wid of handWinnerIds) bonus[wid] = share
        setWinnerStackBonus(bonus)
      }, 1100) // after pot fly animation (~0.4s delay + ~0.7s spring)
      return () => clearTimeout(timer)
    } else {
      setWinnerStackBonus({})
    }
  }, [isHandComplete, handWinnerIds, handPotAmount])

  // Track bet add-ons: when a player's bet increases on the same street, animate a chip flying in
  const prevBetsRef = useRef<Record<string, number>>({})
  const [betAddOns, setBetAddOns] = useState<Array<{ id: string; pid: string; amt: number }>>([])
  useEffect(() => {
    const prev = prevBetsRef.current
    const newAddOns: Array<{ id: string; pid: string; amt: number }> = []
    for (const [pid, amt] of Object.entries(betsThisStreet)) {
      const prevAmt = prev[pid] ?? 0
      if (prevAmt > 0 && amt > prevAmt) {
        // Player already had chips and added more
        newAddOns.push({ id: `addon-${pid}-${Date.now()}`, pid, amt: amt - prevAmt })
      }
    }
    prevBetsRef.current = { ...betsThisStreet }
    if (newAddOns.length > 0) {
      setBetAddOns(a => [...a, ...newAddOns])
      // Auto-clear after animation completes
      setTimeout(() => {
        setBetAddOns(a => a.filter(x => !newAddOns.some(n => n.id === x.id)))
      }, 500)
    }
  }, [betsThisStreet])

  return (
    <div ref={tableRef} style={{
      position: 'relative', width: '100%', maxWidth: 1100,
      aspectRatio: '800/400', margin: '0 auto', overflow: 'visible',
    }}>
      {/* ── SVG table (identical to Scenario Lab) ── */}
      <svg
        viewBox="0 0 800 400"
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          filter: 'drop-shadow(0 0 40px rgba(0,255,255,0.1))',
        }}
      >
        <defs>
          <radialGradient id="theaterFelt" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1a4d3e" />
            <stop offset="100%" stopColor="#0d261f" />
          </radialGradient>
        </defs>
        {/* Outer rail */}
        <ellipse cx="400" cy="200" rx="380" ry="180" fill="#222" stroke="#444" strokeWidth="8" />
        {/* Felt */}
        <ellipse cx="400" cy="200" rx="350" ry="150" fill="url(#theaterFelt)" stroke="#1a4d3e" strokeWidth="2" />
        {/* Inner dashed ring */}
        <ellipse cx="400" cy="200" rx="300" ry="120" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="10 5" />
      </svg>

      {/* ── Center content: pot + community cards ── */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 8, pointerEvents: 'none',
      }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={hand?.hand_id ?? 'empty'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
          >
            {potSize > 0 && (() => {
              // At hand_summary, use the canonical potAmount so center matches toast
              const displayPot = isHandComplete && handPotAmount > 0 ? handPotAmount : potSize

              // Winner pot collection animation — fires per hand, not just tournament end
              const handWinner = handWinnerIds[0] ?? null
              const winnerSeatIdx = handWinner ? playerIds.indexOf(handWinner) : -1
              let potAnimProps: Record<string, unknown> = { opacity: 1, x: 0, y: 0, scale: 1 }
              if (isHandComplete && winnerSeatIdx >= 0 && tableDims.w > 0) {
                const wp = getSeatPixelPos(winnerSeatIdx, tableDims)
                potAnimProps = {
                  opacity: 0.3,
                  x: (wp.x - tableDims.w * 0.5) * 0.6,
                  y: (wp.y - tableDims.h * 0.5) * 0.6,
                  scale: 0.4,
                }
              }
              const chipCount = Math.min(Math.ceil(displayPot / 200), 5)
              return (
                <motion.div
                  animate={potAnimProps}
                  transition={{ delay: 0.4, type: 'spring', stiffness: 80, damping: 14 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {/* Stacked chip visual */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {Array.from({ length: chipCount }, (_, i) => (
                      <div key={i} style={{
                        width: 14, height: 14, borderRadius: '50%',
                        background: i < 2 ? '#00bcd4' : i < 4 ? '#e53935' : '#212121',
                        border: '1.5px solid rgba(255,255,255,0.3)',
                        marginTop: i > 0 ? -8 : 0,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                      }} />
                    ))}
                  </div>
                  <div style={{
                    fontSize: 12, color: '#ffd700', fontWeight: 700, letterSpacing: 1.5,
                    textShadow: '0 0 16px rgba(255,215,0,0.7),0 0 32px rgba(255,215,0,0.3)',
                  }}>
                    POT: {displayPot.toLocaleString()}
                  </div>
                </motion.div>
              )
            })()}
            <div style={{
              display: 'flex', gap: 6,
              borderRadius: 8,
              boxShadow: isRevealStep
                ? '0 0 20px rgba(0,245,255,0.5), 0 0 40px rgba(0,245,255,0.2)'
                : undefined,
              transition: 'box-shadow 0.4s ease',
            }}>
              {Array.from({ length: 5 }, (_, i) => {
                const card = communityCards[i]
                if (!card) return <EmptyCardSlot key={i} />
                // Determine if this card is newly revealed this step
                const isNewlyRevealed = revealStreet != null && (
                  (revealStreet === 'f' && i < 3) ||
                  (revealStreet === 't' && i === 3) ||
                  (revealStreet === 'r' && i === 4)
                )
                return (
                  <motion.div
                    key={`${hand?.hand_id ?? 'e'}_cc_${i}`}
                    initial={isNewlyRevealed ? { rotateY: 180, y: -20, opacity: 0, scale: 0.7 } : false}
                    animate={{ rotateY: 0, y: 0, opacity: 1, scale: 1 }}
                    transition={{
                      delay: isNewlyRevealed ? (i % 3) * 0.12 : 0,
                      duration: 0.4, ease: 'easeOut',
                    }}
                    style={{ transformStyle: 'preserve-3d' }}
                  >
                    <CardFace card={card} />
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Bet stacks: per-player chips for current street ── */}
      <AnimatePresence>
        {Object.entries(betsThisStreet).map(([pid, amt]) => {
          const pidxInSeats = seats.indexOf(pid)
          if (pidxInSeats < 0) return null
          const seatPos = SEAT_POSITIONS[pidxInSeats]
          const betLeft = (parseFloat(seatPos.left) + 50) / 2
          const betTop  = (parseFloat(seatPos.top) + 50) / 2
          // Slide FROM player seat → bet position
          const seatLeftPct = parseFloat(seatPos.left)
          const seatTopPct = parseFloat(seatPos.top)
          const slideInX = tableDims.w > 0 ? ((seatLeftPct - betLeft) / 100) * tableDims.w : 0
          const slideInY = tableDims.h > 0 ? ((seatTopPct - betTop) / 100) * tableDims.h : 0
          // Always exit toward center pot (not winner)
          const exitX = tableDims.w > 0 ? (tableDims.w * 0.5) - (betLeft / 100) * tableDims.w : 0
          const exitY = tableDims.h > 0 ? (tableDims.h * 0.45) - (betTop / 100) * tableDims.h : 0
          return (
            <motion.div
              key={`bet-${pid}`}
              layoutId={`bet-${pid}`}
              initial={{ opacity: 0.4, scale: 0.5, x: slideInX, y: slideInY }}
              animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, scale: 0.3, x: exitX, y: exitY }}
              transition={{ type: 'spring', stiffness: 150, damping: 20 }}
              style={{
                position: 'absolute',
                left: `${betLeft}%`, top: `${betTop}%`,
                transform: 'translate(-50%,-50%)',
                zIndex: 15, pointerEvents: 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: amt > 500 ? '#212121' : amt > 50 ? '#e53935' : '#00bcd4',
                border: '2px solid rgba(255,255,255,0.35)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
              }} />
              <div style={{ fontSize: 9, color: '#ffd700', fontWeight: 700, letterSpacing: 0.5 }}>
                {amt.toLocaleString()}
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>

      {/* ── Bet add-ons: chip flies from seat to existing bet when amount increases ── */}
      <AnimatePresence>
        {betAddOns.map(({ id, pid, amt }) => {
          const pidxInSeats = seats.indexOf(pid)
          if (pidxInSeats < 0) return null
          const seatPos = SEAT_POSITIONS[pidxInSeats]
          const betLeft = (parseFloat(seatPos.left) + 50) / 2
          const betTop  = (parseFloat(seatPos.top) + 50) / 2
          const seatLeftPct = parseFloat(seatPos.left)
          const seatTopPct = parseFloat(seatPos.top)
          const slideInX = tableDims.w > 0 ? ((seatLeftPct - betLeft) / 100) * tableDims.w : 0
          const slideInY = tableDims.h > 0 ? ((seatTopPct - betTop) / 100) * tableDims.h : 0
          return (
            <motion.div
              key={id}
              initial={{ opacity: 0.8, scale: 0.6, x: slideInX, y: slideInY }}
              animate={{ opacity: 0, scale: 1, x: 0, y: 0 }}
              transition={{ type: 'spring', stiffness: 180, damping: 18 }}
              style={{
                position: 'absolute',
                left: `${betLeft}%`, top: `${betTop}%`,
                transform: 'translate(-50%,-50%)',
                zIndex: 16, pointerEvents: 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: '50%',
                background: amt > 500 ? '#212121' : amt > 50 ? '#e53935' : '#00bcd4',
                border: '2px solid rgba(255,255,255,0.4)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
              }} />
              <div style={{ fontSize: 8, color: '#ffd700', fontWeight: 700 }}>
                +{amt.toLocaleString()}
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>

      {/* ── Merging bets: chips flying to center pot on street change ── */}
      <AnimatePresence>
        {Object.entries(mergingBets).map(([pid, amt]) => {
          const pidxInSeats = seats.indexOf(pid)
          if (pidxInSeats < 0) return null
          const seatPos = SEAT_POSITIONS[pidxInSeats]
          const startLeft = (parseFloat(seatPos.left) + 50) / 2
          const startTop  = (parseFloat(seatPos.top) + 50) / 2
          const exitX = tableDims.w > 0 ? (0.5 * tableDims.w - (startLeft / 100) * tableDims.w) : 0
          const exitY = tableDims.h > 0 ? (0.45 * tableDims.h - (startTop / 100) * tableDims.h) : 0
          return (
            <motion.div
              key={`merge-${pid}`}
              initial={{ opacity: 1, scale: 1, x: 0, y: 0 }}
              animate={{ opacity: 0, scale: 0.4, x: exitX, y: exitY }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              style={{
                position: 'absolute',
                left: `${startLeft}%`, top: `${startTop}%`,
                transform: 'translate(-50%,-50%)',
                zIndex: 16, pointerEvents: 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: amt > 500 ? '#212121' : amt > 50 ? '#e53935' : '#00bcd4',
                border: '2px solid rgba(255,255,255,0.35)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
              }} />
              <div style={{ fontSize: 9, color: '#ffd700', fontWeight: 700, letterSpacing: 0.5 }}>
                {amt.toLocaleString()}
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>

      {/* ── Per-hand winner toast — boundary-clamped ── */}
      <AnimatePresence>
        {isHandComplete && handWinnerIds.length > 0 && (() => {
          const hwId = handWinnerIds[0]
          const hwName = hwId === heroId
            ? (botNameMap[hwId] ?? 'Unknown')
            : (userNameMap[hwId] ?? botNameMap[hwId] ?? 'Unknown')
          const hwSeatIdx = playerIds.indexOf(hwId)
          const hwSeatPos = hwSeatIdx >= 0 ? SEAT_POSITIONS[hwSeatIdx] : null
          const toastPos = clampToastPosition(
            hwSeatPos?.left ?? '50%', hwSeatPos?.top ?? '50%',
          )
          return (
            <motion.div
              key={`winner-toast-${hand?.hand_id}`}
              initial={{ opacity: 0, scale: 0.85, y: -12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -8 }}
              transition={{ type: 'spring', stiffness: 200, damping: 22 }}
              style={{
                position: 'absolute',
                top: toastPos.top, left: toastPos.left,
                transform: 'translateX(-50%)',
                transformOrigin: toastPos.transformOrigin,
                zIndex: 70, pointerEvents: 'none',
                background: 'rgba(5,5,15,0.92)', backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,215,0,0.5)',
                borderRadius: 12, padding: '10px 20px',
                boxShadow: '0 0 30px rgba(255,215,0,0.2), 0 4px 16px rgba(0,0,0,0.5)',
                textAlign: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              <div style={{
                fontSize: T.sm, color: '#ffd700', fontWeight: 700,
                letterSpacing: 0.5,
              }}>
                WINNER: {hwName}
              </div>
              <div style={{
                fontSize: T.xs, color: 'rgba(255,215,0,0.7)',
                ...monoStyle,
              }}>
                +{handPotAmount.toLocaleString()} chips
              </div>
            </motion.div>
          )
        })()}
      </AnimatePresence>

      {/* ── Player seats ── */}
      {seats.map((playerId, seatIdx) => {
        if (!playerId) return null
        const pos = SEAT_POSITIONS[seatIdx]
        const isHero    = playerId === heroId
        const isActive  = playerId === activePlayerId
        const isFolded  = foldedPlayers.has(playerId)
        const baseChips = playerStacks[playerId] ?? hand?.initial_stacks[playerId] ?? 0
        const chips     = baseChips + (winnerStackBonus[playerId] ?? 0)
        const lastAction = lastActionPerPlayer[playerId]
        const isDealer  = playerId === dealerBotId
        const posLabel = positionMap[playerId] ?? null
        const displayName = isHero
          ? (botNameMap[playerId] ?? `Bot-${playerId.slice(0, 6)}`)
          : (userNameMap[playerId] ?? botNameMap[playerId] ?? `Bot-${playerId.slice(0, 6)}`)
        const showBubble  = bubbleFor === playerId && lastAction != null

        return (
          <div
            key={playerId}
            style={{
              position: 'absolute', left: pos.left, top: pos.top,
              transform: 'translate(-50%,-50%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              opacity: isFolded ? 0.38 : 1,
              filter: isFolded ? 'grayscale(1) brightness(0.6)' : 'none',
              transition: 'opacity 0.4s, filter 0.4s',
              zIndex: 20,
            }}
          >
            {/* Action bubble */}
            <div style={{ height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {showBubble && lastAction && (
                <ActionBubble label={getActionLabel(lastAction)} visible={showBubble} />
              )}
            </div>


            {/* Seat circle — exact Lab style */}
            <div style={{
              position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 38, height: 38, borderRadius: '50%',
              background: isHero ? C.accent : 'rgba(12,12,20,0.88)',
              border: `2px solid ${isActive ? 'rgba(0,229,255,0.7)' : isHero ? C.accent : 'rgba(255,255,255,0.18)'}`,
              boxShadow: (() => {
                const isTournamentWinner = isComplete && playerId === winnerId
                const isHandWinner = isHandComplete && handWinnerIds.includes(playerId)
                if (isTournamentWinner) {
                  return '0 0 0 3px #ffd700, 0 0 22px rgba(255,215,0,0.6)'
                }
                if (isHandWinner) {
                  return '0 0 0 3px rgba(255,215,0,0.7), 0 0 18px rgba(255,215,0,0.4)'
                }
                if (isActive) {
                  return '0 0 0 3px rgba(0,229,255,0.6), 0 0 20px rgba(0,229,255,0.4)'
                }
                if (isHero) {
                  return `0 0 0 3px rgba(0,245,255,0.28), 0 0 18px ${C.accent}90`
                }
                return '0 2px 8px rgba(0,0,0,0.6)'
              })(),
              fontSize: 13, fontWeight: 800, fontFamily: C.font,
              color: isHero ? '#000' : 'rgba(255,255,255,0.7)',
              letterSpacing: 0.3,
              backdropFilter: 'blur(4px)',
              animation: (() => {
                const isTournamentWinner = isComplete && playerId === winnerId
                if (isTournamentWinner) {
                  return 'winnerGlow 1.5s ease-in-out infinite'
                }
                if (isActive) {
                  return 'activeGlow 1.5s ease-in-out infinite'
                }
                if (isHero) {
                  return 'heroGlow 2.5s ease-in-out infinite'
                }
                return 'none'
              })(),
            }}>
              {displayName.charAt(0).toUpperCase()}

              {/* YOU badge */}
              {isHero && (
                <div style={{
                  position: 'absolute', bottom: -7, left: '50%', transform: 'translateX(-50%)',
                  background: C.accent, color: '#000', fontSize: 7, fontWeight: 900,
                  padding: '1px 4px', borderRadius: 3, letterSpacing: 0.5, whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}>YOU</div>
              )}

              {/* Hero: always show face-up hole cards (with deal fly-in animation) */}
              {isHero && (() => {
                const heroCards = hand?.hole_cards?.[playerId] ?? null
                // Compute deal animation offsets (from dealer seat → hero seat)
                let dealDx = 0; let dealDy = 0
                if (tableDims.w > 0 && dealerSeatIdx >= 0) {
                  const dealerPx = getSeatPixelPos(dealerSeatIdx, tableDims)
                  const heroPx   = getSeatPixelPos(seatIdx, tableDims)
                  dealDx = dealerPx.x - heroPx.x
                  dealDy = dealerPx.y - heroPx.y
                }
                return (
                  <div style={{
                    position: 'absolute', left: '100%', top: '50%',
                    transform: 'translateY(-50%)', marginLeft: 6,
                    display: 'flex', gap: 3,
                    filter: 'drop-shadow(0 0 8px rgba(0,229,255,0.5))',
                  }}>
                    {heroCards && heroCards.length > 0 ? heroCards.map((card, i) => (
                      <motion.div
                        key={`${hand!.hand_id}_hero_${i}`}
                        initial={{ x: dealDx, y: dealDy, opacity: 0, scale: 0.4 }}
                        animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                        transition={{ delay: (seatIdx * 2 + i) * 0.09, duration: 0.38, ease: 'easeOut' }}
                      >
                        <CardFace card={card} />
                      </motion.div>
                    )) : [0, 1].map(i => (
                      <motion.div
                        key={`${hand?.hand_id ?? 'empty'}_hero_na_${i}`}
                        initial={{ x: dealDx, y: dealDy, opacity: 0, scale: 0.4 }}
                        animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                        transition={{ delay: (seatIdx * 2 + i) * 0.09, duration: 0.38, ease: 'easeOut' }}
                      >
                        <div style={{
                          width: 46, height: 66, borderRadius: 5, flexShrink: 0,
                          background: 'linear-gradient(160deg, rgba(0,229,255,0.15) 0%, rgba(0,229,255,0.05) 100%)',
                          border: '1px dashed rgba(0,245,255,0.4)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'rgba(0,245,255,0.5)', fontSize: 18, fontWeight: 700,
                        }}>?</div>
                      </motion.div>
                    ))}
                  </div>
                )
              })()}

              {/* Opponents: face-down by default, flip to face-up at showdown, slide out on fold */}
              {!isHero && (() => {
                // Compute deal animation offsets
                let dealDx = 0; let dealDy = 0
                if (tableDims.w > 0 && dealerSeatIdx >= 0) {
                  const dealerPx = getSeatPixelPos(dealerSeatIdx, tableDims)
                  const playerPx = getSeatPixelPos(seatIdx, tableDims)
                  dealDx = dealerPx.x - playerPx.x
                  dealDy = dealerPx.y - playerPx.y
                }
                // Fold exit direction: slide toward table center
                let foldExitX = 0; let foldExitY = -30
                if (tableDims.w > 0) {
                  const playerPx = getSeatPixelPos(seatIdx, tableDims)
                  const dx = tableDims.w * 0.5 - playerPx.x
                  const dy = tableDims.h * 0.5 - playerPx.y
                  const dist = Math.sqrt(dx * dx + dy * dy) || 1
                  foldExitX = (dx / dist) * 40
                  foldExitY = (dy / dist) * 40
                }
                return (
                  <AnimatePresence>
                    {!isFolded && (
                      <motion.div
                        key={`cards-${playerId}-${hand?.hand_id ?? 'e'}`}
                        exit={{ x: foldExitX, y: foldExitY, opacity: 0, scale: 0.5, rotate: -15 }}
                        transition={{ duration: 0.4, ease: 'easeIn' }}
                        style={{
                          position: 'absolute', left: '100%', top: '50%',
                          transform: 'translateY(-50%)', marginLeft: 4,
                          display: 'flex', gap: 2,
                        }}
                      >
                        {[0, 1].map(i => {
                          const showdownCard = isHandComplete && hand?.hole_cards?.[playerId]?.[i]
                          return showdownCard ? (
                            <motion.div
                              key={`${hand!.hand_id}_opp_${playerId}_${i}`}
                              initial={{ rotateY: 0 }}
                              animate={{ rotateY: 180 }}
                              transition={{ duration: 0.45, delay: i * 0.15, ease: 'easeInOut' }}
                              style={{ transformStyle: 'preserve-3d', perspective: 400, opacity: 0.75 }}
                            >
                              <div style={{ backfaceVisibility: 'hidden' }}>
                                <div style={{
                                  width: 10, height: 14, borderRadius: 2,
                                  background: 'rgba(50,55,75,0.9)',
                                  border: '1px solid rgba(0,245,255,0.35)',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                                }} />
                              </div>
                              <div style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                                <CardFace card={showdownCard} />
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div
                              key={`${hand?.hand_id ?? 'empty'}_opp_${playerId}_${i}`}
                              initial={{ x: dealDx, y: dealDy, opacity: 0, scale: 0.4 }}
                              animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                              transition={{ delay: (seatIdx * 2 + i) * 0.09, duration: 0.38, ease: 'easeOut' }}
                            >
                              <div style={{
                                width: 10, height: 14, borderRadius: 2,
                                background: 'rgba(50,55,75,0.9)',
                                border: '1px solid rgba(0,245,255,0.35)',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                              }} />
                            </motion.div>
                          )
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                )
              })()}
            </div>

            {/* Nameplate: name + chips */}
            <div style={{
              marginTop: 6,
              background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
              borderRadius: 6, padding: '3px 8px', textAlign: 'center',
              border: isHero
                ? `1px solid rgba(0,245,255,0.4)`
                : '1px solid rgba(255,255,255,0.07)',
              minWidth: 72,
            }}>
              <Tooltip text={displayName}>
                <div style={{
                  fontSize: T.xs, fontWeight: 600,
                  color: isHero ? C.accent : '#d4dae4',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 88,
                }}>
                  {displayName}
                </div>
              </Tooltip>
              <div style={{
                fontSize: T.sm, fontWeight: 700,
                color: isHero ? C.accent : 'rgba(255,255,255,0.45)',
                textShadow: isHero ? `0 0 8px ${C.accent}60` : 'none',
                ...monoStyle,
              }}>
                <AnimatedChipCount value={chips} />
              </div>
            </div>

            {/* Position badges — suppress D disc in heads-up (BTN/SB already covers it) */}
            <div style={{ display: 'flex', gap: 4, marginTop: 2, alignItems: 'center' }}>
              {isDealer && playerIds.length !== 2 && <BlindBadge label="D" color="#1a1a1a" />}
              {posLabel && (
                <BlindBadge
                  label={posLabel}
                  color={POSITION_COLORS[posLabel] ?? '#444'}
                />
              )}
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
      width: 44, height: Math.round(44 * 1.4), borderRadius: 5,
      border: '1px dashed rgba(0,245,255,0.28)',
      background: 'rgba(0,245,255,0.03)',
    }} />
  )
}

function BlindBadge({ label, color }: { label: string; color: string }) {
  const isLong = label.length > 2
  return (
    <div style={{
      minWidth: 22, height: 22,
      borderRadius: isLong ? 11 : '50%',
      padding: isLong ? '0 5px' : 0,
      background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: 0.3,
      border: '1px solid rgba(255,255,255,0.2)',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </div>
  )
}

function AnimatedChipCount({ value }: { value: number }) {
  const [display, setDisplay] = useState(value)
  const prevRef = useRef(value)

  useEffect(() => {
    const from = prevRef.current
    const to = value
    prevRef.current = value
    if (from === to) { setDisplay(to); return }

    const duration = 600
    const start = performance.now()
    let raf: number
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setDisplay(Math.round(from + (to - from) * eased))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])

  return <>{display.toLocaleString()}</>
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

// ─── StoryHandCard (carousel item — Stories aesthetic) ───────────────────────

function ResultIcon({ result }: { result: HandResult }) {
  const icon = (() => {
    if (result.outcome === 'win') return (
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
        <circle cx="22" cy="22" r="20" fill="rgba(34,197,94,0.18)" stroke="#22c55e" strokeWidth="1.5"/>
        <polyline points="12,22 19,30 32,14" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
    if (result.outcome === 'loss') return (
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
        <circle cx="22" cy="22" r="20" fill="rgba(226,75,74,0.18)" stroke="#e24b4a" strokeWidth="1.5"/>
        <line x1="14" y1="14" x2="30" y2="30" stroke="#e24b4a" strokeWidth="3" strokeLinecap="round"/>
        <line x1="30" y1="14" x2="14" y2="30" stroke="#e24b4a" strokeWidth="3" strokeLinecap="round"/>
      </svg>
    )
    if (result.outcome === 'fold') return (
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
        <circle cx="22" cy="22" r="20" fill="rgba(90,96,112,0.12)" stroke="rgba(90,96,112,0.5)" strokeWidth="1.5"/>
        <line x1="22" y1="14" x2="22" y2="30" stroke="rgba(140,150,165,0.7)" strokeWidth="2.5" strokeLinecap="round"/>
        <polyline points="16,24 22,30 28,24" stroke="rgba(140,150,165,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    )
    return (
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
        <circle cx="22" cy="22" r="5" fill="rgba(90,96,112,0.8)"/>
      </svg>
    )
  })()

  return (
    <div style={{ position: 'relative', width: 44, height: 44 }}>
      {icon}
      {result.isBigPot && (
        <div style={{
          position: 'absolute', top: -6, right: -6,
          fontSize: 16, lineHeight: 1,
          filter: 'drop-shadow(0 0 8px rgba(255,180,0,0.8))',
          animation: 'pulse-gold 2s ease-in-out infinite',
        }}>🔥</div>
      )}
    </div>
  )
}

const CARD_W = 96
const CARD_H = Math.round(CARD_W * 16 / 10)  // 154px — 10:16 story ratio

// Radial glow + dark glass base, layered
const RADIAL_GLOWS: Record<HandOutcome, string> = {
  win:     'radial-gradient(ellipse at 50% 38%, rgba(16,185,129,0.38) 0%, transparent 62%), rgba(4,14,10,0.72)',
  loss:    'radial-gradient(ellipse at 50% 38%, rgba(239,68,68,0.26) 0%, transparent 62%), rgba(8,4,14,0.76)',
  fold:    'radial-gradient(ellipse at 50% 38%, rgba(71,85,105,0.22) 0%, transparent 62%), rgba(6,6,18,0.76)',
  neutral: 'radial-gradient(ellipse at 50% 38%, rgba(71,85,105,0.18) 0%, transparent 62%), rgba(6,6,18,0.76)',
}

const DELTA_GLOW: Record<string, string> = {
  pos: '0 0 10px rgba(52,211,153,0.75)',
  neg: '0 0 10px rgba(248,113,113,0.75)',
}

// Tiny card-back for the hole-card preview
function MiniCardBack({ rotation }: { rotation: number }) {
  return (
    <div style={{
      width: 26, height: 37, borderRadius: 4, flexShrink: 0,
      background: 'linear-gradient(145deg, #8fa0af 0%, #607080 40%, #3d5060 100%)',
      border: '1px solid rgba(255,255,255,0.18)',
      boxShadow: '0 3px 10px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.15)',
      transform: `rotate(${rotation}deg)`,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 2, borderRadius: 3,
        backgroundImage: `repeating-linear-gradient(45deg,rgba(255,255,255,0.055) 0px,rgba(255,255,255,0.055) 1px,transparent 1px,transparent 5px),
          repeating-linear-gradient(-45deg,rgba(255,255,255,0.055) 0px,rgba(255,255,255,0.055) 1px,transparent 1px,transparent 5px)`,
      }} />
    </div>
  )
}

function StoryHandCard({ hand, result, isActive, onClick, heroId, hands, handIdx }: {
  hand: HandLog; result: HandResult; isActive: boolean; onClick: () => void
  heroId: string; hands: HandLog[]; handIdx: number
}) {
  const delta    = getChipDelta(heroId, handIdx, hands)
  const notation = hand.actions.find(a => a.p_id === heroId)?.metrics?.hand_notation ?? null

  const deltaColor = delta === null ? 'rgba(255,255,255,0.28)'
    : delta > 0 ? '#34d399'
    : delta < 0 ? '#f87171'
    : 'rgba(255,255,255,0.38)'

  const deltaGlow = delta !== null && delta > 0 ? DELTA_GLOW.pos
    : delta !== null && delta < 0 ? DELTA_GLOW.neg
    : 'none'

  return (
    <motion.div
      onClick={onClick}
      animate={{ scale: isActive ? 1.1 : 1, y: isActive ? -12 : 0 }}
      whileHover={!isActive ? { scale: 1.05, y: -5 } : undefined}
      transition={{ type: 'spring', stiffness: 360, damping: 26 }}
      style={{
        flexShrink: 0, scrollSnapAlign: 'center',
        width: CARD_W, height: CARD_H,
        borderRadius: 22,
        background: RADIAL_GLOWS[result.outcome],
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderTop: '1px solid rgba(255,255,255,0.22)',
        borderLeft: '1px solid rgba(255,255,255,0.16)',
        cursor: 'pointer', userSelect: 'none',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 6px 10px',
        zIndex: isActive ? 10 : 1,
        position: 'relative',
        boxShadow: isActive
          ? undefined   // ringPulse animation takes over
          : 'inset 1px 1px 0 rgba(255,255,255,0.08), 0 4px 16px rgba(0,0,0,0.4)',
        animation: isActive ? 'ringPulse 2.2s ease-in-out infinite' : 'none',
      }}
    >
      {/* Hand number — JetBrains Mono via monoStyle */}
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 1,
        color: isActive ? C.accent : 'rgba(255,255,255,0.42)',
        ...monoStyle,
      }}>
        #{handIdx + 1}
      </div>

      {/* Result icon */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
        <ResultIcon result={result} />
      </div>

      {/* Hole card preview — fan style */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ transform: 'rotate(-11deg) translateY(2px)', zIndex: 1 }}>
          <MiniCardBack rotation={0} />
        </div>
        <div style={{ transform: 'rotate(11deg) translateY(2px)', zIndex: 2, marginLeft: -8 }}>
          <MiniCardBack rotation={0} />
        </div>
        {/* Hand notation badge */}
        {notation && (
          <div style={{
            position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.75)', borderRadius: 4, padding: '2px 6px',
            fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.65)', lineHeight: 1.3,
            border: '1px solid rgba(255,255,255,0.12)',
            ...monoStyle, whiteSpace: 'nowrap',
          }}>{notation}</div>
        )}
      </div>

      {/* Chip delta — glowing in result color */}
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
        color: deltaColor,
        textShadow: deltaGlow,
        ...monoStyle,
      }}>
        {delta === null ? '—' : formatDelta(delta)}
      </div>
    </motion.div>
  )
}

// ─── TournamentSelector ───────────────────────────────────────────────────────

interface ParticipationRow {
  tournamentId: string
  tournamentName: string
  finishedAt: string | null
  status: string
  botId: string
  botName: string
}

function dedupe<T>(arr: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>()
  return arr.filter((item) => {
    const k = keyFn(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function TournamentSelector({ onLoad }: {
  onLoad: (log: MasterTournamentLog, heroId: string, nameMap: Record<string, { botName: string; userName: string }>, tournamentId: string, tournamentName: string) => void
}) {
  const [rows, setRows] = useState<ParticipationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingLog, setLoadingLog] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null)
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null)

  useEffect(() => {
    api.get<ParticipationRow[]>('/tournaments/participated')
      .then((res) => setRows(res.data))
      .catch((e) => setError(e?.response?.data?.message ?? 'Failed to load tournaments'))
      .finally(() => setLoading(false))
  }, [])

  // Derived: visible tournaments (narrowed by selected bot)
  const visibleTournaments = useMemo(() => dedupe(
    selectedBotId ? rows.filter((r) => r.botId === selectedBotId) : rows,
    (r) => r.tournamentId,
  ), [rows, selectedBotId])

  // Derived: visible bots (narrowed by selected tournament)
  const visibleBots = useMemo(() => dedupe(
    selectedTournamentId ? rows.filter((r) => r.tournamentId === selectedTournamentId) : rows,
    (r) => r.botId,
  ), [rows, selectedTournamentId])

  // Auto-select when a panel narrows to exactly one item
  useEffect(() => {
    if (visibleBots.length === 1 && selectedBotId !== visibleBots[0].botId) {
      setSelectedBotId(visibleBots[0].botId)
    }
  }, [visibleBots, selectedBotId])

  useEffect(() => {
    if (visibleTournaments.length === 1 && selectedTournamentId !== visibleTournaments[0].tournamentId) {
      setSelectedTournamentId(visibleTournaments[0].tournamentId)
    }
  }, [visibleTournaments, selectedTournamentId])

  function handleSelectTournament(tournamentId: string) {
    if (selectedTournamentId === tournamentId) {
      setSelectedTournamentId(null)
      return
    }
    setSelectedTournamentId(tournamentId)
    // If the currently-selected bot didn't participate here, clear it
    if (selectedBotId) {
      const participates = rows.some((r) => r.tournamentId === tournamentId && r.botId === selectedBotId)
      if (!participates) setSelectedBotId(null)
    }
  }

  function handleSelectBot(botId: string) {
    if (selectedBotId === botId) {
      setSelectedBotId(null)
      return
    }
    setSelectedBotId(botId)
    // If the currently-selected tournament didn't include this bot, clear it
    if (selectedTournamentId) {
      const participates = rows.some((r) => r.botId === botId && r.tournamentId === selectedTournamentId)
      if (!participates) setSelectedTournamentId(null)
    }
  }

  async function handleLoad() {
    if (!selectedTournamentId || !selectedBotId || loadingLog) return
    setLoadingLog(true)
    setError(null)
    try {
      const res = await api.get<{ log_data: MasterTournamentLog; nameMap: Record<string, { botName: string; userName: string }> }>(
        `/tournaments/${selectedTournamentId}/log`
      )
      const log = res.data.log_data
      if (!log || !log.hands || !log.tournament_summary) {
        setError('Tournament log is empty or not yet available')
        return
      }
      const tName = rows.find((r) => r.tournamentId === selectedTournamentId)?.tournamentName ?? selectedTournamentId
      onLoad(log, selectedBotId, res.data.nameMap ?? {}, selectedTournamentId, tName)
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to load tournament log')
    } finally {
      setLoadingLog(false)
    }
  }

  const canLoad = !!(selectedTournamentId && selectedBotId && !loadingLog)
  const isEmpty = !loading && rows.length === 0 && !error

  const panelStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, borderRadius: 14,
    background: 'rgba(18,18,27,0.6)',
    border: '1px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
  }

  const panelHeaderStyle: React.CSSProperties = {
    padding: '12px 18px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    fontSize: T.xs, fontWeight: 700, color: C.muted,
    letterSpacing: 1.2, textTransform: 'uppercase' as const,
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
      width: 820, maxWidth: '95vw', fontFamily: C.font,
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: T.h1, fontWeight: 800, letterSpacing: 0.5 }}>
          Tournament Analytics
        </div>
        <div style={{ color: C.muted, fontSize: T.sm, marginTop: 6 }}>
          Review matches and replay hands to audit bot performance.
        </div>
      </div>

      {loading && (
        <div style={{ color: C.muted, fontSize: T.sm }}>Loading…</div>
      )}

      {isEmpty && (
        <div style={{ color: C.muted, fontSize: T.sm, textAlign: 'center' }}>
          No finished tournaments found for your active bots yet.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          {/* Dual-panel cross-filter */}
          <div style={{ display: 'flex', gap: 16, width: '100%' }}>
            {/* Bots panel */}
            <div style={panelStyle}>
              <div style={panelHeaderStyle}>Bots</div>
              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                {visibleBots.map((row) => {
                  const isSelected = selectedBotId === row.botId
                  const isDimmed = selectedTournamentId !== null &&
                    !rows.some((r) => r.tournamentId === selectedTournamentId && r.botId === row.botId)
                  return (
                    <div
                      key={row.botId}
                      onClick={() => !isDimmed && handleSelectBot(row.botId)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 18px',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        cursor: isDimmed ? 'default' : 'pointer',
                        opacity: isDimmed ? 0.3 : 1,
                        background: isSelected ? 'rgba(0,229,255,0.08)' : 'transparent',
                        borderLeft: isSelected ? `2px solid ${C.accent}` : '2px solid transparent',
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isDimmed && !isSelected)
                          (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,229,255,0.04)'
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected)
                          (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                      }}
                    >
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: isSelected ? C.accent : 'rgba(255,255,255,0.2)',
                      }} />
                      <span style={{ fontSize: T.base, fontWeight: isSelected ? 600 : 400, color: isSelected ? C.accent : C.text }}>
                        {row.botName}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Tournaments panel */}
            <div style={panelStyle}>
              <div style={panelHeaderStyle}>Tournaments</div>
              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                {visibleTournaments.map((row) => {
                  const isSelected = selectedTournamentId === row.tournamentId
                  const isDimmed = selectedBotId !== null &&
                    !rows.some((r) => r.botId === selectedBotId && r.tournamentId === row.tournamentId)
                  const date = row.finishedAt
                    ? new Date(row.finishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                    : '—'
                  return (
                    <div
                      key={row.tournamentId}
                      onClick={() => !isDimmed && handleSelectTournament(row.tournamentId)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 18px',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        cursor: isDimmed ? 'default' : 'pointer',
                        opacity: isDimmed ? 0.3 : 1,
                        background: isSelected ? 'rgba(0,229,255,0.08)' : 'transparent',
                        borderLeft: isSelected ? `2px solid ${C.accent}` : '2px solid transparent',
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isDimmed && !isSelected)
                          (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,229,255,0.04)'
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected)
                          (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                      }}
                    >
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: isSelected ? C.accent : 'rgba(255,255,255,0.2)',
                      }} />
                      <div style={{ minWidth: 0 }}>
                        <Tooltip text={row.tournamentName}>
                          <div style={{
                            fontSize: T.base, fontWeight: isSelected ? 600 : 400,
                            color: isSelected ? C.accent : C.text,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {row.tournamentName}
                          </div>
                        </Tooltip>
                        <div style={{ fontSize: T.xs, color: C.muted, marginTop: 1 }}>Finished {date}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Load button */}
          <button
            onClick={handleLoad}
            disabled={!canLoad}
            style={{
              padding: '12px 36px', borderRadius: 10, fontFamily: C.font,
              fontSize: T.base, fontWeight: 700, cursor: canLoad ? 'pointer' : 'not-allowed',
              background: canLoad ? C.accent : 'rgba(255,255,255,0.06)',
              color: canLoad ? '#050508' : C.muted,
              border: 'none', transition: 'all 0.15s',
              boxShadow: canLoad ? `0 0 20px rgba(0,229,255,0.3)` : 'none',
            }}
          >
            {loadingLog ? 'Loading…' : 'Load Theater →'}
          </button>
        </>
      )}

      {error && (
        <div style={{
          color: C.danger, fontSize: T.sm, padding: '8px 16px', borderRadius: 8,
          background: 'rgba(226,75,74,0.1)', border: '1px solid rgba(226,75,74,0.2)',
          width: '100%', textAlign: 'center',
        }}>
          {error}
        </div>
      )}
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
    0%, 100% { box-shadow: 0 0 0 3px rgba(0,245,255,0.9), 0 0 18px rgba(0,245,255,0.7), 0 0 40px rgba(0,245,255,0.3); }
    50%       { box-shadow: 0 0 0 3px rgba(0,245,255,1),   0 0 28px rgba(0,245,255,0.9), 0 0 60px rgba(0,245,255,0.5); }
  }
  @keyframes ringPulse {
    0%, 100% { box-shadow: inset 1px 1px 0 rgba(255,255,255,0.18), 0 0 0 1.5px #00f5ff, 0 0 0 5px rgba(0,245,255,0.12), 0 0 28px rgba(0,245,255,0.35), 0 10px 36px rgba(0,245,255,0.18); }
    50%       { box-shadow: inset 1px 1px 0 rgba(255,255,255,0.18), 0 0 0 1.5px #00f5ff, 0 0 0 9px rgba(0,245,255,0.22), 0 0 52px rgba(0,245,255,0.65), 0 14px 44px rgba(0,245,255,0.3); }
  }
  @keyframes activeGlow {
    0%, 100% { box-shadow: 0 0 0 3px rgba(0,229,255,0.4), 0 0 12px rgba(0,229,255,0.3); }
    50%       { box-shadow: 0 0 0 3px rgba(0,229,255,0.8), 0 0 28px rgba(0,229,255,0.5); }
  }
  @keyframes winnerGlow {
    0%, 100% { box-shadow: 0 0 0 3px rgba(255,215,0,0.4), 0 0 18px rgba(255,215,0,0.5), 0 0 40px rgba(255,215,0,0.2); }
    50%       { box-shadow: 0 0 0 3px rgba(255,215,0,0.8), 0 0 28px rgba(255,215,0,0.8), 0 0 60px rgba(255,215,0,0.4); }
  }
  @keyframes confettiFall {
    0% { transform: translateY(0); opacity: 1; }
    100% { transform: translateY(120px); opacity: 0; }
  }
  @keyframes winnerBadgePulse {
    0%, 100% { box-shadow: 0 0 12px rgba(255,215,0,0.8), 0 2px 8px rgba(0,0,0,0.4); }
    50%       { box-shadow: 0 0 24px rgba(255,215,0,1),   0 2px 8px rgba(0,0,0,0.4); }
  }
  @keyframes potFlyOut {
    0%   { opacity: 1; transform: translateX(-50%) scale(1); }
    100% { opacity: 0; transform: translateX(-50%) scale(0.4) translateY(-20px); }
  }
  @keyframes overlayConfettiBurst {
    0%   { transform: translateY(0) rotate(0deg); opacity: 0.85; }
    40%  { opacity: 0.9; }
    100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
  }
  @keyframes goldenGlow {
    0%, 100% { text-shadow: 0 0 20px rgba(255,215,0,0.6), 0 0 60px rgba(255,215,0,0.3); }
    50%      { text-shadow: 0 0 40px rgba(255,215,0,1), 0 0 80px rgba(255,215,0,0.6); }
  }
  @keyframes trophyBounce {
    0%   { transform: scale(0) rotate(-20deg); }
    50%  { transform: scale(1.2) rotate(5deg); }
    70%  { transform: scale(0.95) rotate(-2deg); }
    100% { transform: scale(1) rotate(0deg); }
  }
  [data-hide-scroll]::-webkit-scrollbar { display: none; }
`
