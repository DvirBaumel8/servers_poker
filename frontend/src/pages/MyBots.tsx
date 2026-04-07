import { useEffect, useState, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/axios'
import { useAuthStore } from '../store/authStore'
import { Sidebar } from '../components/Sidebar'
import BaseCard from '../components/BaseCard'
import { C, T, barTrack, barFill, microLabel } from '../styles/tokens'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Personality {
  aggression: number
  bluffFrequency: number
  riskTolerance: number
  tightness: number
}

interface BotListItem {
  id: string
  name: string
  description?: string
  active: boolean
  strategy?: { tier?: string; rules?: Record<string, unknown>[]; personality?: Personality }
  hasConflicts: boolean
  conflictMessages: string[]
  totalWinnings: number
  totalHands: number
  vpip: number
  aggFactor: number
  statsLoading: boolean
}

interface BotResponse {
  id: string
  name: string
  description?: string
  active: boolean
  strategy?: { tier?: string; rules?: Record<string, unknown>[]; personality?: Personality }
}

interface ConflictData {
  description?: string
  message?: string
}

// C, T, barTrack, barFill, microLabel imported from '../styles/tokens'

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
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 32px rgba(0,245,255,0.45)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 20px rgba(0,245,255,0.3)' }}
        style={{
          padding: '9px 18px',
          background: 'linear-gradient(135deg, #06b6d4, #00d4e8)',
          border: 'none', borderRadius: 8,
          color: '#000', fontWeight: 700, fontSize: 13,
          fontFamily: C.font, cursor: 'pointer', letterSpacing: 1,
          boxShadow: '0 0 20px rgba(0,245,255,0.3)',
          transition: 'box-shadow 0.2s',
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
      minHeight: 480, fontFamily: C.font, textAlign: 'center',
    }}>
      <div style={{
        width: 96, height: 96, borderRadius: '50%',
        background: C.accentDim, border: `1px solid rgba(0,229,255,0.15)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 44, marginBottom: 24,
        boxShadow: '0 0 40px rgba(0,229,255,0.12)',
      }}>
        🤖
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 10 }}>
        No bots in your roster yet
      </div>
      <div style={{ fontSize: 14, color: C.muted, maxWidth: 380, lineHeight: 1.6, marginBottom: 28 }}>
        Build your first strategy bot. Define its personality, set rules,
        then run simulations to test it before entering tournaments.
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['Personality Sliders', 'Rule Engine', 'Simulation Lab'].map((f) => (
          <span key={f} style={{
            padding: '5px 12px', borderRadius: 20,
            background: C.accentDim, border: `1px solid rgba(0,229,255,0.15)`,
            fontSize: 12, color: C.accent,
          }}>{f}</span>
        ))}
      </div>
      <button
        onClick={onCreateBot}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 32px rgba(0,245,255,0.45)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 20px rgba(0,245,255,0.3)' }}
        style={{
          padding: '12px 32px',
          background: 'linear-gradient(135deg, #06b6d4, #00d4e8)',
          border: 'none', borderRadius: 8,
          color: '#000', fontWeight: 700, fontSize: 14,
          fontFamily: C.font, cursor: 'pointer', letterSpacing: 0.5,
          boxShadow: '0 0 20px rgba(0,245,255,0.3)',
          transition: 'box-shadow 0.2s',
        }}
      >
        + Create your first bot
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
          Free plan: 1 bot slot. Upgrade to Pro for 5 bot slots and automatic tournament entry.
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

// ─── Bot DNA bars ─────────────────────────────────────────────────────────────

const TRAIT_META: { key: keyof Personality; label: string; color: string }[] = [
  { key: 'aggression',     label: 'Aggr',  color: '#e24b4a' },
  { key: 'bluffFrequency', label: 'Bluff', color: '#f59e0b' },
  { key: 'riskTolerance',  label: 'Risk',  color: '#8b5cf6' },
  { key: 'tightness',      label: 'Tight', color: '#00e5ff' },
]

function BotDNA({ personality }: { personality?: Personality }) {
  if (!personality) {
    return (
      <div style={{ fontSize: T.xs, color: C.muted, fontStyle: 'italic', padding: '6px 0' }}>
        No personality configured
      </div>
    )
  }
  return (
    <div>
      <div style={{ ...microLabel, marginBottom: 7 }}>
        Bot DNA
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {TRAIT_META.map(({ key, label, color }) => {
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: T.xs, color: C.muted, width: 30, flexShrink: 0, textAlign: 'right' }}>
                {label}
              </span>
              <div style={{ ...barTrack }}>
                <div style={barFill(personality[key], color, true)} />
              </div>
              <span style={{ fontSize: T.xs, color: C.muted, width: 22, textAlign: 'right' }}>
                {personality[key]}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Stat chip ────────────────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: string | null; color: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ ...microLabel, marginBottom: 3 }}>
        {label}
      </div>
      {value === null ? (
        <div style={{ width: 40, height: 16, background: C.border, borderRadius: 3 }} />
      ) : (
        <div style={{ fontSize: T.sm, fontWeight: 700, color, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      )}
    </div>
  )
}

// ─── Bot card ─────────────────────────────────────────────────────────────────

interface BotCardProps {
  bot: BotListItem
  actionHover: string | null
  conflictHover: string | null
  actionLoading: Record<string, boolean>
  onEdit: () => void
  onDuplicate: () => void
  onSimulate: () => void
  onDelete: () => void
  onConflictHover: (id: string | null) => void
  onActionHover: (key: string | null) => void
}

const BotCard = memo(function BotCard({
  bot, actionHover, conflictHover, actionLoading,
  onEdit, onDuplicate, onSimulate, onDelete,
  onConflictHover, onActionHover,
}: BotCardProps) {

  return (
    <BaseCard style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <button
            onClick={onEdit}
            style={{
              background: 'none', border: 'none', padding: 0,
              color: C.text, fontSize: 16, fontWeight: 700,
              cursor: 'pointer', fontFamily: C.font, textAlign: 'left',
              display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: 200,
            }}
          >
            {bot.name}
          </button>
          {bot.strategy?.tier && (
            <div style={{ ...microLabel, marginTop: 2 }}>
              {bot.strategy.tier} tier
            </div>
          )}
        </div>
        {bot.hasConflicts && (
          <div
            onMouseEnter={() => onConflictHover(bot.id)}
            onMouseLeave={() => onConflictHover(null)}
            style={{ position: 'relative', fontSize: 16, cursor: 'help', flexShrink: 0 }}
          >
            ⚠️
            {conflictHover === bot.id && (
              <div style={{
                position: 'absolute', bottom: '100%', right: 0,
                background: C.danger, color: '#fff',
                padding: '8px 10px', borderRadius: 8,
                fontSize: T.xs, whiteSpace: 'pre-wrap',
                boxShadow: '0 4px 12px rgba(226,75,74,0.4)',
                maxWidth: 220, zIndex: 200, pointerEvents: 'none', marginBottom: 6,
              }}>
                {bot.conflictMessages.length > 0 ? bot.conflictMessages.join('\n') : 'Rule conflict detected'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bot DNA */}
      <BotDNA personality={bot.strategy?.personality} />

      {/* Stats */}
      <div style={{
        display: 'flex', gap: 12, paddingTop: 10,
        borderTop: `1px solid ${C.border}`,
      }}>
        <StatChip
          label="Winnings"
          value={bot.statsLoading ? null : `$${(bot.totalWinnings / 100).toFixed(2)}`}
          color={bot.totalWinnings > 0 ? C.success : C.muted}
        />
        <StatChip
          label="VPIP"
          value={bot.statsLoading ? null : `${bot.vpip.toFixed(1)}%`}
          color={C.accent}
        />
        <StatChip
          label="Aggr"
          value={bot.statsLoading ? null : `${bot.aggFactor.toFixed(2)}x`}
          color={C.muted}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 2 }}>
        {/* Edit */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={onEdit}
            onMouseEnter={() => onActionHover(`edit-${bot.id}`)}
            onMouseLeave={() => onActionHover(null)}
            style={{
              width: 36, height: 36, padding: 0,
              background: actionHover === `edit-${bot.id}` ? 'rgba(0,229,255,0.06)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${actionHover === `edit-${bot.id}` ? C.accent : C.border}`,
              borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: actionHover === `edit-${bot.id}` ? C.accent : C.muted,
              transition: 'all 0.2s',
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
              padding: '4px 8px', fontSize: T.xs, color: C.text, whiteSpace: 'nowrap',
              pointerEvents: 'none', zIndex: 100, marginBottom: 6,
            }}>
              Edit Bot
            </div>
          )}
        </div>

        {/* Duplicate */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={onDuplicate}
            disabled={actionLoading[bot.id]}
            onMouseEnter={() => onActionHover(`dup-${bot.id}`)}
            onMouseLeave={() => onActionHover(null)}
            style={{
              width: 36, height: 36, padding: 0,
              background: actionHover === `dup-${bot.id}` ? 'rgba(0,229,255,0.06)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${actionHover === `dup-${bot.id}` ? C.accent : C.border}`,
              borderRadius: 6, cursor: actionLoading[bot.id] ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: actionLoading[bot.id] ? 0.6 : 1,
              color: actionHover === `dup-${bot.id}` ? C.accent : C.muted,
              transition: 'all 0.2s',
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
              padding: '4px 8px', fontSize: T.xs, color: C.text, whiteSpace: 'nowrap',
              pointerEvents: 'none', zIndex: 100, marginBottom: 6,
            }}>
              Duplicate
            </div>
          )}
        </div>

        {/* Test in Simulation Lab */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={onSimulate}
            onMouseEnter={() => onActionHover(`sim-${bot.id}`)}
            onMouseLeave={() => onActionHover(null)}
            style={{
              width: 36, height: 36, padding: 0,
              background: actionHover === `sim-${bot.id}` ? 'rgba(0,229,255,0.06)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${actionHover === `sim-${bot.id}` ? C.accent : C.border}`,
              borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: actionHover === `sim-${bot.id}` ? C.accent : C.muted,
              transition: 'all 0.2s',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
          </button>
          {actionHover === `sim-${bot.id}` && (
            <div style={{
              position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 6,
              padding: '4px 8px', fontSize: T.xs, color: C.text, whiteSpace: 'nowrap',
              pointerEvents: 'none', zIndex: 100, marginBottom: 6,
            }}>
              Test in Simulation Lab
            </div>
          )}
        </div>

        {/* Delete */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={onDelete}
            onMouseEnter={() => onActionHover(`del-${bot.id}`)}
            onMouseLeave={() => onActionHover(null)}
            style={{
              width: 36, height: 36, padding: 0,
              background: actionHover === `del-${bot.id}` ? 'rgba(226,75,74,0.08)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${actionHover === `del-${bot.id}` ? C.danger : C.border}`,
              borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: actionHover === `del-${bot.id}` ? C.danger : C.muted,
              transition: 'all 0.2s',
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
              padding: '4px 8px', fontSize: T.xs, color: C.text, whiteSpace: 'nowrap',
              pointerEvents: 'none', zIndex: 100, marginBottom: 6,
            }}>
              Delete
            </div>
          )}
        </div>
      </div>
    </BaseCard>
  )
})

// ─── Main page ────────────────────────────────────────────────────────────────

function botLimit(subscriptionStatus?: string | null): number {
  return subscriptionStatus === 'active' ? 5 : 1
}

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
        totalHands: 0,
        vpip: 0,
        aggFactor: 0,
        statsLoading: true,
      }))
      setBots(initial)

      // Fetch stats and conflicts in parallel for each bot
      await Promise.all(
        botList.map(async (bot: BotResponse, idx: number) => {
          try {
            // Fetch profile (stats)
            const profileRes = await api.get(`/bots/${bot.id}/profile`).catch(() => null)
            const totalWinnings = Number(profileRes?.data?.stats?.totalNet ?? 0)
            const totalHands = profileRes?.data?.stats?.totalHands ?? 0
            const vpip = profileRes?.data?.vpip ?? 0
            const aggFactor = profileRes?.data?.aggression ?? 0

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
                totalHands,
                vpip,
                aggFactor,
                statsLoading: false,
              }
              return updated
            })
          } catch {
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
    if (bots.length >= botLimit(user?.subscription_status)) {
      setUpgradeModal(true)
      return
    }

    setActionLoading((prev) => ({ ...prev, [botId]: true }))
    try {
      const res = await api.post(`/bots/${botId}/duplicate`)
      const newBot = res.data
      setBots((prev) => [
        {
          ...newBot,
          hasConflicts: false,
          conflictMessages: [],
          totalWinnings: 0,
          totalHands: 0,
          vpip: 0,
          aggFactor: 0,
          statsLoading: true,
        },
        ...prev,
      ])
      try {
        const profileRes = await api.get(`/bots/${newBot.id}/profile`).catch(() => null)
        const totalWinnings = Number(profileRes?.data?.stats?.totalNet ?? 0)
        const totalHands = profileRes?.data?.stats?.totalHands ?? 0
        const vpip = profileRes?.data?.vpip ?? 0
        const aggFactor = profileRes?.data?.aggression ?? 0
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
              ? { ...b, hasConflicts, conflictMessages, totalWinnings, totalHands, vpip, aggFactor, statsLoading: false }
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
    if (bots.length >= botLimit(user?.subscription_status)) {
      setUpgradeModal(true)
      return
    }
    navigate('/bots/build')
  }

  useEffect(() => {
    fetchBots()
  }, [])

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
      <Sidebar />
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
              {/* Search + sort toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Search bots…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: 240, padding: '10px 16px',
                    background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
                    color: C.text, fontSize: 15, fontFamily: C.font, outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                  {(['name', 'winnings'] as const).map((col) => (
                    <button
                      key={col}
                      onClick={() => toggleSort(col)}
                      style={{
                        padding: '7px 14px', background: 'transparent',
                        border: `1px solid ${sortBy === col ? C.accent : C.border}`,
                        borderRadius: 6,
                        color: sortBy === col ? C.accent : C.muted,
                        fontSize: 13, fontFamily: C.font, cursor: 'pointer', textTransform: 'capitalize',
                      }}
                    >
                      {col === 'name' ? 'Name' : 'Winnings'}{sortBy === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  ))}
                </div>
              </div>

              {/* Responsive card grid */}
              <style>{`
                .bot-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
                @media (max-width: 1100px) { .bot-grid { grid-template-columns: repeat(2, 1fr); } }
                @media (max-width: 680px)  { .bot-grid { grid-template-columns: 1fr; } }
              `}</style>

              {filtered.length === 0 ? (
                <div style={{ color: C.muted, textAlign: 'center', padding: '60px 0', fontSize: 14 }}>
                  No bots match your search.
                </div>
              ) : (
                <div className="bot-grid">
                  {filtered.map((bot) => (
                    <BotCard
                      key={bot.id}
                      bot={bot}
                      actionHover={actionHover}
                      conflictHover={conflictHover}
                      actionLoading={actionLoading}
                      onEdit={() => navigate(`/bots/build?id=${bot.id}`)}
                      onDuplicate={() => handleDuplicate(bot.id)}
                      onSimulate={() => navigate(`/simulations?botId=${bot.id}`)}
                      onDelete={() => setDeleteModal({ open: true, botId: bot.id, botName: bot.name })}
                      onConflictHover={setConflictHover}
                      onActionHover={setActionHover}
                    />
                  ))}
                </div>
              )}
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
