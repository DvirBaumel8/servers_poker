import { useEffect, useState, useRef } from 'react'
import { Trophy } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../lib/axios'
import { useAuthStore } from '../store/authStore'
import { Sidebar } from '../components/Sidebar'
import Toast from '../components/Toast'
import BotSelectionModal from '../components/tournaments/BotSelectionModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BotPersonality {
  aggression?: number
  bluffFrequency?: number
  riskTolerance?: number
  tightness?: number
}

interface Bot {
  id: string
  name: string
  description?: string
  active: boolean
  strategy?: { personality?: BotPersonality; tier?: string }
  win_rate?: number
  tournaments_count?: number
  wins?: number
}

interface Tournament {
  id: string
  name: string
  type: string
  status: string
  buy_in: number
  starting_chips: number
  min_players: number
  max_players: number
  players_count?: number
  registered_count?: number
  scheduled_start_at?: string
  prize_pool?: number
}

interface ActivityItem {
  id: string
  botName: string
  tournamentName: string
  finishPosition: number | null
  maxPlayers: number
  payout: number
  createdAt: string
}

interface LeaderboardEntry {
  botId: string
  botName: string
  tierBadge: string
  totalHands: number
  totalTournaments: number
  bb100: number
  roiPct: number
  itmPct: number
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#0a0a1a',
  card: '#13132a',
  cardHover: '#161630',
  border: '#1e1e3f',
  accent: '#00e5ff',
  accentDim: 'rgba(0,229,255,0.08)',
  text: '#ffffff',
  muted: '#9ca3af',
  danger: '#e24b4a',
  success: '#1d9e75',
  gold: '#ffd700',
  silver: '#c0c0c0',
  bronze: '#cd7f32',
  font: "'Trebuchet MS', sans-serif",
}

// ─── Top bar ──────────────────────────────────────────────────────────────────

function TopBar({ onCreateBot }: { onCreateBot: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '16px 28px', borderBottom: `1px solid ${C.border}`,
      background: '#0d0d22', fontFamily: C.font,
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>Dashboard</div>
      <button
        onClick={onCreateBot}
        style={{
          padding: '9px 18px',
          background: 'linear-gradient(90deg, #00e5ff, #0070ff)',
          border: 'none', borderRadius: 8,
          color: '#000', fontWeight: 700, fontSize: 13,
          fontFamily: C.font, cursor: 'pointer', letterSpacing: 1,
        }}
      >
        + Create Bot
      </button>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ width = '100%', height = 20, radius = 6 }: { width?: number | string; height?: number; radius?: number }) {
  return (
    <div
      className="animate-pulse"
      style={{ width, height, borderRadius: radius, background: '#1e1e3f' }}
    />
  )
}

function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === 0 ? '60%' : i % 2 === 0 ? '80%' : '45%'} height={i === 0 ? 18 : 13} />
      ))}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ icon, title, hint }: { icon: string; title: string; hint: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 16px', color: C.muted, fontFamily: C.font }}>
      <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.25 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.muted, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: C.muted, opacity: 0.7 }}>{hint}</div>
    </div>
  )
}

// ─── Slider bar (bot personality) ─────────────────────────────────────────────

function SliderBar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
      <span style={{ color: C.muted, width: 60, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: C.border, borderRadius: 2 }}>
        <div style={{ width: `${value}%`, height: '100%', background: C.accent, borderRadius: 2 }} />
      </div>
      <span style={{ color: C.muted, width: 28, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

// ─── Countdown timer ──────────────────────────────────────────────────────────

function CountdownTimer({ targetIso }: { targetIso: string }) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    function compute() {
      const diff = new Date(targetIso).getTime() - Date.now()
      if (diff <= 0) { setTimeLeft('Starting now'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setTimeLeft(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }
    compute()
    const id = setInterval(compute, 1000)
    return () => clearInterval(id)
  }, [targetIso])

  return <span>{timeLeft}</span>
}

// ─── Daily Tournament Hero ────────────────────────────────────────────────────

function DailyTournamentHero({
  tournament,
  bots,
  isRegistered,
  onEnter,
}: {
  tournament: Tournament | null
  bots: Bot[]
  isRegistered: boolean
  onEnter: (t: Tournament) => void
}) {
  const navigate = useNavigate()

  if (!tournament) {
    // Compute countdown to next 8 PM local
    const next8pm = (() => {
      const now = new Date()
      const target = new Date(now)
      target.setHours(20, 0, 0, 0)
      if (now >= target) target.setDate(target.getDate() + 1)
      return target.toISOString()
    })()

    return (
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #0d1b2a 0%, #13132a 60%, #0a1628 100%)',
        border: `1px solid rgba(0,229,255,0.15)`,
        borderRadius: 14, padding: '24px 28px', marginBottom: 28,
        fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
      }}>
        <div style={{ position: 'absolute', right: -20, top: -30, fontSize: 180, color: '#ffffff03', userSelect: 'none', lineHeight: 1, pointerEvents: 'none' }}>♠</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, color: C.accent, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6, opacity: 0.7 }}>
            Next Tournament
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.text, marginBottom: 4 }}>
            Daily Master
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>
            The next daily session opens at 8 PM. Prepare your bot now.
          </div>
        </div>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>Opens in</div>
          <div style={{ fontSize: 42, fontWeight: 700, color: C.accent, fontVariantNumeric: 'tabular-nums', letterSpacing: 2 }}>
            <CountdownTimer targetIso={next8pm} />
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Daily at 8:00 PM</div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <button
            onClick={() => navigate(bots.length > 0 ? '/tournaments' : '/bots')}
            style={{
              padding: '9px 20px', borderRadius: 8,
              background: 'linear-gradient(90deg, #00e5ff, #0070ff)',
              border: 'none', color: '#000',
              fontWeight: 700, fontSize: 13, fontFamily: C.font,
              cursor: 'pointer',
            }}
          >
            {bots.length > 0 ? 'View Tournaments →' : 'Create Bot →'}
          </button>
        </div>
      </div>
    )
  }

  const prize = tournament.prize_pool ?? tournament.buy_in
  const registered = tournament.registered_count ?? tournament.players_count ?? 0
  const hasBots = bots.length > 0

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(135deg, #0d1b2a 0%, #13132a 60%, #0a1628 100%)',
      border: `1px solid rgba(0,229,255,0.25)`,
      boxShadow: '0 0 40px rgba(0,229,255,0.06)',
      borderRadius: 14, padding: '32px 36px', marginBottom: 28,
      fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
    }}>
      {/* Background watermark */}
      <div style={{ position: 'absolute', right: -20, top: -30, fontSize: 180, color: '#ffffff04', userSelect: 'none', lineHeight: 1, pointerEvents: 'none' }}>♠</div>

      {/* Left: name + meta */}
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 11, color: C.accent, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6, opacity: 0.8 }}>
          Tonight's Tournament
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: C.text, marginBottom: 4 }}>
          The Nightly Royale
        </div>
        <div style={{ fontSize: 12, color: C.muted }}>
          {registered}/{tournament.max_players} bots registered
        </div>
      </div>

      {/* Center: countdown + prize */}
      <div style={{ textAlign: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>Starts in</div>
        {tournament.scheduled_start_at ? (
          <div style={{ fontSize: 42, fontWeight: 700, color: C.accent, fontVariantNumeric: 'tabular-nums', letterSpacing: 2 }}>
            <CountdownTimer targetIso={tournament.scheduled_start_at} />
          </div>
        ) : (
          <div style={{ fontSize: 18, fontWeight: 700, color: C.muted }}>Open</div>
        )}
        {prize > 0 ? (
          <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginTop: 4 }}>
            ${prize.toLocaleString()} prize pool
          </div>
        ) : (
          <div style={{ fontSize: 13, color: C.muted, fontWeight: 600, marginTop: 4 }}>
            Community Glory
          </div>
        )}
      </div>

      {/* Right: actions */}
      <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
        <button
          onClick={() => navigate(`/tournaments/${tournament.id}`)}
          style={{
            padding: '9px 16px', borderRadius: 8,
            background: 'transparent', border: `1px solid ${C.border}`,
            color: C.muted, fontFamily: C.font, fontSize: 13,
            cursor: 'pointer', fontWeight: 600,
          }}
        >
          View Details
        </button>
        {isRegistered ? (
          <button
            disabled
            style={{
              padding: '9px 20px', borderRadius: 8,
              background: 'transparent', border: `1px solid ${C.border}`,
              color: C.muted, fontWeight: 700, fontSize: 13, fontFamily: C.font,
              cursor: 'default', opacity: 0.8,
            }}
          >
            Registered ✅
          </button>
        ) : (
          <button
            onClick={hasBots ? () => onEnter(tournament) : () => navigate('/bots')}
            style={{
              padding: '9px 20px', borderRadius: 8,
              background: 'linear-gradient(90deg, #00e5ff, #0070ff)',
              border: 'none', color: '#000',
              fontWeight: 700, fontSize: 13, fontFamily: C.font,
              cursor: 'pointer',
            }}
          >
            {hasBots ? 'Register Now' : 'Create Bot'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Enter tournament modal ────────────────────────────────────────────────────

function EnterModal({
  tournament,
  bots,
  onClose,
  onSuccess,
}: {
  tournament: Tournament
  bots: Bot[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [selectedBot, setSelectedBot] = useState<string>(bots[0]?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleEnter() {
    if (!selectedBot) return
    setLoading(true)
    setError('')
    try {
      await api.post(`/tournaments/${tournament.id}/register`, { bot_id: selectedBot })
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Failed to register')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.font,
    }} onClick={onClose}>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
        padding: 28, width: 380, maxWidth: '90vw',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 4 }}>Enter Tournament</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>{tournament.name}</div>

        {error && (
          <div style={{ background: 'rgba(226,75,74,0.1)', border: `1px solid ${C.danger}`, borderRadius: 8, padding: '8px 12px', color: C.danger, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 }}>Select a bot</div>
          {bots.map(bot => (
            <label key={bot.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              background: selectedBot === bot.id ? C.accentDim : 'transparent',
              border: `1px solid ${selectedBot === bot.id ? C.accent : C.border}`,
              borderRadius: 8, cursor: 'pointer', marginBottom: 8,
            }}>
              <input type="radio" name="bot" value={bot.id} checked={selectedBot === bot.id} onChange={() => setSelectedBot(bot.id)} style={{ accentColor: C.accent }} />
              <div>
                <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{bot.name}</div>
                {bot.description && <div style={{ fontSize: 12, color: C.muted }}>{bot.description}</div>}
              </div>
              {bot.active && <div style={{ marginLeft: 'auto', fontSize: 10, color: C.success, background: 'rgba(29,158,117,0.1)', padding: '2px 8px', borderRadius: 20 }}>Active</div>}
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontFamily: C.font, cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={handleEnter}
            disabled={!selectedBot || loading}
            style={{
              flex: 1, padding: '10px',
              background: 'linear-gradient(90deg, #00e5ff, #0070ff)',
              border: 'none', borderRadius: 8,
              color: '#000', fontWeight: 700, fontFamily: C.font,
              cursor: selectedBot && !loading ? 'pointer' : 'not-allowed',
              opacity: !selectedBot || loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Entering…' : 'Enter →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tournament row ────────────────────────────────────────────────────────────

const BOT_EMOJIS = ['♠', '♣', '♥', '♦', '★', '◆']

function TournamentRow({
  tournament,
  canEnter,
  onEnter,
}: {
  tournament: Tournament
  canEnter: boolean
  onEnter?: () => void
}) {
  const registered = tournament.registered_count ?? tournament.players_count ?? 0
  const prize = tournament.prize_pool ?? tournament.buy_in
  const startTime = tournament.scheduled_start_at
    ? new Date(tournament.scheduled_start_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Open'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '12px 16px', background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 10, fontFamily: C.font,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tournament.name}</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
          {registered}/{tournament.max_players} bots · {startTime}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 13, color: C.accent, fontWeight: 700 }}>${prize.toLocaleString()}</div>
        <div style={{ fontSize: 11, color: C.muted }}>1st prize</div>
      </div>
      <button
        onClick={canEnter ? onEnter : undefined}
        disabled={!canEnter}
        style={{
          padding: '7px 16px', borderRadius: 7,
          background: canEnter ? 'linear-gradient(90deg, #00e5ff, #0070ff)' : C.border,
          border: 'none', color: canEnter ? '#000' : C.muted,
          fontWeight: 700, fontSize: 12, fontFamily: C.font,
          cursor: canEnter ? 'pointer' : 'not-allowed', flexShrink: 0,
        }}
      >
        {canEnter ? 'Enter' : 'No bot yet'}
      </button>
    </div>
  )
}

// ─── Mini Leaderboard ─────────────────────────────────────────────────────────

const RANK_COLORS = [C.gold, C.silver, C.bronze]
const TIER_LABEL: Record<string, string> = {
  TIER_1_QUICK: 'Quick',
  TIER_2_MATRIX: 'Matrix',
  TIER_3_ELITE: 'Elite',
  QUICK: 'Quick',
  MATRIX: 'Matrix',
  ELITE: 'Elite',
}

function MiniLeaderboard({ entries, loading }: { entries: LeaderboardEntry[]; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[1, 2, 3].map(i => <SkeletonCard key={i} lines={2} />)}
      </div>
    )
  }

  if (entries.length === 0) {
    return <EmptyState icon="🥇" title="No ranked bots yet" hint="Stats update every 15 minutes after tournaments finish" />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.map((entry, i) => {
        const totalGames = entry.totalTournaments ?? entry.totalHands ?? 0
        return (
          <div key={entry.botId} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: '16px 16px', fontFamily: C.font,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: `rgba(${i === 0 ? '255,215,0' : i === 1 ? '192,192,192' : '205,127,50'},0.12)`,
              border: `1px solid ${RANK_COLORS[i]}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: RANK_COLORS[i],
            }}>#{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.botName}
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                {TIER_LABEL[entry.tierBadge] ?? entry.tierBadge} · {totalGames} games
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: (entry.bb100 ?? 0) >= 0 ? C.success : C.danger }}>
                {totalGames === 0 || entry.bb100 == null || isNaN(entry.bb100)
                  ? <span style={{ color: C.muted }}>-- BB/100</span>
                  : <>{entry.bb100 >= 0 ? '+' : ''}{entry.bb100.toFixed(1)}<span style={{ fontSize: 12, marginLeft: 3 }}>BB/100</span></>
                }
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>
                {totalGames === 0 || entry.itmPct == null || isNaN(entry.itmPct) ? '-- ITM' : `${entry.itmPct.toFixed(0)}% ITM`}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const EXAMPLE_ACTIVITIES = [
  { icon: '🏆', text: 'Your bot will appear here after the first tournament', sub: 'Register a bot to get started', faded: true },
  { icon: '♠', text: 'ExampleBot finished #3 of 45 in The Nightly Royale', sub: 'Earned $12.50 · 2 hours ago', faded: true },
  { icon: '♣', text: 'AnotherBot placed #1 in Daily Master', sub: 'Earned $45.00 · yesterday', faded: true },
]

function ActivityFeed({ items, loading }: { items: ActivityItem[]; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[1, 2, 3].map(i => <SkeletonCard key={i} lines={2} />)}
      </div>
    )
  }

  const SUIT_ICONS = ['♣', '♠', '♥', '♦']

  function ActivityIconChip({ pos, index }: { pos: number | null; index: number }) {
    const isTop3 = pos !== null && pos <= 3
    const chipBg = isTop3 ? 'rgba(255,215,0,0.12)' : 'rgba(156,163,175,0.08)'
    const chipBorder = isTop3 ? 'rgba(255,215,0,0.35)' : C.border
    return (
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: chipBg, border: `1px solid ${chipBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isTop3
          ? <Trophy size={19} color={pos === 1 ? C.gold : pos === 2 ? C.silver : C.bronze} />
          : <span style={{ fontSize: 18, color: C.muted }}>{SUIT_ICONS[index % SUIT_ICONS.length]}</span>
        }
      </div>
    )
  }

  if (items.length > 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item, index) => {
          const pos = item.finishPosition
          const isWin = pos === 1
          const isTop3 = pos !== null && pos <= 3
          const isITM = pos !== null && pos <= Math.max(1, Math.floor(item.maxPlayers * 0.15))
          const payoutLabel = item.payout > 0 ? ` · earned $${item.payout.toFixed(2)}` : ''

          return (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: '18px 16px', fontFamily: C.font,
            }}>
              <ActivityIconChip pos={pos} index={index} />
              <div style={{ flex: 1, minWidth: 0, lineHeight: 1.6 }}>
                <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>
                  {item.botName} finished{' '}
                  {pos !== null
                    ? <><span style={{ fontWeight: 800 }}>#{pos}</span> of {item.maxPlayers}</>
                    : 'participated'
                  }{' '}in {item.tournamentName}
                </div>
                <div style={{ fontSize: 12, color: isWin ? C.gold : isTop3 ? C.silver : isITM ? C.success : C.muted, marginTop: 2 }}>
                  {isWin ? 'Winner!' : isTop3 ? `Top 3 finish` : isITM ? 'In the money' : 'Played'}{payoutLabel} · {relativeTime(item.createdAt)}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // No real data — show example items with faded style
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1,
        marginBottom: 4, opacity: 0.6, fontFamily: C.font,
      }}>
        Example — your activity will appear here after tournaments
      </div>
      {EXAMPLE_ACTIVITIES.map((ex, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 14,
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: '18px 16px', fontFamily: C.font, opacity: 0.4,
        }}>
          <ActivityIconChip pos={i === 0 ? null : i} index={i} />
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.6 }}>
            <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{ex.text}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{ex.sub}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32, fontFamily: C.font }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: 1, fontFamily: C.font }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

// ─── Empty state (new user) ───────────────────────────────────────────────────

function EmptyDashboard({ tournaments, loadingTournaments, bots, onEnter }: { tournaments: Tournament[]; loadingTournaments: boolean; bots: Bot[]; onEnter: (t: Tournament) => void }) {
  const navigate = useNavigate()
  return (
    <>
      {/* Welcome banner */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
        padding: '36px 36px', marginBottom: 28, fontFamily: C.font,
      }}>
        <div style={{
          position: 'absolute', right: -10, top: -20,
          fontSize: 160, color: '#ffffff08', lineHeight: 1, userSelect: 'none',
        }}>♠</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: C.text, marginBottom: 8 }}>Welcome to BotRoyale</div>
        <div style={{ fontSize: 15, color: C.muted, marginBottom: 20 }}>Build your first bot in 30 seconds and start competing in tournaments automatically.</div>
        <button
          onClick={() => navigate('/bots/build')}
          style={{
            padding: '10px 22px', borderRadius: 8,
            background: 'linear-gradient(90deg, #00e5ff, #0070ff)',
            border: 'none', color: '#000',
            fontWeight: 700, fontSize: 14, fontFamily: C.font, cursor: 'pointer', letterSpacing: 0.5,
          }}
        >
          Create Your First Bot →
        </button>
      </div>

      {/* 3-step cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32, fontFamily: C.font }}>
        {[
          { n: 1, title: 'Build your bot', desc: 'Define your bot\'s strategy — aggression, bluff frequency, risk tolerance, and more.' },
          { n: 2, title: 'Enter a tournament', desc: 'Register your bot in open tournaments. It plays automatically, 24/7, no babysitting.' },
          { n: 3, title: 'Watch & win', desc: 'Watch live hands, track your bot\'s stats, and climb the leaderboard.' },
        ].map(({ n, title, desc }) => (
          <div key={n} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: C.accentDim,
              border: `1px solid ${C.accent}`, color: C.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 14, marginBottom: 14,
            }}>{n}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>{title}</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{desc}</div>
          </div>
        ))}
      </div>

      {/* Daily Tournament Hero — always visible even with no bots */}
      {!loadingTournaments && (
        <DailyTournamentHero
          tournament={tournaments.find(t => /daily master/i.test(t.name)) ?? (tournaments[0] ?? null)}
          bots={bots}
          isRegistered={false}
          onEnter={onEnter}
        />
      )}

      {/* Other upcoming tournaments */}
      {!loadingTournaments && tournaments.length > 1 && (
        <Section title="More Tournaments">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tournaments.slice(1).map(t => <TournamentRow key={t.id} tournament={t} canEnter={false} />)}
          </div>
        </Section>
      )}
    </>
  )
}

// ─── Returning state ──────────────────────────────────────────────────────────

function ReturningDashboard({
  bots,
  tournaments,
  walletBalance,
  activity,
  leaderboard,
  loadingBots,
  loadingTournaments,
  loadingActivity,
  loadingLeaderboard,
  onTournamentsRefresh,
}: {
  bots: Bot[]
  tournaments: Tournament[]
  walletBalance: string | null
  activity: ActivityItem[]
  leaderboard: LeaderboardEntry[]
  loadingBots: boolean
  loadingTournaments: boolean
  loadingActivity: boolean
  loadingLeaderboard: boolean
  onTournamentsRefresh: () => void
}) {
  const navigate = useNavigate()
  const activeBots = bots.filter(b => b.active).length
  const [enterTarget, setEnterTarget] = useState<Tournament | null>(null)
  const [registeredBotId, setRegisteredBotId] = useState<string | null>(null)
  const [hoverBotId, setHoverBotId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const isRegistered = registeredBotId !== null

  function handleRegister(tournament: Tournament) {
    setEnterTarget(tournament)
  }

  const totalWins = bots.reduce((s, b) => s + (b.wins ?? 0), 0)
  const totalEntered = bots.reduce((s, b) => s + (b.tournaments_count ?? 0), 0)
  const winRate = totalEntered > 0 ? Math.round((totalWins / totalEntered) * 100) : 0

  // Detect daily tournament
  const dailyTournament = tournaments.find(t => /daily master/i.test(t.name)) ?? null

  return (
    <>
      {/* Daily Tournament Hero */}
      <DailyTournamentHero
        tournament={dailyTournament ?? (tournaments[0] ?? null)}
        bots={bots}
        isRegistered={isRegistered}
        onEnter={handleRegister}
      />

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Balance', value: walletBalance !== null ? `$${Number(walletBalance).toLocaleString()}` : '…', sub: 'available' },
          { label: 'My Bots', value: bots.length.toString(), sub: `${activeBots} active` },
          { label: 'Win Rate', value: `${winRate}%`, sub: `${totalWins}/${totalEntered} tournaments` },
        ].map(({ label, value, sub }) => (
          <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', fontFamily: C.font }}>
            <div style={{ fontSize: 13, color: C.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 34, fontWeight: 700, color: C.text }}>
              {label === 'Balance' && walletBalance === null
                ? <span style={{ opacity: 0.4 }}>…</span>
                : value}
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* My Bots */}
      <Section
        title="My Bots"
        action={
          <button onClick={() => navigate('/bots')} style={{ background: 'none', border: 'none', color: C.accent, fontSize: 13, cursor: 'pointer', fontFamily: C.font }}>
            View all →
          </button>
        }
      >
        {loadingBots ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {[1, 2].map(i => <SkeletonCard key={i} lines={4} />)}
          </div>
        ) : bots.length === 0 ? (
          <EmptyState icon="♠" title="No bots yet" hint="Create your first bot to get started" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {bots.slice(0, 4).map((bot, i) => {
              const p = bot.strategy?.personality ?? {}
              const wr = bot.win_rate ?? 0
              return (
                <div
                  key={bot.id}
                  onClick={() => navigate(`/bots/build?id=${bot.id}`)}
                  onMouseEnter={() => setHoverBotId(bot.id)}
                  onMouseLeave={() => setHoverBotId(null)}
                  style={{
                    background: C.card,
                    border: `1px solid ${hoverBotId === bot.id ? C.accent : C.border}`,
                    borderRadius: 12, padding: 18, fontFamily: C.font,
                    cursor: 'pointer',
                    transform: hoverBotId === bot.id ? 'translateY(-2px)' : 'none',
                    boxShadow: hoverBotId === bot.id ? '0 4px 20px rgba(0,229,255,0.12)' : 'none',
                    transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: C.accentDim, border: `1px solid ${C.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, color: C.accent,
                    }}>{BOT_EMOJIS[i % BOT_EMOJIS.length]}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{bot.name}</div>
                      <div style={{ fontSize: 11, color: wr > 50 ? C.success : wr > 0 ? C.danger : C.muted }}>
                        {wr > 0 ? `${wr}% win rate` : 'No games yet'}
                      </div>
                    </div>
                    {bot.id === registeredBotId && (
                      <div style={{ marginLeft: 'auto', fontSize: 10, color: C.success, background: 'rgba(29,158,117,0.1)', padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(29,158,117,0.3)' }}>
                        Registered
                      </div>
                    )}
                  </div>
                  {(p.aggression !== undefined || p.bluffFrequency !== undefined) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {p.aggression !== undefined && <SliderBar label="Aggression" value={p.aggression} />}
                      {p.bluffFrequency !== undefined && <SliderBar label="Bluff" value={p.bluffFrequency} />}
                    </div>
                  )}
                  {bot.tournaments_count !== undefined && (
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 12 }}>
                      {bot.tournaments_count} tournament{bot.tournaments_count !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* Two-column: Activity Feed (60%) + Top Bots (40%) */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 24, marginBottom: 32, alignItems: 'start' }}>
        <Section title="Recent Activity">
          <ActivityFeed items={activity} loading={loadingActivity} />
        </Section>

        <Section
          title="Top Bots"
          action={
            <button onClick={() => navigate('/leaderboard')} style={{ background: 'none', border: 'none', color: C.accent, fontSize: 13, cursor: 'pointer', fontFamily: C.font }}>
              Full board →
            </button>
          }
        >
          <MiniLeaderboard entries={leaderboard} loading={loadingLeaderboard} />
        </Section>
      </div>

      {enterTarget && (
        <BotSelectionModal
          tournamentId={enterTarget.id}
          onClose={() => setEnterTarget(null)}
          onJoining={() => {}}
          onSuccess={(botId) => {
            setEnterTarget(null)
            setRegisteredBotId(botId)
            setToast("Good luck! Your bot is in for tonight's Royale")
            onTournamentsRefresh()
          }}
          onError={() => setEnterTarget(null)}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const initialLoadRef = useRef(true)

  const [bots, setBots] = useState<Bot[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [walletBalance, setWalletBalance] = useState<string | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])

  const [loadingBots, setLoadingBots] = useState(true)
  const [loadingTournaments, setLoadingTournaments] = useState(true)
  const [loadingActivity, setLoadingActivity] = useState(true)
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true)
  const [error, setError] = useState('')

  async function fetchBots() {
    try {
      const res = await api.get('/bots/my')
      const data = res.data
      const botList = Array.isArray(data) ? data : (data.data ?? [])
      setBots(botList.filter((b: Bot) => b.active !== false))
    } catch {
      setError('Failed to load bots.')
    } finally {
      setLoadingBots(false)
    }
  }

  async function fetchWallet() {
    try {
      const res = await api.get('/finance/wallet')
      setWalletBalance(res.data.balance ?? '0')
    } catch {
      setWalletBalance('0')
    }
  }

  async function fetchTournaments() {
    try {
      const res = await api.get('/tournaments/scheduled/upcoming')
      const data = res.data
      setTournaments(Array.isArray(data) ? data : (data.data ?? data.tournaments ?? []))
    } catch {
      setError(prev => prev ? prev : 'Failed to load tournaments.')
    } finally {
      setLoadingTournaments(false)
    }
  }

  async function fetchActivity() {
    try {
      const res = await api.get('/tournaments/my-activity')
      setActivity(Array.isArray(res.data) ? res.data : [])
    } catch {
      setActivity([])
    } finally {
      setLoadingActivity(false)
    }
  }

  async function fetchLeaderboard() {
    try {
      const res = await api.get('/leaderboard?limit=3&sortBy=bb100')
      const data = res.data
      const entries: LeaderboardEntry[] = (data.data ?? data.bots ?? (Array.isArray(data) ? data : [])).slice(0, 3)
      setLeaderboard(entries)
    } catch {
      setLeaderboard([])
    } finally {
      setLoadingLeaderboard(false)
    }
  }

  useEffect(() => {
    if (initialLoadRef.current) {
      fetchBots()
      fetchTournaments()
      fetchWallet()
      fetchActivity()
      fetchLeaderboard()
      initialLoadRef.current = false
    }
  }, [])

  // Refetch bots when navigating back to home
  useEffect(() => {
    if (location.pathname === '/' && !initialLoadRef.current) {
      fetchBots()
    }
  }, [location.pathname])

  const isLoading = loadingBots
  const hasBots = !loadingBots && bots.length > 0

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: C.font }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar onCreateBot={() => navigate('/bots/build')} />
        <main style={{ flex: 1, overflowY: 'auto', padding: '28px' }}>

          {error && (
            <div style={{
              background: 'rgba(226,75,74,0.1)', border: `1px solid ${C.danger}`,
              borderRadius: 8, padding: '10px 16px', color: C.danger,
              fontSize: 13, marginBottom: 20, fontFamily: C.font,
            }}>
              {error}
            </div>
          )}

          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {[1, 2, 3].map(i => <SkeletonCard key={i} lines={3} />)}
              </div>
              <SkeletonCard lines={5} />
              <SkeletonCard lines={4} />
            </div>
          ) : hasBots ? (
            <ReturningDashboard
              bots={bots}
              tournaments={tournaments}
              walletBalance={walletBalance}
              activity={activity}
              leaderboard={leaderboard}
              loadingBots={loadingBots}
              loadingTournaments={loadingTournaments}
              loadingActivity={loadingActivity}
              loadingLeaderboard={loadingLeaderboard}
              onTournamentsRefresh={fetchTournaments}
            />
          ) : (
            <EmptyDashboard
              tournaments={tournaments}
              loadingTournaments={loadingTournaments}
              bots={bots}
              onEnter={(t) => {/* new users have no bots; hero's CTA navigates to /bots/build instead */void t}}
            />
          )}

        </main>
      </div>
    </div>
  )
}
