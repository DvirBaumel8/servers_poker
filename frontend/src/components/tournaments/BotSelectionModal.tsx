import { useEffect, useState } from 'react'
import api from '../../lib/axios'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Bot {
  id: string
  name: string
  description?: string
  strategy?: { personality?: Record<string, number> }
  active?: boolean
  win_rate?: number
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
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

// ─── Modal ────────────────────────────────────────────────────────────────────

interface BotSelectionModalProps {
  tournamentId: string
  onClose: () => void
  onJoining: () => void
  onSuccess: (botId: string) => void
  onError: (message: string) => void
}

export default function BotSelectionModal({
  tournamentId,
  onClose,
  onJoining,
  onSuccess,
  onError,
}: BotSelectionModalProps) {
  const [bots, setBots] = useState<Bot[]>([])
  const [selectedBotId, setSelectedBotId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchUserBots()
  }, [])

  async function fetchUserBots() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/bots/my')
      const data = res.data
      const allBots = Array.isArray(data) ? data : data.data ?? []
      const botList = allBots.filter((b: Bot) => b.active !== false)
      setBots(botList)
      if (botList.length > 0) {
        setSelectedBotId(botList[0].id)
      }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to load bots'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  async function handleJoinTournament() {
    if (!selectedBotId) return

    setSubmitting(true)
    onJoining()
    try {
      await api.post(`/tournaments/${tournamentId}/register`, { bot_id: selectedBotId })
      onSuccess(selectedBotId)
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to join tournament'
      onError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const selectedBot = bots.find((b) => b.id === selectedBotId)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: C.font,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: 28,
          width: 420,
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>
          Select a Bot
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
          Which bot would you like to register for this tournament?
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(226,75,74,0.1)',
              border: `1px solid ${C.danger}`,
              borderRadius: 8,
              padding: '10px 12px',
              color: C.danger,
              fontSize: 12,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: C.muted }}>
            Loading your bots...
          </div>
        ) : bots.length === 0 ? (
          <div
            style={{
              background: 'rgba(245,158,11,0.1)',
              border: `1px solid rgba(245,158,11,0.3)`,
              borderRadius: 8,
              padding: '16px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 13, color: C.text, marginBottom: 8 }}>
              You don't have any bots yet.
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
              Create a bot to participate in tournaments.
            </div>
            <button
              onClick={() => {
                onClose()
                window.location.href = '/bots/build'
              }}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                background: 'linear-gradient(90deg, #00e5ff, #0070ff)',
                border: 'none',
                color: '#000',
                fontWeight: 700,
                fontSize: 12,
                fontFamily: C.font,
                cursor: 'pointer',
              }}
            >
              Create Bot
            </button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
              {bots.map((bot) => (
                <label
                  key={bot.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    background: selectedBotId === bot.id ? C.accentDim : 'transparent',
                    border: `1px solid ${selectedBotId === bot.id ? C.accent : C.border}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (selectedBotId !== bot.id) {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'
                      ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,229,255,0.3)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedBotId !== bot.id) {
                      (e.currentTarget as HTMLElement).style.background = 'transparent'
                      ;(e.currentTarget as HTMLElement).style.borderColor = C.border
                    }
                  }}
                >
                  <input
                    type="radio"
                    name="bot"
                    value={bot.id}
                    checked={selectedBotId === bot.id}
                    onChange={() => setSelectedBotId(bot.id)}
                    style={{ accentColor: C.accent, cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>
                      {bot.name}
                    </div>
                    {bot.win_rate !== undefined && (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                        {bot.win_rate > 0 ? `${bot.win_rate}% win rate` : 'No games yet'}
                      </div>
                    )}
                  </div>
                  {bot.active && (
                    <div
                      style={{
                        fontSize: 10,
                        color: C.success,
                        background: 'rgba(29,158,117,0.1)',
                        padding: '2px 8px',
                        borderRadius: 20,
                        border: `1px solid rgba(29,158,117,0.3)`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Active
                    </div>
                  )}
                </label>
              ))}
            </div>

            {selectedBot && (
              <div
                style={{
                  background: 'rgba(0,229,255,0.05)',
                  border: `1px solid ${C.accentDim}`,
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 20,
                  fontSize: 12,
                  color: C.text,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  📋 {selectedBot.name} will be registered
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>
                  Your bot will play automatically in this tournament. You can watch live games and check results in real-time.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={onClose}
                disabled={submitting}
                style={{
                  flex: 1,
                  padding: '11px',
                  background: 'transparent',
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  color: C.muted,
                  fontFamily: C.font,
                  fontSize: 13,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleJoinTournament}
                disabled={!selectedBotId || submitting}
                style={{
                  flex: 1,
                  padding: '11px',
                  background: 'linear-gradient(90deg, #00e5ff, #0070ff)',
                  border: 'none',
                  borderRadius: 8,
                  color: '#000',
                  fontWeight: 700,
                  fontFamily: C.font,
                  fontSize: 13,
                  cursor: selectedBotId && !submitting ? 'pointer' : 'not-allowed',
                  opacity: !selectedBotId || submitting ? 0.6 : 1,
                }}
              >
                {submitting ? 'Joining...' : 'Join Tournament →'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
