import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../lib/axios'
import { useAuthStore } from '../store/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BotListItem {
  id: string
  name: string
  description?: string
  active: boolean
  strategy?: { tier?: string; rules?: Record<string, unknown>[] }
  hasConflicts: boolean
  conflictMessages: string[]
  totalWinnings: number
  statsLoading: boolean
}

interface BotResponse {
  id: string
  name: string
  description?: string
  active: boolean
  strategy?: { tier?: string; rules?: Record<string, unknown>[] }
}

interface ConflictData {
  description?: string
  message?: string
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

// ─── Sidebar & Navigation ────────────────────────────────────────────────────

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
      <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>My Bots</div>
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

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onCreateBot }: { onCreateBot: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: 400, gap: 20, fontFamily: C.font,
    }}>
      <div style={{ fontSize: 48, color: C.accentDim }}>🤖</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>No bots yet</div>
      <div style={{ fontSize: 14, color: C.muted }}>Create your first bot!</div>
      <button
        onClick={onCreateBot}
        style={{
          marginTop: 12, padding: '10px 24px',
          background: 'linear-gradient(90deg, #00e5ff, #0070ff)',
          border: 'none', borderRadius: 8,
          color: '#000', fontWeight: 700, fontSize: 14,
          fontFamily: C.font, cursor: 'pointer',
        }}
      >
        Create Bot
      </button>
    </div>
  )
}

// ─── Delete confirmation modal ────────────────────────────────────────────────

function DeleteModal({
  open,
  botName,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean
  botName: string
  loading: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.font,
    }} onClick={onCancel}>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
        padding: 28, width: 360, maxWidth: '90vw',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 12 }}>Delete Bot?</div>
        <div style={{ fontSize: 14, color: C.muted, marginBottom: 20 }}>
          Are you sure you want to delete <strong>{botName}</strong>? This cannot be undone.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              flex: 1, padding: '10px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8,
              color: C.muted, fontFamily: C.font, cursor: 'pointer', opacity: loading ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              flex: 1, padding: '10px', background: C.danger, border: 'none', borderRadius: 8,
              color: '#fff', fontWeight: 700, fontFamily: C.font,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Upgrade modal ────────────────────────────────────────────────────────────

function UpgradeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.font,
    }} onClick={onClose}>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
        padding: 28, width: 380, maxWidth: '90vw',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 12 }}>Upgrade to Pro</div>
        <div style={{ fontSize: 14, color: C.muted, marginBottom: 20 }}>
          Free users can create 1 bot. Upgrade to Pro for unlimited bots!
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8,
              color: C.muted, fontFamily: C.font, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            style={{
              flex: 1, padding: '10px', background: 'linear-gradient(90deg, #00e5ff, #0070ff)',
              border: 'none', borderRadius: 8,
              color: '#000', fontWeight: 700, fontFamily: C.font, cursor: 'pointer',
            }}
          >
            Upgrade
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MyBots() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [bots, setBots] = useState<BotListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'winnings'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; botId: string; botName: string } | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [upgradeModal, setUpgradeModal] = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [conflictHover, setConflictHover] = useState<string | null>(null)
  const [actionHover, setActionHover] = useState<string | null>(null)

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('mybots_sidebar_collapsed')
    return saved !== null ? JSON.parse(saved) : false
  })

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const newVal = !prev
      localStorage.setItem('mybots_sidebar_collapsed', JSON.stringify(newVal))
      return newVal
    })
  }

  async function fetchBots() {
    setLoading(true)
    try {
      const res = await api.get('/bots/my?limit=100&offset=0')
      const botList = (res.data.data ?? []).filter((b: BotResponse) => b.active !== false)
      const initial: BotListItem[] = botList.map((b: BotResponse) => ({
        ...b,
        hasConflicts: false,
        conflictMessages: [],
        totalWinnings: 0,
        statsLoading: true,
      }))
      setBots(initial)

      // Fetch stats and conflicts in parallel for each bot
      await Promise.all(
        botList.map(async (bot: BotResponse, idx: number) => {
          try {
            // Fetch profile (stats)
            const profileRes = await api.get(`/bots/${bot.id}/profile`).catch(() => null)
            const totalWinnings = profileRes?.data?.stats?.totalNet ?? 0

            // Check conflicts (only for non-quick tier)
            let hasConflicts = false
            let conflictMessages: string[] = []
            if (bot.strategy?.tier && bot.strategy.tier !== 'quick') {
              const conflictRes = await api.post('/bots/internal/check-conflicts', { strategy: bot.strategy }).catch(() => null)
              if (conflictRes && conflictRes.data?.conflicts?.length > 0) {
                hasConflicts = true
                conflictMessages = conflictRes.data.conflicts.map((c: ConflictData) => c.description || 'Rule conflict detected')
              }
            }

            // Update bot item
            setBots((prev) => {
              const updated = [...prev]
              updated[idx] = {
                ...updated[idx],
                hasConflicts,
                conflictMessages,
                totalWinnings,
                statsLoading: false,
              }
              return updated
            })
          } catch {
            // On error, just mark statsLoading as false
            setBots((prev) => {
              const updated = [...prev]
              updated[idx] = { ...updated[idx], statsLoading: false }
              return updated
            })
          }
        })
      )
    } catch (err) {
      console.error('Failed to fetch bots:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(botId: string) {
    setDeleteLoading(true)
    try {
      await api.delete(`/bots/${botId}`)
      setBots((prev) => prev.filter((b) => b.id !== botId))
      setDeleteModal(null)
    } catch (err) {
      console.error('Failed to delete bot:', err)
    } finally {
      setDeleteLoading(false)
    }
  }

  async function handleDuplicate(botId: string) {
    // Check free tier limit
    if (user?.role === 'user' && bots.length >= 1) {
      setUpgradeModal(true)
      return
    }

    setActionLoading((prev) => ({ ...prev, [botId]: true }))
    try {
      const res = await api.post(`/bots/${botId}/duplicate`)
      const newBot = res.data
      // Add new bot to list with stats loading
      setBots((prev) => [
        {
          ...newBot,
          hasConflicts: false,
          conflictMessages: [],
          totalWinnings: 0,
          statsLoading: true,
        },
        ...prev,
      ])
      // Fetch stats and conflicts for the new bot
      try {
        const profileRes = await api.get(`/bots/${newBot.id}/profile`).catch(() => null)
        const totalWinnings = profileRes?.data?.stats?.totalNet ?? 0
        let hasConflicts = false
        let conflictMessages: string[] = []
        if (newBot.strategy?.tier && newBot.strategy.tier !== 'quick') {
          const conflictRes = await api.post('/bots/internal/check-conflicts', { strategy: newBot.strategy }).catch(() => null)
          if (conflictRes && conflictRes.data?.conflicts?.length > 0) {
            hasConflicts = true
            conflictMessages = conflictRes.data.conflicts.map((c: ConflictData) => c.description || 'Rule conflict detected')
          }
        }
        setBots((prev) =>
          prev.map((b) =>
            b.id === newBot.id
              ? { ...b, hasConflicts, conflictMessages, totalWinnings, statsLoading: false }
              : b
          )
        )
      } catch {
        setBots((prev) =>
          prev.map((b) => (b.id === newBot.id ? { ...b, statsLoading: false } : b))
        )
      }
    } catch (err) {
      console.error('Failed to duplicate bot:', err)
    } finally {
      setActionLoading((prev) => ({ ...prev, [botId]: false }))
    }
  }

  function handleCreateBot() {
    // Check free tier limit: if user is not admin and already has a bot
    if (user?.role === 'user' && bots.length >= 1) {
      setUpgradeModal(true)
      return
    }
    navigate('/bots/build')
  }

  useEffect(() => {
    fetchBots()
  }, [])

  // Filter and sort
  const filtered = bots
    .filter((b) => b.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') {
        return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
      } else {
        return sortDir === 'asc' ? a.totalWinnings - b.totalWinnings : b.totalWinnings - a.totalWinnings
      }
    })

  const toggleSort = (col: 'name' | 'winnings') => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(col)
      setSortDir('asc')
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: C.font }}>
      <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebarCollapse} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar onCreateBot={handleCreateBot} />
        <main style={{ flex: 1, overflowY: 'auto', padding: '28px' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
              <div style={{ color: C.muted }}>Loading bots…</div>
            </div>
          ) : bots.length === 0 ? (
            <EmptyState onCreateBot={handleCreateBot} />
          ) : (
            <>
              {/* Search bar */}
              <div style={{ marginBottom: 20 }}>
                <input
                  type="text"
                  placeholder="Search bots…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: '100%', maxWidth: 300, padding: '10px 14px',
                    background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
                    color: C.text, fontSize: 14, fontFamily: C.font,
                    outline: 'none',
                  }}
                />
              </div>

              {/* Table */}
              <div style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
                overflow: 'hidden', fontFamily: C.font,
              }}>
                {/* Header */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 40px 140px 120px',
                  gap: 16, padding: '12px 16px',
                  background: C.cardHover, borderBottom: `1px solid ${C.border}`,
                  position: 'sticky', top: 0, zIndex: 10,
                  fontSize: 12, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
                }}>
                  <button
                    onClick={() => toggleSort('name')}
                    style={{
                      textAlign: 'left', background: 'none', border: 'none',
                      color: sortBy === 'name' ? C.accent : C.muted,
                      cursor: 'pointer', fontFamily: C.font, fontSize: 12, fontWeight: 700,
                    }}
                  >
                    Bot Name {sortBy === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
                  </button>
                  <div></div>
                  <button
                    onClick={() => toggleSort('winnings')}
                    style={{
                      textAlign: 'right', background: 'none', border: 'none',
                      color: sortBy === 'winnings' ? C.accent : C.muted,
                      cursor: 'pointer', fontFamily: C.font, fontSize: 12, fontWeight: 700,
                    }}
                  >
                    Winnings {sortBy === 'winnings' && (sortDir === 'asc' ? '↑' : '↓')}
                  </button>
                  <div style={{ textAlign: 'right' }}>Actions</div>
                </div>

                {/* Rows */}
                {filtered.map((bot) => (
                  <div
                    key={bot.id}
                    style={{
                      display: 'grid', gridTemplateColumns: '1fr 40px 140px 120px',
                      gap: 16, padding: '14px 16px',
                      borderBottom: `1px solid ${C.border}`,
                      alignItems: 'center',
                      background: C.card,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = C.cardHover }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = C.card }}
                  >
                    {/* Bot Name */}
                    <button
                      onClick={() => navigate(`/bots/build?id=${bot.id}`)}
                      style={{
                        textAlign: 'left', background: 'none', border: 'none',
                        color: C.text, fontSize: 14, fontWeight: 600,
                        cursor: 'pointer', fontFamily: C.font, padding: 0,
                      }}
                    >
                      {bot.name}
                    </button>

                    {/* Conflict Icon */}
                    <div
                      onMouseEnter={() => setConflictHover(bot.id)}
                      onMouseLeave={() => setConflictHover(null)}
                      style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}
                    >
                      {bot.hasConflicts && (
                        <div style={{ fontSize: 18, cursor: 'help' }}>
                          ⚠️
                        </div>
                      )}
                    </div>
                    {conflictHover === bot.id && bot.hasConflicts && (
                      <div
                        style={{
                          position: 'fixed', zIndex: 1000,
                          background: C.danger, color: '#fff', padding: '10px 14px',
                          borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap',
                          boxShadow: '0 4px 12px rgba(226,75,74,0.4)', maxWidth: 280,
                          pointerEvents: 'none',
                          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        }}
                      >
                        {bot.conflictMessages.length > 0 ? bot.conflictMessages.join('\n') : 'Rule conflict detected'}
                      </div>
                    )}

                    {/* Total Winnings */}
                    <div style={{ textAlign: 'right', fontSize: 14, color: bot.totalWinnings > 0 ? C.success : C.muted }}>
                      {bot.statsLoading ? (
                        <div style={{ display: 'inline-block', width: 40, height: 16, background: C.border, borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
                      ) : (
                        `$${(bot.totalWinnings / 100).toFixed(2)}`
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      {/* Edit */}
                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={() => navigate(`/bots/build?id=${bot.id}`)}
                          onMouseEnter={() => setActionHover(`edit-${bot.id}`)}
                          onMouseLeave={() => setActionHover(null)}
                          style={{
                            width: 28, height: 28, padding: 0,
                            background: 'transparent', border: `1px solid ${C.border}`,
                            borderRadius: 6, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s',
                            borderColor: actionHover === `edit-${bot.id}` ? C.accent : C.border,
                            color: actionHover === `edit-${bot.id}` ? C.accent : C.muted,
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        {actionHover === `edit-${bot.id}` && (
                          <div style={{
                            position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                            background: C.card, border: `1px solid ${C.border}`, borderRadius: 6,
                            padding: '4px 8px', fontSize: 11, color: C.text, whiteSpace: 'nowrap',
                            pointerEvents: 'none', zIndex: 100, marginBottom: 6,
                          }}>
                            Edit
                          </div>
                        )}
                      </div>

                      {/* Duplicate */}
                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={() => handleDuplicate(bot.id)}
                          disabled={actionLoading[bot.id]}
                          onMouseEnter={() => setActionHover(`dup-${bot.id}`)}
                          onMouseLeave={() => setActionHover(null)}
                          style={{
                            width: 28, height: 28, padding: 0,
                            background: 'transparent', border: `1px solid ${C.border}`,
                            borderRadius: 6, cursor: actionLoading[bot.id] ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            opacity: actionLoading[bot.id] ? 0.6 : 1,
                            transition: 'all 0.2s',
                            borderColor: actionHover === `dup-${bot.id}` ? C.accent : C.border,
                            color: actionHover === `dup-${bot.id}` ? C.accent : C.muted,
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <g><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></g>
                          </svg>
                        </button>
                        {actionHover === `dup-${bot.id}` && (
                          <div style={{
                            position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                            background: C.card, border: `1px solid ${C.border}`, borderRadius: 6,
                            padding: '4px 8px', fontSize: 11, color: C.text, whiteSpace: 'nowrap',
                            pointerEvents: 'none', zIndex: 100, marginBottom: 6,
                          }}>
                            Duplicate
                          </div>
                        )}
                      </div>

                      {/* Delete */}
                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={() => setDeleteModal({ open: true, botId: bot.id, botName: bot.name })}
                          onMouseEnter={() => setActionHover(`del-${bot.id}`)}
                          onMouseLeave={() => setActionHover(null)}
                          style={{
                            width: 28, height: 28, padding: 0,
                            background: 'transparent', border: `1px solid ${C.border}`,
                            borderRadius: 6, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s',
                            borderColor: actionHover === `del-${bot.id}` ? C.danger : C.border,
                            color: actionHover === `del-${bot.id}` ? C.danger : C.muted,
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                          </svg>
                        </button>
                        {actionHover === `del-${bot.id}` && (
                          <div style={{
                            position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                            background: C.card, border: `1px solid ${C.border}`, borderRadius: 6,
                            padding: '4px 8px', fontSize: 11, color: C.text, whiteSpace: 'nowrap',
                            pointerEvents: 'none', zIndex: 100, marginBottom: 6,
                          }}>
                            Delete
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Modals */}
      <DeleteModal
        open={deleteModal?.open ?? false}
        botName={deleteModal?.botName ?? ''}
        loading={deleteLoading}
        onConfirm={() => deleteModal && handleDelete(deleteModal.botId)}
        onCancel={() => setDeleteModal(null)}
      />
      <UpgradeModal open={upgradeModal} onClose={() => setUpgradeModal(false)} />
    </div>
  )
}
