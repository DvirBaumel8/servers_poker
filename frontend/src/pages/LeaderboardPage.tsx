import { useEffect, useState } from 'react'
import api from '../lib/axios'
import { Sidebar } from '../components/Sidebar'
import { useAuthStore } from '../store/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  userId: string
  userName: string
  activeBotCount: number
  bb100: number
  itmPct: number
  roiPct: number
  totalHands: number
  totalTournaments: number
  tournamentWins: number
  totalNet: string
  totalPayout: string
  rank: number
}

interface LeaderboardResponse {
  data: LeaderboardEntry[]
  total: number
  limit: number
  offset: number
  lastRefreshedAt: string
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
  warning: '#f59e0b',
  emerald: '#34d399',
  rose: '#fb7185',
  gold: '#ffd700',
  silver: '#c0c0c0',
  bronze: '#cd7f32',
  font: "'Trebuchet MS', sans-serif",
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

function UserAvatar({ name }: { name: string }) {
  const initial = name ? name[0].toUpperCase() : '?'
  const hue = (name || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%',
      background: `hsl(${hue}, 45%, 28%)`,
      border: `1px solid hsl(${hue}, 45%, 42%)`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 700, color: '#fff',
      flexShrink: 0,
    }}>
      {initial}
    </div>
  )
}

function RankBadge({ rank }: { rank: number }) {
  const colors: Record<number, string> = { 1: C.gold, 2: C.silver, 3: C.bronze }
  const color = colors[rank]
  if (color) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: '50%',
        background: `${color}20`, border: `2px solid ${color}`,
        fontSize: 13, fontWeight: 700, color,
      }}>
        {rank}
      </span>
    )
  }
  return <span style={{ fontSize: 14, color: C.muted, fontWeight: 600 }}>#{rank}</span>
}

// ─── Podium ───────────────────────────────────────────────────────────────────

function PodiumSection({ entries }: { entries: LeaderboardEntry[] }) {
  const top3 = entries.slice(0, 3)
  if (top3.length === 0) return null

  // Olympic order: Silver (left), Gold (center, elevated), Bronze (right)
  const order = [top3[1], top3[0], top3[2]].filter(Boolean)

  const rankColors: Record<number, string> = { 1: C.gold, 2: C.silver, 3: C.bronze }
  const rankLabels: Record<number, string> = { 1: '1st Place', 2: '2nd Place', 3: '3rd Place' }

  return (
    <div className="podium-section" style={{
      display: 'flex', gap: 14, marginBottom: 24, alignItems: 'flex-end', flexWrap: 'wrap',
    }}>
      {order.map((entry) => {
        const isGold = entry.rank === 1
        const rankColor = rankColors[entry.rank] ?? C.accent
        const net = Number(entry.totalNet)
        const netColor = net >= 0 ? C.emerald : C.rose

        return (
          <div
            key={entry.rank}
            style={{
              flex: 1,
              background: C.card,
              border: `1px solid ${rankColor}40`,
              borderRadius: 10,
              padding: '20px 18px 16px',
              position: 'relative',
              marginBottom: isGold ? 0 : 20,
              boxShadow: isGold
                ? `0 0 28px ${rankColor}25, 0 4px 16px rgba(0,0,0,0.4)`
                : `0 2px 10px rgba(0,0,0,0.3)`,
            }}
          >
            {/* Rank label */}
            <div style={{
              position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
              background: C.bg, padding: '0 8px',
              fontSize: 10, fontWeight: 700, color: rankColor,
              letterSpacing: 1.5, textTransform: 'uppercase', whiteSpace: 'nowrap',
            }}>
              {rankLabels[entry.rank]}
            </div>

            {/* Rank badge + user name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <RankBadge rank={entry.rank} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserAvatar name={entry.userName} />
                <div style={{
                  fontSize: isGold ? 16 : 14, fontWeight: 700, color: C.text,
                  lineHeight: 1.2,
                }}>
                  {entry.userName || 'Unknown'}
                </div>
              </div>
            </div>

            {/* Net Profit */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 4,
            }}>
              <span style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
                Net Profit
              </span>
              <span style={{
                fontSize: isGold ? 18 : 15, fontWeight: 700, color: netColor,
                fontFamily: 'monospace',
              }}>
                {formatNet(net)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Pill filter button ───────────────────────────────────────────────────────

function PillButton({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        border: `1px solid ${active ? C.accent : C.border}`,
        background: active ? C.accentDim : 'transparent',
        color: active ? C.accent : C.muted,
        cursor: 'pointer',
        fontFamily: C.font,
        whiteSpace: 'nowrap',
        transition: 'all 0.1s',
      }}
    >
      {label}
    </button>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNet(n: number): string {
  const abs = Math.abs(n)
  const sign = n >= 0 ? '+' : '-'
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000)    return `${sign}${(abs / 1_000).toFixed(1)}k`
  return n >= 0 ? `+${n.toLocaleString()}` : n.toLocaleString()
}

const EMPTY_MSGS: Record<string, string> = {
  daily:    'No champions today yet — check back after some games.',
  weekly:   'No champions this week yet.',
  monthly:  'No champions this month yet.',
  all_time: 'No players match the current filters.',
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [period, setPeriod] = useState('all_time')
  const [sortBy, setSortBy] = useState('bb100')
  const [minGames, setMinGames] = useState(0)
  const [page, setPage] = useState(0)
  const limit = 25

  useEffect(() => {
    fetchLeaderboard()
  }, [period, sortBy, minGames, page])

  async function fetchLeaderboard() {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, string | number> = {
        period,
        sortBy,
        minGames,
        limit,
        offset: page * limit,
      }
      const { data } = await api.get<LeaderboardResponse>('/leaderboard', { params })
      setEntries(data.data)
      setTotal(data.total)
    } catch {
      setError('Failed to load leaderboard')
    } finally {
      setLoading(false)
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: C.font }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 28px', borderBottom: `1px solid ${C.border}`, background: '#0d0d22',
        }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>Hall of Fame</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2, letterSpacing: 0.5 }}>
              Rankings across all developers on the platform
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 16,
          padding: '8px 28px', borderBottom: `1px solid ${C.border}`, background: C.bg,
        }}>
          {/* Period pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {[
              { value: 'all_time', label: 'All Time' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'daily', label: 'Daily' },
            ].map(o => (
              <PillButton key={o.value} label={o.label} active={period === o.value}
                onClick={() => { setPeriod(o.value); setPage(0) }} />
            ))}
          </div>

          <div style={{ width: 1, height: 18, background: C.border }} />

          {/* Sort */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: C.muted }}>Sort</span>
            <select
              value={sortBy}
              onChange={e => { setSortBy(e.target.value); setPage(0) }}
              style={{
                padding: '3px 8px', borderRadius: 6,
                border: `1px solid ${C.border}`, background: C.card, color: C.text,
                fontSize: 11, fontFamily: C.font, outline: 'none', cursor: 'pointer',
              }}
            >
              <option value="bb100">BB/100</option>
              <option value="roi">ROI</option>
              <option value="net_profit">Net Profit</option>
            </select>
          </div>

          {/* Min Hands */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: C.muted }}>Min Hands</span>
            <input
              type="number"
              value={minGames}
              onChange={e => { setMinGames(Math.max(0, parseInt(e.target.value) || 0)); setPage(0) }}
              style={{
                width: 56, padding: '3px 6px', borderRadius: 6,
                border: `1px solid ${C.border}`, background: C.card, color: C.text,
                fontSize: 11, fontFamily: C.font, outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          {error && (
            <div style={{
              background: 'rgba(226,75,74,0.1)', border: `1px solid ${C.danger}`,
              borderRadius: 8, padding: '12px 16px', color: C.danger, fontSize: 13, marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          {/* Top 3 Podium */}
          {!loading && entries.length > 0 && <PodiumSection entries={entries} />}

          {/* Table */}
          <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: C.font }}>
              <thead>
                <tr style={{ background: C.card }}>
                  {[
                    'Rank', 'Player', 'BB/100', 'ITM%', 'ROI%',
                    'Hands', 'Tournaments', 'Wins', 'Net Profit', 'Payouts',
                  ].map(h => {
                    const isHighlight = h === 'Rank' || h === 'Net Profit'
                    return (
                      <th key={h} style={{
                        padding: '10px 12px', fontSize: 11,
                        fontWeight: isHighlight ? 900 : 700,
                        color: isHighlight ? C.text : C.accent,
                        textTransform: 'uppercase', letterSpacing: 1,
                        textAlign: h === 'Player' ? 'left' : 'right',
                        borderBottom: `1px solid ${C.border}`,
                        whiteSpace: 'nowrap',
                      }}>
                        {h}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <td key={j} style={{ padding: '12px', borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ height: 16, borderRadius: 4, background: C.card, animation: 'pulse 1.5s ease-in-out infinite' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 15, letterSpacing: 0.5 }}>
                      {EMPTY_MSGS[period] ?? 'No players match the current filters.'}
                    </td>
                  </tr>
                ) : (
                  entries.map(e => {
                    const isMyRow = !!currentUserId && e.userId === currentUserId
                    return (
                    <tr
                      key={String(e.rank)}
                      title={`Playing with ${e.activeBotCount} active bot${e.activeBotCount !== 1 ? 's' : ''}`}
                      style={{ transition: 'background 0.15s', background: isMyRow ? 'rgba(0, 229, 255, 0.06)' : 'transparent' }}
                      onMouseEnter={ev => (ev.currentTarget.style.background = isMyRow ? 'rgba(0, 229, 255, 0.12)' : C.cardHover)}
                      onMouseLeave={ev => (ev.currentTarget.style.background = isMyRow ? 'rgba(0, 229, 255, 0.06)' : 'transparent')}
                    >
                      <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 700, borderLeft: isMyRow ? `4px solid ${C.accent}` : '4px solid transparent' }}>
                        <RankBadge rank={e.rank} />
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <UserAvatar name={e.userName} />
                          <div style={{ fontWeight: 600, color: C.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {e.userName || 'Unknown'}
                            {isMyRow && (
                              <span style={{ fontSize: 10, background: C.accent, color: '#000', fontWeight: 700, padding: '2px 6px', borderRadius: 3, letterSpacing: 0.5, textTransform: 'uppercase', lineHeight: 1.4 }}>
                                YOU
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace', color: e.totalTournaments === 0 ? C.muted : e.bb100 >= 0 ? C.success : C.danger }}>
                        {e.totalTournaments === 0 ? '--' : e.bb100.toFixed(1)}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>
                        {e.totalTournaments === 0 ? '--' : `${e.itmPct.toFixed(1)}%`}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace', color: e.totalTournaments === 0 ? C.muted : e.roiPct >= 0 ? C.success : C.danger }}>
                        {e.totalTournaments === 0 ? '--' : `${e.roiPct.toFixed(1)}%`}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>
                        {e.totalTournaments === 0 ? '--' : e.totalHands.toLocaleString()}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>
                        {e.totalTournaments === 0 ? '--' : e.totalTournaments}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>
                        {e.totalTournaments === 0 ? '--' : e.tournamentWins}
                      </td>
                      <td style={{
                        ...cellStyle, textAlign: 'right', fontFamily: 'monospace',
                        fontWeight: 700,
                        color: e.totalTournaments === 0 ? C.muted : Number(e.totalNet) >= 0 ? C.emerald : C.rose,
                      }}>
                        {e.totalTournaments === 0 ? '--' : formatNet(Number(e.totalNet))}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace', color: e.totalTournaments === 0 ? C.muted : C.accent }}>
                        {e.totalTournaments === 0 ? '--' : Number(e.totalPayout).toLocaleString()}
                      </td>
                    </tr>
                  )})
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              <PagButton disabled={page === 0} onClick={() => setPage(p => p - 1)} label="Prev" />
              <span style={{ fontSize: 13, color: C.muted, lineHeight: '32px' }}>
                {page + 1} / {totalPages}
              </span>
              <PagButton disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} label="Next" />
            </div>
          )}
        </main>
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        @media (max-width: 640px) {
          .podium-section {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .podium-section > div {
            margin-bottom: 0 !important;
          }
        }
      `}</style>
    </div>
  )
}

// ─── Small components ─────────────────────────────────────────────────────────

const cellStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 14,
  color: C.muted,
  borderBottom: `1px solid ${C.border}`,
  whiteSpace: 'nowrap',
}

function PagButton({ disabled, onClick, label }: { disabled: boolean; onClick: () => void; label: string }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '6px 16px', borderRadius: 6,
        border: `1px solid ${C.border}`, background: disabled ? 'transparent' : C.card,
        color: disabled ? C.border : C.text,
        fontSize: 13, fontFamily: C.font, cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  )
}
