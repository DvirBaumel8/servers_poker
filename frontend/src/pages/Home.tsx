import { useEffect, useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../lib/axios'
import { useAuthStore } from '../store/authStore'

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
  font: "'Trebuchet MS', sans-serif",
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const NAV_ICONS = {
  Home: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  ),
  'My Bots': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  ),
  Tournaments: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/><circle cx="3" cy="18" r="1" fill="currentColor"/>
    </svg>
  ),
  'Live Games': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/>
    </svg>
  ),
}

const NAV = [
  { label: 'Home', path: '/' },
  { label: 'My Bots', path: '/bots' },
  { label: 'Tournaments', path: '/tournaments' },
  { label: 'Live Games', path: '/games' },
]

function Sidebar({ collapsed = false, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  return (
    <div style={{
      width: collapsed ? 60 : 210, minHeight: '100vh', background: '#0d0d22', borderRight: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column', flexShrink: 0, fontFamily: C.font, transition: 'width 0.2s', overflow: 'visible',
    }}>
      {/* Logo */}
      <div style={{ padding: collapsed ? '12px 12px 8px' : '28px 20px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {!collapsed && (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase' }}>
              <span style={{ color: C.text }}>Bot</span>
              <span style={{ color: C.accent }}>Royale</span>
            </div>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginTop: 4, whiteSpace: 'nowrap' }}>
              Automate. Compete. Win.
            </div>
          </>
        )}
        {collapsed && (
          <div style={{ fontSize: 16, color: C.accent }}>◆</div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '20px 0', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'visible' }}>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleCollapse() }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = C.accent
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = 'rgba(0, 229, 255, 0.5)'
          }}
          style={{
            position: 'absolute', right: '-17px', top: '50%', transform: 'translateY(-50%)',
            width: 34, height: 34,
            background: 'transparent', border: 'none',
            color: 'rgba(0, 229, 255, 0.5)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 'bold', transition: 'color 0.2s', zIndex: 10, padding: 0,
            pointerEvents: 'auto',
          }}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '»' : '«'}
        </button>
        {NAV.map(({ label, path }, idx) => {
          const active = location.pathname === path
          return (
            <div key={path}>
              <button
                onClick={() => navigate(path)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: collapsed ? 0 : 10,
                  width: '100%', padding: collapsed ? '10px 0' : '10px 20px',
                  background: active ? C.accentDim : 'transparent',
                  border: 'none', borderLeft: collapsed ? 'none' : `3px solid ${active ? C.accent : 'transparent'}`,
                  color: active ? C.text : C.muted,
                  fontSize: 14, fontFamily: C.font, cursor: 'pointer',
                  textAlign: 'left', transition: 'all 0.15s',
                }}
              >
                <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {NAV_ICONS[label as keyof typeof NAV_ICONS]}
                </span>
                {!collapsed && label}
              </button>
            </div>
          )
        })}
      </nav>

      {/* User */}
      <div style={{ padding: collapsed ? '20px 4px' : '16px 20px', borderTop: `1px solid ${C.border}`, position: 'relative' }}>
        <button
          onClick={() => setDropdownOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10, width: '100%',
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #00e5ff, #0070ff)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#000', flexShrink: 0,
          }}>
            {(user?.name?.[0] ?? '?').toUpperCase()}
          </div>
          {!collapsed && (
            <>
              <div style={{ overflow: 'hidden', flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.name ?? 'Player'}
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>{user?.role ?? 'user'}</div>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </>
          )}
        </button>
        {dropdownOpen && !collapsed && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 12, right: 12, marginBottom: 6,
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
            overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}>
            <button
              onClick={() => { setDropdownOpen(false); logout() }}
              style={{
                width: '100%', padding: '10px 14px', background: 'transparent',
                border: 'none', color: C.danger, fontSize: 13, fontFamily: C.font,
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  )
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

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32, fontFamily: C.font }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, letterSpacing: 1, fontFamily: C.font }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyDashboard({ tournaments, loadingTournaments }: { tournaments: Tournament[]; loadingTournaments: boolean }) {
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
        <div style={{ fontSize: 15, color: C.muted }}>Build your first bot in 30 seconds and start competing in tournaments automatically.</div>
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

      {/* Upcoming tournaments */}
      <Section title="Upcoming Tournaments">
        {loadingTournaments ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3].map(i => <SkeletonCard key={i} lines={2} />)}
          </div>
        ) : tournaments.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 14, padding: '20px 0' }}>No upcoming tournaments right now.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tournaments.map(t => <TournamentRow key={t.id} tournament={t} canEnter={false} />)}
          </div>
        )}
      </Section>
    </>
  )
}

// ─── Returning state ──────────────────────────────────────────────────────────

function ReturningDashboard({
  bots,
  tournaments,
  loadingBots,
  loadingTournaments,
  onTournamentsRefresh,
}: {
  bots: Bot[]
  tournaments: Tournament[]
  loadingBots: boolean
  loadingTournaments: boolean
  onTournamentsRefresh: () => void
}) {
  const navigate = useNavigate()
  const activeBots = bots.filter(b => b.active).length
  const [enterTarget, setEnterTarget] = useState<Tournament | null>(null)

  const totalWins = bots.reduce((s, b) => s + (b.wins ?? 0), 0)
  const totalEntered = bots.reduce((s, b) => s + (b.tournaments_count ?? 0), 0)
  const winRate = totalEntered > 0 ? Math.round((totalWins / totalEntered) * 100) : 0

  return (
    <>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Balance', value: '$0.00', sub: 'hardcoded' },
          { label: 'My Bots', value: bots.length.toString(), sub: `${activeBots} active` },
          { label: 'Win Rate', value: `${winRate}%`, sub: `${totalWins}/${totalEntered} tournaments` },
        ].map(({ label, value, sub }) => (
          <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', fontFamily: C.font }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: C.text }}>{value}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{sub}</div>
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
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {bots.slice(0, 4).map((bot, i) => {
              const p = bot.strategy?.personality ?? {}
              const wr = bot.win_rate ?? 0
              return (
                <div key={bot.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, fontFamily: C.font }}>
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
                    {bot.active && (
                      <div style={{ marginLeft: 'auto', fontSize: 10, color: C.success, background: 'rgba(29,158,117,0.1)', padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(29,158,117,0.3)' }}>
                        Active
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

      {/* Upcoming Tournaments */}
      <Section
        title="Upcoming Tournaments"
        action={
          <button onClick={() => navigate('/tournaments')} style={{ background: 'none', border: 'none', color: C.accent, fontSize: 13, cursor: 'pointer', fontFamily: C.font }}>
            Browse all →
          </button>
        }
      >
        {loadingTournaments ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3].map(i => <SkeletonCard key={i} lines={2} />)}
          </div>
        ) : tournaments.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 14, padding: '20px 0' }}>No upcoming tournaments right now.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tournaments.map(t => (
              <TournamentRow key={t.id} tournament={t} canEnter={true} onEnter={() => setEnterTarget(t)} />
            ))}
          </div>
        )}
      </Section>

      {enterTarget && (
        <EnterModal
          tournament={enterTarget}
          bots={bots}
          onClose={() => setEnterTarget(null)}
          onSuccess={onTournamentsRefresh}
        />
      )}
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

  const [loadingBots, setLoadingBots] = useState(true)
  const [loadingTournaments, setLoadingTournaments] = useState(true)
  const [error, setError] = useState('')

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('home_sidebar_collapsed')
    return saved !== null ? JSON.parse(saved) : false
  })

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

  useEffect(() => {
    if (initialLoadRef.current) {
      // First load: fetch all data
      fetchBots()
      fetchTournaments()
      initialLoadRef.current = false
    }
  }, [])

  // Refetch bots when navigating back to home
  useEffect(() => {
    if (location.pathname === '/' && !initialLoadRef.current) {
      fetchBots()
    }
  }, [location.pathname])

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const newVal = !prev
      localStorage.setItem('home_sidebar_collapsed', JSON.stringify(newVal))
      return newVal
    })
  }

  const isLoading = loadingBots
  const hasBots = !loadingBots && bots.length > 0

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: C.font }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebarCollapse} />
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
              loadingBots={loadingBots}
              loadingTournaments={loadingTournaments}
              onTournamentsRefresh={fetchTournaments}
            />
          ) : (
            <EmptyDashboard
              tournaments={tournaments}
              loadingTournaments={loadingTournaments}
            />
          )}

        </main>
      </div>
    </div>
  )
}
