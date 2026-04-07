import React, { useEffect, useRef, useState } from 'react'
import api from '../lib/axios'
import { Sidebar } from '../components/Sidebar'
import CustomSelect from '../components/CustomSelect'
import { Lightbulb, Terminal } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Bot {
  id: string
  name: string
  active: boolean
  strategy?: {
    tier?: string
    personality?: {
      aggression: number
      tightness: number
      riskTolerance: number
      bluffFrequency: number
    }
  }
}

interface ScenarioResult {
  primaryAction: { type: string; amount?: number }
  source: 'Range Chart' | 'Hard Rule' | 'Personality' | 'Position Override'
  explanation: string
  handNotation?: string
  ruleId?: string
  distribution: { fold: number; check: number; call: number; raise: number }
  /** Monte Carlo equity 0–100 with one decimal (e.g. 91.2). Populated by backend. */
  equity?: number
}

type Slot = 'board0' | 'board1' | 'board2' | 'board3' | 'board4' | 'hand0' | 'hand1'

const LAST_ACTIONS = ['check', 'bet', 'raise', 'all_in'] as const
type LastAction = typeof LAST_ACTIONS[number]

const LAST_ACTION_LABELS: Record<LastAction, string> = {
  check: 'Check', bet: 'Bet', raise: 'Raise', all_in: 'All-in',
}

interface FormState {
  cards: Record<Slot, string | null>
  pot: number
  toCall: number
  minRaise: number
  numberOfPlayers: number
  position: string
  currentAction: string
  botStack: number
  avgOpponentStack: number
  bigBlind: number
  lastAction: LastAction
}

interface ScenarioHistoryItem {
  id: string
  timestamp: number
  botId: string
  botName: string
  label: string
  formState: FormState
  decision?: string
  equity?: number
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#09090b',
  card: '#18181b',
  border: '#27272a',
  accent: '#00e5ff',
  accentDim: 'rgba(0,229,255,0.08)',
  text: '#ffffff',
  muted: '#71717a',
  danger: '#e24b4a',
  success: '#1d9e75',
  warn: '#f59e0b',
  font: "'Trebuchet MS', sans-serif",
}

const panel: React.CSSProperties = {
  background: 'rgba(24,24,27,0.85)',
  backdropFilter: 'blur(12px)',
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: '16px 20px',
}

// ─── Card constants ───────────────────────────────────────────────────────────

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const
const SUITS = ['s', 'h', 'd', 'c'] as const
// \uFE0E forces text (not emoji) presentation so suits render as crisp glyphs, not coloured emoji
const SUIT_GLYPH: Record<string, string> = { s: '♠\uFE0E', h: '♥\uFE0E', d: '♦\uFE0E', c: '♣\uFE0E' }
const SUIT_COLOR: Record<string, string> = { s: '#1e2a3a', h: '#cc2222', d: '#cc2222', c: '#1e2a3a' }
const SUIT_NAME: Record<string, string> = { s: 'Spades', h: 'Hearts', d: 'Diamonds', c: 'Clubs' }

// ─── History helpers ──────────────────────────────────────────────────────────

const HISTORY_KEY = 'scenario_lab_history'
const HISTORY_MAX = 15

function loadHistory(): ScenarioHistoryItem[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') } catch { return [] }
}

function saveHistory(items: ScenarioHistoryItem[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_MAX)))
}

function buildLabel(cards: Record<Slot, string | null>, position: string, currentAction: string): string {
  const h0 = cards.hand0
  const h1 = cards.hand1
  let handPart = '??'
  if (h0 && h1) {
    const r0 = h0.slice(0, -1), s0 = h0.slice(-1)
    const r1 = h1.slice(0, -1), s1 = h1.slice(-1)
    handPart = s0 === s1 ? `${r0}${r1}s` : `${r0}${r1}o`
    if (r0 === r1) handPart = `${r0}${r1}`
  }
  const situation = currentAction ? ` vs ${currentAction}` : ''
  return `${handPart} on ${position}${situation}`
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Sanity warnings ──────────────────────────────────────────────────────────

function checkSanityWarning(result: ScenarioResult, toCall: number): string | null {
  const action = result.primaryAction.type
  if (action !== 'fold') return null

  const expl = result.explanation.toLowerCase()

  const strongCategories = ['premium', 'strong', 'trips', 'flush', 'straight', 'full_house', 'quads', 'straight_flush', 'royal_flush', 'two_pair']
  const hasStrongHand = strongCategories.some(cat => expl.includes(cat))
  if (hasStrongHand) {
    return 'Unusual Decision: Your bot is folding a very strong hand. Check your strategy overrides or range chart configuration.'
  }

  if (toCall === 0) {
    return 'Unusual Decision: Your bot is folding even though checking was free (no bet to call). This may indicate a misconfigured strategy.'
  }

  return null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractCategory(explanation: string): string {
  // Allow underscores so multi-word categories like "board_plays" are matched in full.
  const m = explanation.match(/\(([a-zA-Z_]+)[\s,)]/i)
  return m?.[1]?.toLowerCase() ?? ''
}

// ─── Deal Rating component ────────────────────────────────────────────────────

function DealRating({ winChance, priceToCall }: { winChance: number; priceToCall: number }) {
  if (priceToCall === 0) {
    return (
      <div style={{
        background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.3)',
        borderRadius: 8, padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 16 }}>✅</span>
        <span style={{ fontSize: 13, color: '#34d399', fontWeight: 600 }}>
          Free to act — no cost to stay in this hand.
        </span>
      </div>
    )
  }

  const dealGap = winChance - priceToCall
  const isGreat = dealGap >= 15
  const isGoodValue = winChance > priceToCall
  const isBad = dealGap < -5

  const ratingColor = isGreat ? '#34d399' : isGoodValue ? '#1d9e75' : isBad ? '#e24b4a' : '#f59e0b'
  const ratingBg = isGreat ? 'rgba(29,158,117,0.08)' : isGoodValue ? 'rgba(29,158,117,0.06)' : isBad ? 'rgba(226,75,74,0.08)' : 'rgba(245,158,11,0.08)'
  const ratingBorder = isGreat ? 'rgba(29,158,117,0.3)' : isGoodValue ? 'rgba(29,158,117,0.2)' : isBad ? 'rgba(226,75,74,0.3)' : 'rgba(245,158,11,0.3)'
  const ratingLabel = isGreat ? 'Great Value' : isGoodValue ? 'Good Value' : isBad ? 'Bad Value' : 'Fair Deal'
  const ratingText = isGreat
    ? 'High win chance for a low price.'
    : isGoodValue
      ? 'Your win chance beats the price to call.'
      : isBad
        ? "You're paying too much for these odds."
        : 'The risk matches the reward.'

  const barFill = Math.min(100, Math.max(0, winChance))
  const barGradient = (isGreat || isGoodValue)
    ? 'linear-gradient(90deg, #1d9e75, #34d399)'
    : isBad
      ? 'linear-gradient(90deg, #e24b4a, #f87171)'
      : 'linear-gradient(90deg, #d97706, #fbbf24)'

  return (
    <div style={{ background: ratingBg, border: `1px solid ${ratingBorder}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 800, color: ratingColor }}>{ratingLabel}</span>
          <span style={{ fontSize: 12, color: C.muted, marginLeft: 6 }}>— {ratingText}</span>
        </div>
      </div>
      <div style={{ height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{
          height: '100%', borderRadius: 6,
          background: barGradient,
          width: `${barFill}%`,
          transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, color: C.muted }}>
          Win Chance: <span style={{ color: ratingColor, fontWeight: 700 }}>
            {winChance < 0.1 && winChance > 0 ? '< 0.1%' : `${winChance.toFixed(1)}%`}
          </span>
        </div>
        <div style={{ fontSize: 11, color: C.muted }}>
          Price to Call: <span style={{ color: isBad ? '#f87171' : C.muted, fontWeight: 700 }}>{priceToCall}%</span>
        </div>
      </div>
    </div>
  )
}

// ─── Natural language reasoning ───────────────────────────────────────────────

const STRONG_CATEGORIES = new Set(['premium', 'strong', 'trips', 'two_pair', 'flush', 'straight', 'full_house', 'quads', 'straight_flush', 'royal_flush'])

function sprCoachingLine(spr: number | null, myStackBB: number): string {
  if (myStackBB < 15) {
    return `\n\n⚡ **Short-stack alert:** At **${myStackBB.toFixed(1)} BB**, push/fold strategy applies — shove with strong hands or fold; small raises commit your stack anyway.`
  }
  if (spr !== null && spr < 2) {
    return `\n\n🔒 **SPR ${spr.toFixed(1)}:** You are pot-committed — with any top pair or better, getting all the chips in is correct.`
  }
  if (spr !== null && spr < 5) {
    return `\n\n📐 **SPR ${spr.toFixed(1)}:** Low SPR favours strong made hands. Avoid slow-playing; draws have little implied odds here.`
  }
  return ''
}

const ACTION_CONTEXT_PREAMBLE: Record<LastAction, string> = {
  check: 'Since the action was checked to you',
  bet: 'Facing a bet',
  raise: 'Facing a raise',
  all_in: 'Facing an all-in',
}

function toNaturalLanguage(
  explanation: string,
  source: ScenarioResult['source'],
  result: ScenarioResult,
  ctx: { toCall: number; pot: number; position: string; winChance: number; spr: number | null; myStackBB: number; lastAction: LastAction },
  dna?: { aggression: number; tightness: number; riskTolerance: number; bluffFrequency: number },
): string {
  const action = result.primaryAction.type
  const category = extractCategory(explanation)
  const isStrongHand = STRONG_CATEGORIES.has(category)

  const handLabel: Record<string, string> = {
    premium: 'a very strong starting hand',
    strong: 'a solid hand with good chances',
    playable: 'a decent hand with potential',
    weak: 'a marginal hand that often loses at showdown',
    draw: 'a drawing hand that could become very strong if the right cards come out',
    board_plays:   'playing the board — your hole cards add nothing',
    trips:         'a powerful three-of-a-kind',
    two_pair:      'a solid two pair',
    flush:         'a strong flush',
    straight:      'a strong straight',
    full_house:    'a dominant full house',
    quads:         'an almost unbeatable four-of-a-kind',
    straight_flush:'a near-perfect straight flush',
    royal_flush:   'the best possible hand',
  }

  const hand = result.handNotation
    ? `**${result.handNotation}**`
    : handLabel[category] ?? 'this hand'

  const handDesc = handLabel[category] ?? 'this hand'

  const priceToCallPct = ctx.toCall > 0
    ? Math.round((ctx.toCall / (ctx.pot + ctx.toCall)) * 100)
    : 0

  const winGap = ctx.winChance - priceToCallPct
  const isGoodValue = winGap > 0  // matches DealRating: winChance > priceToCall

  const coaching = sprCoachingLine(ctx.spr, ctx.myStackBB)

  // DNA attribution helpers — directionally correct: only attribute when the slider
  // actually points in the direction of the action being explained.
  const isTight    = dna ? dna.tightness > 60 : false   // tight bot → fold makes sense
  const isLoose    = dna ? dna.tightness < 40 : false   // loose bot → fold is math-forced
  const isAggr     = dna ? dna.aggression > 60 : false  // aggressive bot → raise/bluff makes sense
  const isPassive  = dna ? dna.aggression < 40 : false  // passive bot → raise is opportunistic

  if (source === 'Range Chart') {
    const verb = action === 'fold' ? 'fold' : action === 'raise' ? 'raise with' : action === 'call' ? 'call with' : 'check with'
    const defaultNote = action === 'fold'
      ? ` This hand hasn't been painted yet, so it defaults to Fold. To change this, open Bot Builder, go to the **${ctx.position}** tab, and paint ${result.handNotation ?? 'this hand'} to Raise or Call.`
      : ''
    return `Your bot's **${ctx.position}** position chart says to ${verb} ${hand}.${defaultNote}${coaching}`
  }

  if (source === 'Position Override') {
    const actionCapitalized = action.charAt(0).toUpperCase() + action.slice(1)
    return `Your bot is set to always **${actionCapitalized}** from **${ctx.position}** — this is a position rule you configured.${coaching}`
  }

  if (source === 'Hard Rule') {
    const ruleId = result.ruleId
    return `A custom rule${ruleId ? ` you named **"${ruleId}"**` : ''} matched this situation and told the bot to **${action}**. It's following your explicit instruction instead of its default personality.${coaching}`
  }

  // Prepend action context for personality-driven decisions
  const preamble = source === 'Personality' ? `${ACTION_CONTEXT_PREAMBLE[ctx.lastAction]} — ` : ''

  // Board-plays: hole cards don't improve the board — dedicated coaching before generic branches.
  if (category === 'board_plays') {
    if (action === 'fold') {
      return `${preamble}Your bot folded **${result.handNotation ?? 'this hand'}**. You are **playing the board** — your hole cards add nothing to the best five-card hand. Against a bet, folding is reasonable unless the pot odds make a split-pot call profitable.${coaching}`
    }
    return `${preamble}Your bot called with **${result.handNotation ?? 'this hand'}**. You are **playing the board** — your hole cards don't improve on it. You can only **tie** with opponents who also play the board, and you **lose** to any hand that beats it (e.g., a higher straight or full house). Calling captures your split-pot equity; raising adds no value since you cannot win outright.${coaching}`
  }

  if (action === 'fold') {
    if (isStrongHand) {
      if (ctx.toCall === 0) {
        return `${preamble}Your bot folded ${hand} even though it could have checked for free. Folding ${handDesc} for no cost is almost always a mistake — this looks like a misconfigured **Risk Tolerance** or **Tightness** setting. Consider reviewing your bot's strategy in Bot Builder.${coaching}`
      }
      // Hero Fold: strong hand facing a bet
      if (source === 'Personality' && dna && isTight) {
        return `${preamble}Your bot made a **Hero Fold**. While you have ${hand}, the opponent's bet (**${ctx.toCall} chips**) makes this call mathematically losing (**$EV-**). **Reflecting its ${dna.tightness}% Tightness and ${dna.riskTolerance}% Risk Tolerance**, your bot chose to avoid this high-variance trap and protect its stack.${coaching}`
      }
      if (source === 'Personality' && dna && isLoose) {
        return `${preamble}Your bot folded ${hand} — a surprising move for a bot with only **${dna.tightness}% Tightness**. Despite its loose profile, the math was overwhelming: **${priceToCallPct}%** pot odds against a **${ctx.winChance.toFixed(1)}%** win chance made this a disciplined, math-forced fold.${coaching}`
      }
      return `${preamble}Your bot folded ${hand}. This is an unusual decision — ${handDesc} rarely needs to fold, even facing a bet. The price to call was **${priceToCallPct}%** of the pot. You may want to lower your bot's **Tightness** slider or check your range chart for this position.${coaching}`
    }
    if (ctx.toCall === 0) {
      // Free fold — only blame personality if tightness actually explains it
      if (source === 'Personality' && dna && isTight) {
        return `${preamble}Your bot folded ${hand} even though it could have checked for free. **Reflecting its ${dna.tightness}% Tightness**, the bot is configured to be conservative and avoided unnecessary exposure.${coaching}`
      }
      if (source === 'Personality' && dna) {
        return `${preamble}Your bot folded ${hand} even though it could have checked for free. With only **${dna.tightness}% Tightness**, this is an overly cautious move — consider raising the **Risk Tolerance** slider in Bot Builder.${coaching}`
      }
      return `${preamble}Your bot folded ${hand} even though it could have checked for free. This means its personality is very conservative — consider raising the **Risk Tolerance** slider in Bot Builder.${coaching}`
    }
    if (source === 'Personality' && isGoodValue) {
      // Folding despite positive EV — always blame personality, but frame correctly
      if (dna && isTight) {
        return `${preamble}Your bot folded ${hand} even though the pot odds were in its favor — win chance **${ctx.winChance.toFixed(1)}%** vs price to call **${priceToCallPct}%**. **Reflecting its ${dna.tightness}% Tightness and ${dna.riskTolerance}% Risk Tolerance**, your bot is configured to avoid marginal spots rather than play every profitable call. Lower the **Tightness** or raise **Risk Tolerance** in Bot Builder to capture these edges.${coaching}`
      }
      const dnaNote = dna ? ` (**Tightness ${dna.tightness}%, Risk Tolerance ${dna.riskTolerance}%**)` : ''
      return `${preamble}Your bot folded ${hand} even though the pot odds were in its favor — win chance **${ctx.winChance.toFixed(1)}%** vs price to call **${priceToCallPct}%**. This is a **personality decision**${dnaNote}: the bot prefers to avoid marginal spots rather than play every profitable call. Consider reviewing the **Tightness** slider in Bot Builder.${coaching}`
    }
    // Standard fold — contextual DNA framing
    if (source === 'Personality' && dna) {
      if (isTight) {
        return `${preamble}Following its **${dna.tightness}% Tightness** profile, your bot declined to compete for this pot and folded ${hand}. At **${priceToCallPct}%** of the pot, the price wasn't worth the risk.${coaching}`
      }
      if (isLoose) {
        return `${preamble}Despite its loose **${dna.tightness}% Tightness** profile, your bot found the mathematical odds too poor to continue — **${priceToCallPct}%** pot price against a **${ctx.winChance.toFixed(1)}%** win chance. A disciplined, math-forced fold.${coaching}`
      }
      // Neutral tightness — lead with math, append DNA as context
      return `${preamble}Your bot folded ${hand} rather than paying **${ctx.toCall} chips** to stay in. At **${priceToCallPct}%** of the pot with a **${ctx.winChance.toFixed(1)}%** win chance, the math didn't support calling (**Tightness ${dna.tightness}%, Risk Tolerance ${dna.riskTolerance}%**).${coaching}`
    }
    return `${preamble}Your bot folded ${hand} rather than paying **${ctx.toCall} chips** to stay in. At **${priceToCallPct}%** of the pot, the price wasn't worth it for ${handDesc}.${coaching}`
  }

  if (action === 'check') {
    return `${preamble}Your bot checked with ${hand}. Since there's no cost to stay in, it takes a free look at the next card and waits to see how things develop.${coaching}`
  }

  if (action === 'call') {
    if (isGoodValue) {
      const dnaNote = dna && source === 'Personality'
        ? ` Balanced by its **${dna.riskTolerance}% Risk Tolerance**, the bot decided the price was right.`
        : ''
      return `${preamble}Your bot made a **smart call** with ${hand}. Your win chance (~**${ctx.winChance.toFixed(1)}%**) is higher than the price to call (**${priceToCallPct}%**) — calling here is mathematically profitable over the long run.${dnaNote}${coaching}`
    }
    const priceNote = priceToCallPct < 25 ? 'a reasonable price' : priceToCallPct < 40 ? 'a fair price' : 'a steep price'
    return `${preamble}Your bot called the **${ctx.toCall}-chip** bet with ${hand}. At **${priceToCallPct}%** of the pot, it's ${priceNote} — the bot judged ${handDesc}'s win chance worth it.${coaching}`
  }

  if (action === 'raise' || action === 'all_in') {
    const verb = action === 'all_in' ? 'went all-in' : 'raised'
    const strengthNote = isStrongHand ? ' With a strong hand like this, raising builds the pot and protects against draws.' : ''
    let bluffNote = ''
    if (!isStrongHand && source === 'Personality' && dna) {
      if (isAggr) {
        bluffNote = ` Driven by its **${dna.aggression}% Aggression**, your bot attempted to seize the pot despite low equity.`
      } else if (isPassive) {
        bluffNote = ` Stepping outside its passive **${dna.aggression}% Aggression** profile, your bot identified a high-value opportunity and made an assertive move.`
      }
    }
    return `${preamble}Your bot ${verb} with ${hand}. It's confident enough in its cards to put more money in and pressure opponents to fold or pay up.${strengthNote}${bluffNote}${coaching}`
  }

  return explanation + coaching
}

function renderMarkdown(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} style={{ color: C.text, fontWeight: 700 }}>{part}</strong>
      : part
  )
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex', marginLeft: 5, verticalAlign: 'middle' }}>
      <span
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        style={{
          width: 15, height: 15, borderRadius: '50%',
          border: `1px solid ${C.muted}`, color: C.muted,
          fontSize: 9, fontWeight: 700, display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center',
          cursor: 'help', lineHeight: 1, userSelect: 'none',
        }}
      >i</span>
      {visible && (
        <div style={{
          position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a2e', border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '8px 12px', width: 220,
          fontSize: 12, color: C.muted, lineHeight: 1.5,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          zIndex: 100, pointerEvents: 'none', whiteSpace: 'normal',
        }}>
          {text}
          <div style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
            borderTop: `6px solid ${C.border}`,
          }} />
        </div>
      )}
    </span>
  )
}

// ─── Card face ───────────────────────────────────────────────────────────────

// T is stored internally for Ten; display it as "10"
const RANK_DISPLAY: Record<string, string> = { T: '10' }

// CSS-rendered card — same "simple" style for all 52 cards
const CARD_SUIT_COLOR: Record<string, string> = { h: '#df0000', d: '#df0000', c: '#111', s: '#111' }

function CardFace({ card, width = 72 }: { card: string; width?: number; height?: number }) {
  const rank = card.slice(0, -1)
  const suit = card.slice(-1)
  const label = RANK_DISPLAY[rank] ?? rank   // T → '10'
  const symbol = SUIT_GLYPH[suit] ?? suit
  const color = CARD_SUIT_COLOR[suit] ?? '#111'
  const h = Math.round(width * 1.4)           // standard 2.5:3.5 playing card ratio
  const cornerRank = Math.round(width * 0.21)
  const cornerSuit = Math.round(width * 0.17)
  const centerSuit = Math.round(width * 0.50)
  const radius = Math.round(width * 0.1)
  const pad = Math.round(width * 0.07)

  return (
    <div
      style={{
        width, height: h, flexShrink: 0,
        background: '#fff',
        borderRadius: radius,
        border: '1px solid rgba(0,0,0,0.12)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.2)',
        userSelect: 'none',
        transition: 'transform 0.15s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
    >
      {/* Top-left corner */}
      <div style={{ position: 'absolute', top: pad, left: pad, lineHeight: 1, color, textAlign: 'center' }}>
        <div style={{ fontSize: cornerRank, fontWeight: 800, fontFamily: 'Georgia, serif' }}>{label}</div>
        <div style={{ fontSize: cornerSuit, marginTop: 1 }}>{symbol}</div>
      </div>

      {/* Centre symbol */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: centerSuit, color, lineHeight: 1,
        pointerEvents: 'none',
      }}>
        {symbol}
      </div>

      {/* Bottom-right corner (rotated 180°) */}
      <div style={{
        position: 'absolute', bottom: pad, right: pad,
        lineHeight: 1, color, textAlign: 'center',
        transform: 'rotate(180deg)',
      }}>
        <div style={{ fontSize: cornerRank, fontWeight: 800, fontFamily: 'Georgia, serif' }}>{label}</div>
        <div style={{ fontSize: cornerSuit, marginTop: 1 }}>{symbol}</div>
      </div>
    </div>
  )
}

function EmptySlot({ width = 72, onClick }: { width?: number; height?: number; onClick?: () => void }) {
  const height = Math.round(width * 1.4)     // same ratio as CardFace
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width, height, borderRadius: 8, flexShrink: 0,
        border: `2px dashed ${hov ? C.accent : 'rgba(0,229,255,0.25)'}`,
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

function CardSlot({ card, onClick, onClear, width = 72, height = 104 }: {
  card: string | null; onClick: () => void; onClear?: () => void; width?: number; height?: number
}) {
  return card
    ? (
      <div onClick={onClick} style={{ cursor: 'pointer', position: 'relative', display: 'inline-block' }} title="Click to change">
        <CardFace card={card} width={width} height={height} />
        <div
          onClick={e => { e.stopPropagation(); onClear?.() }}
          title="Remove card"
          style={{
            position: 'absolute', top: 2, right: 2,
            width: 16, height: 16, borderRadius: '50%',
            background: 'rgba(226,75,74,0.85)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, color: '#fff', cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
            zIndex: 2,
          }}
        >✕</div>
      </div>
    )
    : <EmptySlot width={width} height={height} onClick={onClick} />
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function decisionColor(d: string): string {
  return d === 'fold' ? C.danger : d === 'check' ? '#9ca3af' : C.accent
}

function equityColor(eq: number): string {
  if (eq > 60) return '#4ade80'
  if (eq >= 40) return '#fb923c'
  return '#f87171'
}

// ─── Card Picker ──────────────────────────────────────────────────────────────

function CardPicker({
  used,
  onSelect,
  onClose,
}: {
  used: Set<string>
  onSelect: (card: string) => void
  onClose: () => void
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0d0d1a',
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: '22px 26px 24px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,229,255,0.06)',
          minWidth: 620,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ color: C.text, fontFamily: C.font, fontWeight: 700, fontSize: 17 }}>Select a Card</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>Grey cards are already in play</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`,
              borderRadius: 8, color: C.muted, cursor: 'pointer',
              fontSize: 14, width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
          >✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '36px repeat(13, 1fr)', gap: '4px 6px', marginBottom: 4, paddingLeft: 2 }}>
          <div />
          {RANKS.map(r => (
            <div key={r} style={{ textAlign: 'center', fontSize: 11, color: '#6b7280', fontFamily: C.font, fontWeight: 700, letterSpacing: 0.5 }}>{RANK_DISPLAY[r] ?? r}</div>
          ))}
        </div>

        {SUITS.map(suit => {
          const isRed = suit === 'h' || suit === 'd'
          const suitColor = isRed ? '#e53535' : '#c8d0e0'
          return (
            <div key={suit} style={{ display: 'grid', gridTemplateColumns: '36px repeat(13, 1fr)', gap: '4px 6px', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: suitColor, lineHeight: 1 }}>
                {SUIT_GLYPH[suit]}
              </div>
              {RANKS.map(rank => {
                const card = rank + suit
                const isUsed = used.has(card)
                return (
                  <button
                    key={card}
                    disabled={isUsed}
                    onClick={() => onSelect(card)}
                    title={`${rank} of ${SUIT_NAME[suit]}`}
                    style={{
                      height: 52, borderRadius: 6,
                      border: isUsed ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.15)',
                      background: isUsed
                        ? 'rgba(255,255,255,0.03)'
                        : isRed
                          ? 'linear-gradient(160deg, #ffffff 0%, #fff5f5 100%)'
                          : 'linear-gradient(160deg, #ffffff 0%, #f5f8ff 100%)',
                      opacity: isUsed ? 0.35 : 1,
                      cursor: isUsed ? 'not-allowed' : 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: 1, padding: 0,
                      boxShadow: isUsed ? 'none' : '0 2px 8px rgba(0,0,0,0.5)',
                      transition: 'transform 0.1s, box-shadow 0.1s',
                      position: 'relative',
                    }}
                    onMouseEnter={(e) => {
                      if (!isUsed) {
                        const el = e.currentTarget as HTMLElement
                        el.style.transform = 'translateY(-2px) scale(1.06)'
                        el.style.boxShadow = `0 6px 16px rgba(0,0,0,0.5), 0 0 0 1px ${isRed ? 'rgba(229,53,53,0.4)' : 'rgba(0,229,255,0.3)'}`
                      }
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLElement
                      el.style.transform = 'none'
                      el.style.boxShadow = isUsed ? 'none' : '0 2px 8px rgba(0,0,0,0.5)'
                    }}
                  >
                    <span style={{ fontSize: rank === 'T' ? 9 : 11, fontWeight: 800, color: isUsed ? '#555' : SUIT_COLOR[suit], lineHeight: 1, fontFamily: 'Georgia, serif' }}>{RANK_DISPLAY[rank] ?? rank}</span>
                    <span style={{ fontSize: 14, color: isUsed ? '#444' : suitColor, lineHeight: 1 }}>{SUIT_GLYPH[suit]}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Misc badges & bars ───────────────────────────────────────────────────────

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
    'Range Chart': { label: 'Range Chart', color: '#0070ff', bg: 'rgba(0,112,255,0.1)' },
    'Hard Rule': { label: 'Custom Rule', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
    'Personality': { label: 'Personality', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
    'Position Override': { label: 'Position Override', color: C.accent, bg: C.accentDim },
  }
  const s = map[source] ?? map['Personality']
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
      color: s.color, background: s.bg, border: `1px solid ${s.color}33`,
    }}>{s.label}</span>
  )
}

function ActionBar({ label, pct, isActive, disabled }: { label: string; pct: number; isActive: boolean; disabled?: boolean }) {
  const barColor =
    label === 'Fold'  ? 'linear-gradient(90deg, #e24b4a, #f87171)' :
    label === 'Check' ? 'linear-gradient(90deg, #6b7280, #9ca3af)' :
    label === 'Call'  ? 'linear-gradient(90deg, #1d9e75, #34d399)' :
                        'linear-gradient(90deg, #00e5ff, #0070ff)'
  const glowColor =
    label === 'Fold'  ? '#e24b4a' :
    label === 'Check' ? '#6b7280' :
    label === 'Call'  ? '#1d9e75' : '#00e5ff'
  const [shown, setShown] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 50)
    return () => clearTimeout(t)
  }, [])

  if (disabled) {
    return (
      <div style={{ marginBottom: 10, opacity: 0.35 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: C.muted, fontFamily: C.font, textDecoration: 'line-through' }}>
            {label}
            <span style={{ marginLeft: 6, fontSize: 9, color: C.muted, fontWeight: 700, letterSpacing: 0.8, textDecoration: 'none' }}>N/A (free action)</span>
          </span>
          <span style={{ fontSize: 13, color: C.muted, fontFamily: C.font, fontWeight: 700 }}>—</span>
        </div>
        <div style={{ height: 7, background: 'rgba(255,255,255,0.04)', borderRadius: 4 }} />
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: isActive ? C.text : C.muted, fontFamily: C.font, fontWeight: isActive ? 700 : 400 }}>
          {label}
          {isActive && <span style={{ marginLeft: 6, fontSize: 9, color: glowColor, fontWeight: 700, letterSpacing: 1 }}>◉ PRIMARY</span>}
        </span>
        <span style={{ fontSize: 13, color: isActive ? glowColor : C.muted, fontFamily: C.font, fontWeight: 700 }}>
          {pct}%
        </span>
      </div>
      <div style={{ height: 7, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }} ref={ref}>
        <div style={{
          height: '100%', borderRadius: 4,
          background: barColor,
          width: shown ? `${pct}%` : '0%',
          transition: 'width 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
          opacity: isActive ? 1 : 0.35,
          boxShadow: isActive ? `0 0 8px ${glowColor}80` : 'none',
        }} />
      </div>
    </div>
  )
}

// ─── Recent Scenarios ─────────────────────────────────────────────────────────

function RecentScenarios({
  history,
  currentBotId,
  onRestore,
  onDelete,
  onClear,
}: {
  history: ScenarioHistoryItem[]
  currentBotId: string
  onRestore: (item: ScenarioHistoryItem) => void
  onDelete: (id: string) => void
  onClear: () => void
}) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const displayed = showAll || !currentBotId
    ? history
    : history.filter(h => h.botId === currentBotId)

  return (
    <div style={{ ...panel, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' }}>
          Recent Scenarios
        </span>
        <button
          onClick={() => setShowAll(v => !v)}
          title={showAll ? 'Showing all bots' : 'Showing current bot only'}
          style={{
            background: showAll ? 'rgba(0,229,255,0.1)' : 'none',
            border: `1px solid ${showAll ? C.accent : C.border}`,
            borderRadius: 4, color: showAll ? C.accent : C.muted,
            cursor: 'pointer', fontSize: 10, fontFamily: C.font,
            padding: '2px 8px', fontWeight: 600, letterSpacing: 0.3,
            transition: 'all 0.15s',
          }}
        >
          {showAll ? 'All Bots' : 'My Bot'}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {displayed.length === 0 ? (
          <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: 12, color: '#3f3f46', lineHeight: 1.6 }}>
            {history.length > 0 && !showAll
              ? <>No runs for this bot yet.<br /><span style={{ color: '#52525b' }}>Toggle "All Bots" to see others.</span></>
              : <>No history yet.<br />Run an analysis to save here.</>
            }
          </div>
        ) : (
          displayed.map(item => (
            <div
              key={item.id}
              onMouseEnter={() => setHoverId(item.id)}
              onMouseLeave={() => setHoverId(null)}
              style={{
                padding: '10px 16px',
                borderBottom: `1px solid ${C.border}`,
                cursor: 'pointer',
                background: hoverId === item.id ? 'rgba(0,229,255,0.04)' : 'transparent',
                transition: 'background 0.1s',
                position: 'relative',
              }}
              onClick={() => onRestore(item)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>
                  {item.label}
                </div>
                {item.decision && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: 8, flexShrink: 0 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase',
                      color: decisionColor(item.decision), whiteSpace: 'nowrap',
                    }}>
                      {item.decision === 'all_in' ? 'ALL IN' : item.decision.toUpperCase()}
                    </span>
                    {item.equity != null && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: equityColor(item.equity),
                        whiteSpace: 'nowrap', marginTop: 1,
                      }}>
                        Eq: {item.equity.toFixed(0)}%
                      </span>
                    )}
                  </div>
                )}
              </div>
              {showAll && (
                <div style={{ fontSize: 10, color: C.accent, marginBottom: 1 }}>
                  {item.botName}
                </div>
              )}
              <div style={{ fontSize: 10, color: '#52525b' }}>
                {relativeTime(item.timestamp)}
              </div>
              {hoverId === item.id && (
                <button
                  onClick={e => { e.stopPropagation(); onDelete(item.id) }}
                  style={{
                    position: 'absolute', top: 10, right: 10,
                    background: 'rgba(226,75,74,0.15)', border: 'none',
                    color: C.danger, cursor: 'pointer',
                    width: 20, height: 20, borderRadius: 4,
                    fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 0,
                  }}
                  title="Delete"
                >✕</button>
              )}
            </div>
          ))
        )}
      </div>
      {history.length > 0 && (
        <button
          onClick={onClear}
          style={{
            margin: '8px 16px', padding: '5px 0',
            background: 'none', border: `1px solid rgba(226,75,74,0.25)`,
            borderRadius: 6, color: '#52525b', cursor: 'pointer',
            fontSize: 11, fontFamily: C.font,
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = C.danger }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#52525b' }}
        >
          Clear All
        </button>
      )}
    </div>
  )
}

// ─── Poker Table SVG ─────────────────────────────────────────────────────────

const TABLE_POSITIONS = ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'HJ', 'CO'] as const

// Standard Texas Hold'em action orders (full 7-seat sequences).
// Filtered to active seats at runtime to find the immediate predecessor of the bot.
const PREFLOP_ACTION_ORDER = ['UTG', 'UTG+1', 'HJ', 'CO', 'BTN', 'SB', 'BB']
const POSTFLOP_ACTION_ORDER = ['SB', 'BB', 'UTG', 'UTG+1', 'HJ', 'CO', 'BTN']

/**
 * Returns the seat immediately before `botPos` in action order —
 * i.e. the opponent who just acted and whose badge we want to show.
 */
function prevActorPosition(botPos: string, activeSeats: string[], isPreflop: boolean): string | null {
  const full = isPreflop ? PREFLOP_ACTION_ORDER : POSTFLOP_ACTION_ORDER
  const order = full.filter(s => activeSeats.includes(s))
  const idx = order.indexOf(botPos)
  if (idx < 0 || order.length < 2) return null
  return order[(idx - 1 + order.length) % order.length]
}

// Seat angles: 0° = top, clockwise
const POSITION_ANGLES: Record<string, number> = {
  BTN: 175,
  SB: 220,
  BB: 265,
  'UTG': 310,
  'UTG+1': 345,
  'HJ': 25,
  'CO': 80,
}

function PokerTableScene({
  cards,
  pot,
  position,
  numberOfPlayers,
  botStack,
  opponentStack,
  lastAction,
  toCall,
}: {
  cards: Record<Slot, string | null>
  pot: number
  position: string
  numberOfPlayers: number
  botStack: number
  opponentStack: number
  lastAction: LastAction
  toCall: number
}) {
  const communityCards = [cards.board0, cards.board1, cards.board2, cards.board3, cards.board4]
  const filledCommunityCards = communityCards.filter(Boolean) as string[]
  const allSeats = [...TABLE_POSITIONS]
  const activeSeats = allSeats.slice(0, Math.max(2, Math.min(numberOfPlayers, 7)))

  // The seat that acted last = immediate clockwise predecessor of the bot.
  // Preflop: UTG→…→BTN→SB→BB; Postflop: SB→BB→UTG→…→BTN
  const isPreflop = filledCommunityCards.length === 0
  const lastActedPosition = prevActorPosition(position, activeSeats, isPreflop)

  // Badge label for that seat
  const badgeText = lastAction === 'check' ? 'CHECK'
    : lastAction === 'bet' ? `BET ${toCall}`
    : lastAction === 'raise' ? `RAISE ${toCall}`
    : 'ALL-IN'

  // SVG viewBox: 800×400, table center 400,200
  // Exact spec dimensions: outer rail rx=380/ry=180, felt rx=350/ry=150, inner dashed rx=300/ry=120
  const CX = 400, CY = 200
  // Seat placement orbit — kept within the 800×400 viewBox so no circle clips at edges.
  // ORBIT_RX≤376 keeps CO (80°) at x≤770; ORBIT_RY≤172 keeps BTN (175°) at y≤370.
  const ORBIT_RX = 365, ORBIT_RY = 165

  function seatXY(pos: string): [number, number] {
    const angle = (POSITION_ANGLES[pos] ?? 0) * (Math.PI / 180)
    return [
      CX + ORBIT_RX * Math.sin(angle),
      CY - ORBIT_RY * Math.cos(angle),
    ]
  }

  // SVG-space (0–800, 0–400) → % of outer wrapper
  function toP(x: number, y: number) {
    return { left: `${(x / 800) * 100}%`, top: `${(y / 400) * 100}%` }
  }

  return (
    // Exact PokerTable spec: max-w-[850px], aspect-[16/8], p-6, mx-auto
    <div style={{
      position: 'relative',
      width: '100%',
      maxWidth: 1100,
      aspectRatio: '16/8',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      margin: '0 auto',
      overflow: 'visible',
    }}>
      {/* SVG felt — exact spec ellipses */}
      <svg
        viewBox="0 0 800 400"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          filter: 'drop-shadow(0 0 40px rgba(0,255,255,0.1))',
        }}
      >
        <defs>
          <radialGradient id="tableFelt" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1a4d3e" />
            <stop offset="100%" stopColor="#0d261f" />
          </radialGradient>
        </defs>
        {/* Outer rail */}
        <ellipse cx="400" cy="200" rx="380" ry="180" fill="#222" stroke="#444" strokeWidth="8" />
        {/* Felt */}
        <ellipse cx="400" cy="200" rx="350" ry="150" fill="url(#tableFelt)" stroke="#1a4d3e" strokeWidth="2" />
        {/* Inner dashed ring */}
        <ellipse cx="400" cy="200" rx="300" ry="120" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="10 5" />
      </svg>

      {/* Children layer: pot label + community cards — centered on felt */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        pointerEvents: 'none',
      }}>
        {pot > 0 && (
          <div style={{
            fontSize: 12,
            color: '#ffd700',
            fontWeight: 700,
            letterSpacing: 1.5,
            textShadow: '0 0 16px rgba(255,215,0,0.7), 0 0 32px rgba(255,215,0,0.3)',
          }}>
            POT: {pot}
          </div>
        )}
        {/* Community cards — only show placed cards, no empty placeholders on felt */}
        {filledCommunityCards.length > 0 && (
          <div style={{ display: 'flex', gap: 5 }}>
            {filledCommunityCards.map((card, i) => (
              <CardFace key={i} card={card} width={52} />
            ))}
          </div>
        )}
      </div>

      {/* Seats — positioned on the rail rim */}
      {activeSeats.map(pos => {
        const [sx, sy] = seatXY(pos)
        const isBot = pos === position
        const { left, top } = toP(sx, sy)
        const chips = isBot ? botStack : opponentStack
        const chipsLabel = chips.toLocaleString()
        return (
          <div
            key={pos}
            style={{
              position: 'absolute',
              left,
              top,
              transform: 'translate(-50%, -50%)',
              zIndex: 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
          >
            {/* Action badge — part of flex column flow, sits above the seat circle */}
            <div style={{ height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {pos === lastActedPosition && (
                <div style={{
                  background: 'rgba(0,229,255,0.15)',
                  border: '1px solid rgba(0,229,255,0.55)',
                  borderRadius: 10,
                  padding: '1px 6px',
                  fontSize: 7,
                  fontWeight: 800,
                  color: C.accent,
                  whiteSpace: 'nowrap',
                  letterSpacing: 0.8,
                  pointerEvents: 'none',
                  textShadow: `0 0 8px ${C.accent}80`,
                }}>
                  {badgeText}
                </div>
              )}
            </div>
            {/* Seat circle */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: isBot ? C.accent : 'rgba(15,15,20,0.85)',
              border: `2px solid ${isBot ? C.accent : 'rgba(255,255,255,0.18)'}`,
              boxShadow: isBot
                ? `0 0 0 3px rgba(0,229,255,0.25), 0 0 18px ${C.accent}90`
                : '0 2px 8px rgba(0,0,0,0.6)',
              fontSize: 8,
              fontWeight: 800,
              fontFamily: C.font,
              color: isBot ? '#000' : 'rgba(255,255,255,0.65)',
              letterSpacing: 0.3,
              textTransform: 'uppercase' as const,
              backdropFilter: 'blur(4px)',
              position: 'relative',
            }}>
              {pos.length > 4 ? pos.slice(0, 4) : pos}
              {/* Card-back icons for opponents */}
              {!isBot && (
                <div style={{
                  position: 'absolute',
                  left: '100%',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  marginLeft: 4,
                  display: 'flex',
                  gap: 2,
                }}>
                  {[0, 1].map(i => (
                    <div key={i} style={{
                      width: 10,
                      height: 14,
                      borderRadius: 2,
                      background: 'rgba(50,55,75,0.9)',
                      border: '1px solid rgba(0,229,255,0.35)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                    }} />
                  ))}
                </div>
              )}
            </div>
            {/* Chip count label */}
            <div style={{
              fontSize: 8,
              fontFamily: 'monospace',
              fontWeight: 700,
              color: isBot ? C.accent : 'rgba(255,255,255,0.45)',
              letterSpacing: 0.2,
              whiteSpace: 'nowrap',
              textShadow: isBot ? `0 0 8px ${C.accent}60` : 'none',
            }}>
              {chipsLabel}
            </div>
          </div>
        )
      })}

      {/* Bot hole cards: placed inward from the seat toward the table center.
          Top-arc seats (HJ/UTG+1/UTG, by < CY-50) need a larger factor (0.40)
          because their chip count label sits below the seat circle pointing
          toward the center — right in the card path at 0.28.
          Side/bottom seats (BB, CO, BTN, SB) use 0.28 to stay near the seat. */}
      {(() => {
        const h0 = cards.hand0, h1 = cards.hand1
        if (!h0 && !h1) return null
        const [bx, by] = seatXY(position)
        const inwardFactor = by < CY - 50 ? 0.40 : 0.28
        const { left, top } = toP(
          bx + (CX - bx) * inwardFactor,
          by + (CY - by) * inwardFactor,
        )
        return (
          <div style={{
            position: 'absolute',
            left,
            top,
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            gap: 3,
            zIndex: 21,
          }}>
            {[h0, h1].map((card, i) =>
              card
                ? <CardFace key={i} card={card} width={44} />
                : (
                  <div key={i} style={{
                    width: 44, height: Math.round(44 * 1.4), borderRadius: 5,
                    border: '1px dashed rgba(0,229,255,0.3)',
                    background: 'rgba(0,229,255,0.04)',
                  }} />
                )
            )}
          </div>
        )
      })()}
    </div>
  )
}

const POSITIONS = ['UTG', 'UTG+1', 'HJ', 'CO', 'BTN', 'SB', 'BB']

const SCENARIO_STATE_KEY = 'scenario_lab_state'

function getSavedScenarioState(): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem(SCENARIO_STATE_KEY) ?? '{}') } catch { return {} }
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ScenarioLabPage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [selectedBotId, setSelectedBotId] = useState<string>(() => localStorage.getItem('scenario_lab_bot_id') ?? '')
  const [cards, setCards] = useState<Record<Slot, string | null>>(() => {
    const s = getSavedScenarioState()
    return (s.cards as Record<Slot, string | null>) ?? {
      board0: null, board1: null, board2: null, board3: null, board4: null,
      hand0: null, hand1: null,
    }
  })
  const [pot, setPot] = useState<number>(() => (getSavedScenarioState().pot as number) ?? 100)
  const [toCall, setToCall] = useState<number>(() => (getSavedScenarioState().toCall as number) ?? 20)
  const [minRaise, setMinRaise] = useState<number>(() => (getSavedScenarioState().minRaise as number) ?? 40)
  const [numberOfPlayers, setNumberOfPlayers] = useState<number>(() => (getSavedScenarioState().numberOfPlayers as number) ?? 6)
  const [position, setPosition] = useState<string>(() => (getSavedScenarioState().position as string) ?? 'BTN')
  const [currentAction, setCurrentAction] = useState<string>(() => (getSavedScenarioState().currentAction as string) ?? '')
  const [botStack, setBotStack] = useState<number>(() => (getSavedScenarioState().botStack as number) ?? 1000)
  const [avgOpponentStack, setAvgOpponentStack] = useState<number>(() => (getSavedScenarioState().avgOpponentStack as number) ?? 1000)
  const [bigBlind, setBigBlind] = useState<number>(() => (getSavedScenarioState().bigBlind as number) ?? 10)
  const [lastAction, setLastAction] = useState<LastAction>(() => (getSavedScenarioState().lastAction as LastAction) ?? 'bet')
  const [pickerSlot, setPickerSlot] = useState<Slot | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScenarioResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<ScenarioHistoryItem[]>(() => loadHistory())
  const [advancedMode, setAdvancedMode] = useState<boolean>(() => {
    const s = getSavedScenarioState()
    return typeof s.advancedMode === 'boolean' ? s.advancedMode : false
  })
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    localStorage.setItem(SCENARIO_STATE_KEY, JSON.stringify(
      { cards, pot, toCall, minRaise, numberOfPlayers, position, currentAction, botStack, avgOpponentStack, bigBlind, lastAction, advancedMode }
    ))
  }, [cards, pot, toCall, minRaise, numberOfPlayers, position, currentAction, botStack, avgOpponentStack, bigBlind, lastAction, advancedMode])

  // Constraints between lastAction and toCall:
  //   'check'              → toCall must be 0
  //   'bet'/'raise'/'all_in' → toCall must be > 0; if currently 0, snap to bigBlind
  useEffect(() => {
    if (lastAction === 'check' && toCall !== 0) {
      setToCall(0)
      setResult(null)
    } else if (lastAction !== 'check' && toCall === 0) {
      setToCall(bigBlind)
      setResult(null)
    }
  }, [lastAction, toCall, bigBlind])

  // Collapse advanced details when switching back to Simple mode
  useEffect(() => {
    if (!advancedMode) setShowAdvanced(false)
  }, [advancedMode])

  useEffect(() => {
    api.get('/bots/my?limit=50').then(r => {
      const items: Bot[] = r.data?.data ?? r.data?.bots ?? r.data ?? []
      setBots(items)
      setSelectedBotId(prev => {
        const savedExists = items.some(b => b.id === prev)
        if (savedExists) return prev
        return items.length > 0 ? items[0].id : ''
      })
    }).catch(() => {})
  }, [])

  const usedCards = new Set(Object.values(cards).filter(Boolean) as string[])

  function selectCard(card: string) {
    if (pickerSlot === null) return
    setCards(prev => ({ ...prev, [pickerSlot]: card }))
    setPickerSlot(null)
    setResult(null)
  }

  function restoreScenario(item: ScenarioHistoryItem) {
    const s = item.formState
    setCards(s.cards)
    setPot(s.pot)
    setToCall(s.toCall)
    setMinRaise(s.minRaise)
    setNumberOfPlayers(s.numberOfPlayers)
    setPosition(s.position)
    setCurrentAction(s.currentAction)
    setBotStack(s.botStack ?? 1000)
    setAvgOpponentStack(s.avgOpponentStack ?? 1000)
    setBigBlind(s.bigBlind ?? 10)
    setSelectedBotId(item.botId)
    localStorage.setItem('scenario_lab_bot_id', item.botId)
    setResult(null)
    setError(null)
  }

  function deleteHistoryItem(id: string) {
    setHistory(prev => {
      const next = prev.filter(h => h.id !== id)
      saveHistory(next)
      return next
    })
  }

  function clearHistory() {
    setHistory([])
    saveHistory([])
  }

  const potOdds = toCall > 0 ? Math.round((toCall / (pot + toCall)) * 100) : 0
  const spr: number | null = pot > 0 ? botStack / pot : null
  const myStackBB = botStack / bigBlind

  // Real Monte Carlo equity from backend (0–100 with 1 decimal), or 0 while pending
  const winChance = result?.equity ?? 0

  const communityCardsForStreet = [cards.board0, cards.board1, cards.board2, cards.board3, cards.board4]
    .filter(Boolean) as string[]
  const isPostFlop = communityCardsForStreet.length >= 3

  const resultCache = useRef<Map<string, ScenarioResult>>(new Map())

  function buildScenarioKey(): string {
    return JSON.stringify({
      botId: selectedBotId,
      holeCards: [cards.hand0, cards.hand1],
      communityCards: communityCardsForStreet,
      position, pot, toCall, minRaise, numberOfPlayers,
      currentAction: currentAction || '',
      botStack, avgOpponentStack, bigBlind,
    })
  }

  async function analyze() {
    if (!selectedBotId) { setError('Select a bot first.'); return }
    if (!cards.hand0 || !cards.hand1) { setError("Set your bot's hand (both cards)."); return }
    const validCounts = [0, 3, 4, 5]
    if (!validCounts.includes(communityCardsForStreet.length)) {
      setError(`Board must have 0, 3, 4, or 5 cards. Currently ${communityCardsForStreet.length}.`)
      return
    }
    if (lastAction !== 'check' && toCall === 0) {
      setError(`Last action is "${LAST_ACTION_LABELS[lastAction]}" but Price to Call is 0. Set a bet amount or switch Last Action to "Check".`)
      return
    }

    const cacheKey = buildScenarioKey()
    const cached = resultCache.current.get(cacheKey)
    if (cached) {
      setError(null)
      setResult(cached)
      return
    }

    setError(null)
    setLoading(true)
    setResult(null)
    try {
      const res = await api.post(`/bots/${selectedBotId}/scenario`, {
        holeCards: [cards.hand0, cards.hand1],
        communityCards: communityCardsForStreet,
        position,
        pot,
        toCall,
        minRaise,
        numberOfPlayers,
        currentAction: currentAction || undefined,
        botStack,
        avgOpponentStack,
        bigBlind,
      })
      resultCache.current.set(cacheKey, res.data)
      if (resultCache.current.size > 20) {
        const firstKey = resultCache.current.keys().next().value
        if (firstKey !== undefined) resultCache.current.delete(firstKey)
      }

      const selectedBot = bots.find(b => b.id === selectedBotId)
      const historyItem: ScenarioHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        botId: selectedBotId,
        botName: selectedBot?.name ?? 'Unknown Bot',
        label: buildLabel(cards, position, currentAction),
        formState: { cards, pot, toCall, minRaise, numberOfPlayers, position, currentAction, botStack, avgOpponentStack, bigBlind, lastAction },
        decision: res.data.primaryAction.type,
        equity: res.data.equity,
      }
      setHistory(prev => {
        const next = [historyItem, ...prev].slice(0, HISTORY_MAX)
        saveHistory(next)
        return next
      })

      setResult(res.data)
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Analysis failed.')
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

  const actionRgb =
    actionType === 'fold' ? '226,75,74' :
    actionType === 'check' ? '107,114,128' :
    '0,229,255'

  const nudgeLabel =
    result?.source === 'Personality' ? 'Personality nudge' :
    result?.source === 'Range Chart' ? 'Range Chart' :
    result?.source === 'Hard Rule' ? 'Hard Rule override' :
    result?.source === 'Position Override' ? 'Position override' : ''

  const selectedBotDna = selectedBot?.strategy?.personality ?? undefined
  const naturalReasoning = result
    ? toNaturalLanguage(result.explanation, result.source, result, { toCall, pot, position, winChance, spr, myStackBB, lastAction }, selectedBotDna)
    : null

  // In Simple Mode, trim reasoning to the first sentence for a clean TV-broadcast feel
  const displayReasoning = advancedMode
    ? naturalReasoning
    : (naturalReasoning?.match(/^[^.!?]+[.!?]/)?.[0]?.trim() ?? naturalReasoning)

  const sanityWarning = result ? checkSanityWarning(result, toCall) : null

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '6px 10px',
    background: '#09090b', border: `1px solid ${C.border}`, borderRadius: 6,
    color: C.text, fontFamily: C.font, fontSize: 13,
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10, color: C.muted, marginBottom: 4, display: 'flex', alignItems: 'center',
    letterSpacing: 0.3, textTransform: 'uppercase',
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.bg, fontFamily: C.font, overflow: 'hidden' }}>
      <Sidebar />

      {pickerSlot !== null && (
        <CardPicker
          used={usedCards}
          onSelect={selectCard}
          onClose={() => setPickerSlot(null)}
        />
      )}

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: '12px 16px', gap: 0, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18"/>
          </svg>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text, letterSpacing: 0.5 }}>
            Scenario <span style={{ color: C.accent }}>Lab</span>
            {advancedMode && (
              <span style={{ fontSize: 11, fontWeight: 400, color: C.muted, marginLeft: 8, letterSpacing: 0.5 }}>Engineering Station</span>
            )}
          </h1>
        </div>

        {/* Workstation — 3-col in Advanced, 2-col in Simple (history hidden) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: advancedMode ? '280px 1fr 240px' : '260px 1fr 240px',
          gap: 12,
          flex: 1,
          minHeight: 0,
        }}>

          {/* ── Col 1: The Setup ─────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, overflowY: 'auto', paddingRight: 2 }}>

            {/* Simple / Advanced segmented control */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 2 }}>
              <span style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Setup</span>

              {/* Segmented control */}
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  background: 'rgba(9,9,11,0.5)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  padding: 2,
                }}
              >
                {/* Sliding active pill */}
                <div
                  style={{
                    position: 'absolute',
                    top: 2, bottom: 2,
                    width: 'calc(50% - 2px)',
                    left: advancedMode ? 'calc(50%)' : '2px',
                    borderRadius: 6,
                    background: 'rgba(0,229,255,0.1)',
                    border: `1px solid ${C.accent}`,
                    boxShadow: '0 0 10px rgba(0,229,255,0.3), 0 0 22px rgba(0,229,255,0.1)',
                    transition: 'left 0.2s cubic-bezier(0.4,0,0.2,1)',
                    pointerEvents: 'none',
                  }}
                />

                {/* Simple option */}
                <button
                  onClick={() => setAdvancedMode(false)}
                  title="Switch to Simple Mode for a quick setup"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: 'transparent', border: 'none',
                    borderRadius: 6, padding: '4px 10px',
                    color: !advancedMode ? C.accent : C.muted,
                    fontSize: 11, fontFamily: C.font, fontWeight: 600,
                    cursor: 'pointer', letterSpacing: 0.3,
                    transition: 'color 0.2s', whiteSpace: 'nowrap',
                    position: 'relative', zIndex: 1,
                  }}
                >
                  <Lightbulb size={11} strokeWidth={2.2} />
                  Simple
                </button>

                {/* Advanced option */}
                <button
                  onClick={() => setAdvancedMode(true)}
                  title="Switch to Advanced Mode for deeper engine insights"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: 'transparent', border: 'none',
                    borderRadius: 6, padding: '4px 10px',
                    color: advancedMode ? C.accent : C.muted,
                    fontSize: 11, fontFamily: C.font, fontWeight: 600,
                    cursor: 'pointer', letterSpacing: 0.3,
                    transition: 'color 0.2s', whiteSpace: 'nowrap',
                    position: 'relative', zIndex: 1,
                  }}
                >
                  <Terminal size={11} strokeWidth={2.2} />
                  Advanced
                </button>
              </div>
            </div>

            {/* Bot Profile */}
            <div style={{ ...panel, padding: advancedMode ? '16px 20px' : '10px 14px' }}>
              {advancedMode && (
                <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Bot Profile</div>
              )}
              <CustomSelect
                value={selectedBotId}
                onChange={v => { localStorage.setItem('scenario_lab_bot_id', v); setSelectedBotId(v); setResult(null) }}
                options={bots.map(b => ({ value: b.id, label: b.name }))}
                placeholder="— Select a bot —"
                style={{ width: '100%' }}
                size="sm"
              />
              {advancedMode && selectedBot && (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 11, color: C.muted }}>Tier:</span>
                  <TierBadge tier={selectedBot.strategy?.tier} />
                </div>
              )}
            </div>

            {/* Cards — 2-col grid: Your Hand | Table Cards */}
            {advancedMode ? (
              /* ── Advanced mode: compact 2-col grid ── */
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {/* Your Hand */}
                <div style={{ ...panel, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Your Hand</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                    <CardSlot card={cards.hand0} onClick={() => setPickerSlot('hand0')} onClear={() => { setCards(prev => ({ ...prev, hand0: null })); setResult(null) }} width={52} height={74} />
                    <CardSlot card={cards.hand1} onClick={() => setPickerSlot('hand1')} onClear={() => { setCards(prev => ({ ...prev, hand1: null })); setResult(null) }} width={52} height={74} />
                  </div>
                </div>
                {/* Table Cards */}
                <div style={{ ...panel, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Table Cards</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {([0, 1, 2, 3] as const).map(i => (
                      <CardSlot key={i} card={cards[`board${i}` as Slot]} onClick={() => setPickerSlot(`board${i}` as Slot)} onClear={() => { setCards(prev => ({ ...prev, [`board${i}`]: null })); setResult(null) }} width={44} height={62} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
                    <CardSlot card={cards.board4} onClick={() => setPickerSlot('board4')} onClear={() => { setCards(prev => ({ ...prev, board4: null })); setResult(null) }} width={44} height={62} />
                  </div>
                  {isPostFlop && selectedBot?.strategy?.tier === 'pro' && (
                    <div style={{ marginTop: 8, padding: '4px 7px', borderRadius: 5, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', fontSize: 9, color: '#d4a042', lineHeight: 1.4 }}>
                      Post-flop: rules & personality decide.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ── Simple mode: full-width cinematic card layout ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Your Hand — large side-by-side */}
                <div style={{
                  ...panel,
                  padding: '16px 20px',
                  background: 'rgba(24,24,27,0.92)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12, textAlign: 'center' }}>Your Hand</div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 14 }}>
                    <CardSlot card={cards.hand0} onClick={() => setPickerSlot('hand0')} onClear={() => { setCards(prev => ({ ...prev, hand0: null })); setResult(null) }} width={72} height={102} />
                    <CardSlot card={cards.hand1} onClick={() => setPickerSlot('hand1')} onClear={() => { setCards(prev => ({ ...prev, hand1: null })); setResult(null) }} width={72} height={102} />
                  </div>
                </div>
                {/* Board Cards — horizontal row */}
                <div style={{
                  ...panel,
                  padding: '16px 20px',
                  background: 'rgba(24,24,27,0.92)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12, textAlign: 'center' }}>Board</div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {([0, 1, 2, 3, 4] as const).map(i => (
                      <CardSlot key={i} card={cards[`board${i}` as Slot]} onClick={() => setPickerSlot(`board${i}` as Slot)} onClear={() => { setCards(prev => ({ ...prev, [`board${i}`]: null })); setResult(null) }} width={50} height={70} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Simple Mode: Situation Context Label */}
            {!advancedMode && (
              <div style={{ ...panel, textAlign: 'center', padding: '12px 16px' }}>
                <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Situation</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                  {lastAction === 'check'
                    ? 'Opponent Checked'
                    : lastAction === 'all_in'
                    ? `Opponent Is All-In${toCall > 0 ? ` (${toCall} to call)` : ''}`
                    : lastAction === 'bet'
                    ? `Facing a Bet${toCall > 0 ? ` of ${toCall}` : ''}`
                    : `Facing a Raise${toCall > 0 ? ` of ${toCall}` : ''}`}
                </div>
                <div style={{ fontSize: 12, color: C.accent, marginTop: 5, fontWeight: 600, letterSpacing: 0.5 }}>
                  Position: {position}
                </div>
              </div>
            )}

            {/* ── Controls: simple compact strip OR full game state ── */}
            {!advancedMode ? (
              /* ── Simple mode: Last Action + Amount + Position only ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                {/* Last Action pill row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                  {LAST_ACTIONS.map(a => {
                    const isActive = lastAction === a
                    return (
                      <button
                        key={a}
                        onClick={() => {
                          setLastAction(a)
                          if (a === 'check') { setToCall(0) } else if (toCall === 0) { setToCall(bigBlind) }
                          setResult(null)
                        }}
                        style={{
                          padding: '7px 0', borderRadius: 7,
                          border: `1px solid ${isActive ? C.accent : C.border}`,
                          background: isActive ? 'rgba(0,229,255,0.12)' : 'rgba(24,24,27,0.7)',
                          color: isActive ? C.accent : C.muted,
                          fontSize: 11, fontWeight: 700, fontFamily: C.font,
                          cursor: 'pointer', transition: 'all 0.15s',
                          letterSpacing: 0.4,
                        }}
                      >
                        {LAST_ACTION_LABELS[a]}
                      </button>
                    )
                  })}
                </div>

                {/* Bet amount — only when facing a bet/raise/all-in */}
                {lastAction !== 'check' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Amount</span>
                    <input
                      type="number"
                      value={toCall}
                      min={1}
                      onChange={e => { setToCall(Number(e.target.value)); setResult(null) }}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  </div>
                )}

                {/* Position */}
                <CustomSelect
                  value={position}
                  onChange={v => { setPosition(v); setResult(null) }}
                  options={POSITIONS.map(p => ({ value: p, label: p }))}
                  size="sm"
                />
              </div>
            ) : (
              /* ── Advanced mode: full game state panel ── */
              <div style={panel}>
                <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Game State</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 10px' }}>

                {/* Stack inputs — advanced mode only */}
                {advancedMode && (
                  <div>
                    <div style={labelStyle}>
                      Your Stack
                      <InfoTooltip text="Your bot's chip stack. Used to compute SPR and short-stack thresholds." />
                    </div>
                    <input type="number" value={botStack} min={1}
                      onChange={e => { setBotStack(Number(e.target.value)); setResult(null) }}
                      style={inputStyle}
                    />
                  </div>
                )}

                {advancedMode && (
                  <div>
                    <div style={labelStyle}>
                      Opp Stack
                      <InfoTooltip text="Average opponent chip stack." />
                    </div>
                    <input type="number" value={avgOpponentStack} min={1}
                      onChange={e => { setAvgOpponentStack(Number(e.target.value)); setResult(null) }}
                      style={inputStyle}
                    />
                  </div>
                )}

                {/* SPR metric — advanced mode only */}
                {advancedMode && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={labelStyle}>
                      Stack-to-Pot Ratio (SPR)
                      <InfoTooltip text="Your stack divided by the pot. Low SPR = committed. High SPR = deep stack, more flexibility." />
                    </div>
                    {spr !== null ? (() => {
                      const isCommitted = spr < 2
                      const isLow = spr < 5
                      const isDeep = spr >= 13
                      const sprColor = isCommitted ? C.danger : isLow ? C.warn : isDeep ? C.success : C.accent
                      const sprBg = isCommitted ? 'rgba(226,75,74,0.08)' : isLow ? 'rgba(245,158,11,0.08)' : isDeep ? 'rgba(29,158,117,0.08)' : 'rgba(0,229,255,0.06)'
                      const sprLabel = isCommitted ? 'Committed' : isLow ? 'Low' : isDeep ? 'Deep' : 'Playable'
                      return (
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '6px 10px', borderRadius: 6,
                          border: `1px solid ${sprColor}33`,
                          background: sprBg,
                        }}>
                          <span style={{ fontSize: 18, fontWeight: 900, fontFamily: 'monospace', color: sprColor, textShadow: `0 0 12px ${sprColor}60` }}>
                            {spr.toFixed(1)}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: sprColor, letterSpacing: 1, textTransform: 'uppercase' }}>
                            {sprLabel}
                          </span>
                        </div>
                      )
                    })() : (
                      <div style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, fontSize: 12, color: C.muted }}>
                        — set pot to calculate
                      </div>
                    )}
                  </div>
                )}

                {/* Pot — advanced mode only */}
                {advancedMode && (
                  <div>
                    <div style={labelStyle}>Pot (chips)</div>
                    <input type="number" value={pot} min={0}
                      onChange={e => { setPot(Number(e.target.value)); setResult(null) }}
                      style={inputStyle}
                    />
                  </div>
                )}

                {/* Price to Call — advanced mode only */}
                {advancedMode && (
                  <div>
                    <div style={labelStyle}>
                      Price to Call
                      <InfoTooltip text="Chips your bot must pay to stay in. Set 0 if it can check for free." />
                      {lastAction === 'check' && (
                        <span style={{ marginLeft: 6, fontSize: 9, color: C.accent, fontWeight: 700, letterSpacing: 0.5 }}>LOCKED</span>
                      )}
                    </div>
                    <input
                      type="number"
                      value={toCall}
                      min={0}
                      readOnly={lastAction === 'check'}
                      onChange={e => { if (lastAction !== 'check') { setToCall(Number(e.target.value)); setResult(null) } }}
                      style={{
                        ...inputStyle,
                        opacity: lastAction === 'check' ? 0.5 : 1,
                        cursor: lastAction === 'check' ? 'not-allowed' : 'auto',
                      }}
                    />
                  </div>
                )}

                {advancedMode && (
                  <div>
                    <div style={labelStyle}>
                      Min Raise
                      <InfoTooltip text="Minimum total bet if the bot raises. Usually 2× the current bet." />
                    </div>
                    <input type="number" value={minRaise} min={0}
                      onChange={e => { setMinRaise(Number(e.target.value)); setResult(null) }}
                      style={inputStyle}
                    />
                  </div>
                )}

                {advancedMode && (
                  <div>
                    <div style={labelStyle}>Players</div>
                    <input type="number" value={numberOfPlayers} min={2} max={9}
                      onChange={e => { setNumberOfPlayers(Number(e.target.value)); setResult(null) }}
                      style={inputStyle}
                    />
                  </div>
                )}

                {advancedMode && (
                  <div>
                    <div style={labelStyle}>
                      Big Blind
                      <InfoTooltip text="The big blind chip value. Used to display stack depth in BB units." />
                    </div>
                    <input type="number" value={bigBlind} min={1}
                      onChange={e => { setBigBlind(Number(e.target.value)); setResult(null) }}
                      style={inputStyle}
                    />
                  </div>
                )}

                {advancedMode && (
                  <div>
                    <div style={labelStyle}>Stack Depth</div>
                    <div style={{
                      padding: '6px 10px', borderRadius: 6,
                      border: `1px solid ${C.border}`,
                      background: myStackBB < 15 ? 'rgba(226,75,74,0.06)' : C.bg,
                      fontSize: 13, fontWeight: 700, fontFamily: 'monospace',
                      color: myStackBB < 15 ? C.danger : myStackBB < 40 ? C.warn : C.success,
                    }}>
                      {myStackBB.toFixed(1)} BB
                    </div>
                  </div>
                )}

                {/* Last Action Taken */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={labelStyle}>
                    Last Action Taken
                    <InfoTooltip text="What your opponent did before it's your turn. 'Check' forces Price to Call = 0 and Fold becomes illegal." />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {LAST_ACTIONS.map(a => {
                      const isActive = lastAction === a
                      return (
                        <button
                          key={a}
                          onClick={() => {
                            setLastAction(a)
                            if (a === 'check') {
                              setToCall(0)
                            } else if (toCall === 0) {
                              // Switching away from check with no bet amount — default to big blind
                              setToCall(bigBlind)
                            }
                            setResult(null)
                          }}
                          style={{
                            padding: '5px 0',
                            borderRadius: 6,
                            border: `1px solid ${isActive ? C.accent : C.border}`,
                            background: isActive ? 'rgba(0,229,255,0.1)' : 'transparent',
                            color: isActive ? C.accent : C.muted,
                            fontSize: 11,
                            fontWeight: 600,
                            fontFamily: C.font,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          {LAST_ACTION_LABELS[a]}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={labelStyle}>Position</div>
                  <CustomSelect
                    value={position}
                    onChange={v => { setPosition(v); setResult(null) }}
                    options={POSITIONS.map(p => ({ value: p, label: p }))}
                    size="sm"
                  />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={labelStyle}>
                    Win vs. Price
                    <InfoTooltip text="% of pot you'd pay to call (toCall ÷ (pot + toCall)). Your win chance should exceed this to profit." />
                  </div>
                  <div style={{
                    padding: '6px 10px', borderRadius: 6,
                    border: `1px solid ${C.border}`,
                    background: potOdds > 0 ? 'rgba(0,245,255,0.04)' : C.bg,
                    fontSize: 13, fontWeight: 700,
                    color: potOdds === 0 ? C.muted : potOdds < 25 ? C.success : potOdds < 40 ? C.accent : C.danger,
                  }}>
                    {potOdds > 0 ? `${potOdds}% to call` : '— free check'}
                  </div>
                </div>

              </div>

              <div style={{ marginTop: 8 }}>
                <div style={labelStyle}>Situation (optional)</div>
                <input
                  type="text"
                  value={currentAction}
                  placeholder="e.g. Facing a 3-bet from UTG"
                  onChange={e => setCurrentAction(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
            )}

          </div>

          {/* ── Col 2: The Engine ─────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, overflowY: 'auto' }}>

            {/* Poker Table */}
            <div style={{ ...panel, padding: 10 }}>
              <PokerTableScene
                cards={cards}
                pot={pot}
                position={position}
                numberOfPlayers={numberOfPlayers}
                botStack={botStack}
                opponentStack={avgOpponentStack}
                lastAction={lastAction}
                toCall={toCall}
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{ fontSize: 12, color: C.danger, background: 'rgba(226,75,74,0.08)', border: `1px solid rgba(226,75,74,0.3)`, borderRadius: 8, padding: '8px 12px' }}>
                {error}
              </div>
            )}

            {/* Analyze Button */}
            <button
              onClick={analyze}
              disabled={loading}
              style={{
                padding: '14px 0', borderRadius: 10, border: 'none',
                background: loading ? 'rgba(0,229,255,0.12)' : 'linear-gradient(90deg, #00e5ff, #0070ff)',
                color: loading ? C.muted : '#000',
                fontFamily: C.font, fontWeight: 800, fontSize: 14, letterSpacing: 2,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'opacity 0.15s, box-shadow 0.15s',
                boxShadow: loading ? 'none' : '0 0 30px rgba(0,229,255,0.45), 0 0 60px rgba(0,229,255,0.2)',
                textTransform: 'uppercase' as const,
                flexShrink: 0,
              }}
              onMouseEnter={e => {
                if (!loading) (e.currentTarget as HTMLElement).style.boxShadow = '0 0 40px rgba(0,229,255,0.6), 0 0 80px rgba(0,229,255,0.3)'
              }}
              onMouseLeave={e => {
                if (!loading) (e.currentTarget as HTMLElement).style.boxShadow = '0 0 30px rgba(0,229,255,0.45), 0 0 60px rgba(0,229,255,0.2)'
              }}
            >
              {loading ? 'Thinking…' : 'Analyze Situation'}
            </button>

            {loading && (
              <div style={{ ...panel, textAlign: 'center', padding: '20px' }}>
                <div style={{ fontSize: 13, color: C.accent, letterSpacing: 1 }}>Evaluating strategy…</div>
              </div>
            )}

            {/* Results */}
            {result && !loading && (
              <>
                {/* The Wow Box: unified definitive decision panel */}
                <div style={{
                  ...panel,
                  border: `1px solid ${actionColor}40`,
                  background: `rgba(${actionRgb}, 0.04)`,
                  padding: '24px 20px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: 56, fontWeight: 900, letterSpacing: 5, color: actionColor,
                        textShadow: `0 0 40px ${actionColor}80, 0 0 80px ${actionColor}30`,
                        textTransform: 'uppercase', lineHeight: 1,
                      }}>
                        {actionType === 'all_in' ? 'ALL IN' : actionType}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                        {winChance > 0 && (
                          <span style={{
                            fontSize: 12, fontWeight: 700,
                            color: winChance > 50 ? C.success : C.warn,
                            background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '4px 10px',
                            border: `1px solid ${winChance > 50 ? 'rgba(29,158,117,0.3)' : 'rgba(245,158,11,0.3)'}`,
                          }}>
                            {!advancedMode ? `Win Chance: ${winChance.toFixed(1)}%` : `${winChance.toFixed(1)}% Equity`}
                          </span>
                        )}
                        {advancedMode && nudgeLabel && (
                          <span style={{
                            fontSize: 12, fontWeight: 600, color: C.muted,
                            background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '4px 10px',
                            border: `1px solid ${C.border}`,
                          }}>
                            {nudgeLabel}
                          </span>
                        )}
                        {advancedMode && toCall > 0 && (
                          <span style={{
                            fontSize: 12, fontWeight: 600,
                            color: potOdds < 25 ? C.success : potOdds < 40 ? C.accent : C.danger,
                            background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '4px 10px',
                            border: `1px solid ${potOdds < 25 ? 'rgba(29,158,117,0.3)' : potOdds < 40 ? 'rgba(0,229,255,0.3)' : 'rgba(226,75,74,0.3)'}`,
                          }}>
                            {potOdds}% Pot Odds
                          </span>
                        )}
                        {advancedMode && result.handNotation && (
                          <span style={{
                            fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: 'monospace',
                            background: C.accentDim, borderRadius: 8, padding: '4px 10px',
                            border: `1px solid rgba(0,229,255,0.2)`,
                          }}>
                            {result.handNotation}
                          </span>
                        )}
                      </div>
                    </div>
                    {advancedMode && (
                      <div style={{ flexShrink: 0, paddingTop: 4 }}>
                        <SourceBadge source={result.source} />
                      </div>
                    )}
                  </div>
                  {displayReasoning && (
                    <div style={{
                      marginTop: 20, padding: '14px 16px', borderRadius: 8,
                      background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.08)',
                    }}>
                      <p style={{ margin: 0, fontSize: 13, color: '#d4dae4', lineHeight: 1.75 }}>
                        {renderMarkdown(displayReasoning)}
                      </p>
                    </div>
                  )}
                </div>

                {advancedMode && sanityWarning && (
                  <div style={{
                    background: 'rgba(245,158,11,0.08)', border: `1px solid rgba(245,158,11,0.35)`,
                    borderRadius: 10, padding: '12px 14px',
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                  }}>
                    <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>⚠</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.warn, marginBottom: 3 }}>Logic Warning</div>
                      <div style={{ fontSize: 12, color: '#d4a042', lineHeight: 1.5 }}>{sanityWarning}</div>
                    </div>
                  </div>
                )}

                {/* Advanced Details toggle — always shown when there's a result */}
                <button
                  onClick={() => setShowAdvanced(v => !v)}
                  style={{
                    background: showAdvanced ? 'rgba(0,229,255,0.06)' : 'none',
                    border: `1px solid ${showAdvanced ? C.accent + '60' : C.border}`,
                    borderRadius: 6,
                    color: showAdvanced ? C.accent : C.muted,
                    cursor: 'pointer', fontSize: 11, fontFamily: C.font,
                    padding: '7px 0', letterSpacing: 0.5,
                    transition: 'all 0.2s',
                    width: '100%',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = C.text; (e.currentTarget as HTMLElement).style.borderColor = '#52525b' }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.color = showAdvanced ? C.accent : C.muted
                    ;(e.currentTarget as HTMLElement).style.borderColor = showAdvanced ? C.accent + '60' : C.border
                  }}
                >
                  {showAdvanced ? '▲ Hide Advanced Details' : '▼ Advanced Details'}
                </button>

                {showAdvanced && (
                  <>
                    <DealRating winChance={winChance} priceToCall={potOdds} />
                    <div style={panel}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' }}>Strategy Distribution</div>
                        <div style={{ fontSize: 10, color: '#3f3f46' }}>20 seeded samples</div>
                      </div>
                      {([
                        { label: 'Raise', pct: result.distribution.raise },
                        { label: 'Call',  pct: result.distribution.call },
                        { label: 'Check', pct: result.distribution.check },
                        { label: 'Fold',  pct: result.distribution.fold },
                      ] as const)
                        .slice()
                        .sort((a, b) => b.pct - a.pct)
                        .map(({ label, pct }) => {
                          const isActive =
                            (label === 'Raise' && (actionType === 'raise' || actionType === 'all_in')) ||
                            (label === 'Call'  && actionType === 'call') ||
                            (label === 'Check' && actionType === 'check') ||
                            (label === 'Fold'  && actionType === 'fold')
                          const isDisabled =
                            (label === 'Fold'  && toCall === 0) ||
                            (label === 'Check' && toCall > 0)
                          return <ActionBar key={label} label={label} pct={pct} isActive={isActive} disabled={isDisabled} />
                        })}
                    </div>
                  </>
                )}
              </>
            )}

          </div>

          {/* ── Col 3: The History ───────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <RecentScenarios
              history={history}
              currentBotId={selectedBotId}
              onRestore={restoreScenario}
              onDelete={deleteHistoryItem}
              onClear={clearHistory}
            />
          </div>

        </div>
      </div>
    </div>
  )
}
