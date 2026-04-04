import { useEffect, useState, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '../lib/axios'
import { useAuthStore } from '../store/authStore'
import { useSidebarStore } from '../store/sidebarStore'
import PersonalityEditor from '../components/builder/PersonalityEditor'
import RulesEditor from '../components/builder/RulesEditor'
import RangeChartComponent from '../components/builder/RangeChart'
import SimulatePanel from '../components/builder/SimulatePanel'

// Types
type StrategyTier = 'quick' | 'strategy' | 'pro'

interface Personality {
  aggression: number
  bluffFrequency: number
  riskTolerance: number
  tightness: number
}

interface Condition {
  category: string
  field: string
  operator: string
  value: string | number | boolean
}

interface ActionDefinition {
  type: string
  sizing?: { mode: string; value: number }
}

interface Rule {
  id: string
  priority: number
  conditions: Condition[]
  action: ActionDefinition
  enabled: boolean
  label?: string
}

interface StreetRules {
  preflop?: Rule[]
  flop?: Rule[]
  turn?: Rule[]
  river?: Rule[]
}

type RangeAction = 'raise' | 'call' | 'fold' | null
type RangeChart = Record<string, RangeAction>

interface BotStrategy {
  version: 1
  tier: StrategyTier
  personality: Personality
  rules?: StreetRules
  rangeChart?: RangeChart
}

interface BotState {
  botId?: string
  name: string
  description: string
  originalName: string
  originalDescription: string
  tier: StrategyTier
  strategy: BotStrategy
  isDirty: boolean
  isSaving: boolean
  isLoading: boolean
  error: null | string
}

interface PersonalityPreset {
  id: string
  name: string
  description: string
  personality: Personality
  styleDescription: string
}

interface ConditionFieldDef {
  category: string
  field: string
  description: string
  operators: string[]
  valueType: string
}

// Design tokens
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

export default function BotBuilder() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isAuthenticated, user, logout } = useAuthStore()

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/signin')
    }
  }, [isAuthenticated, navigate])

  const [tierWarning, setTierWarning] = useState('')

  const [state, setState] = useState<BotState>({
    name: 'My Bot',
    description: '',
    originalName: 'My Bot',
    originalDescription: '',
    tier: 'quick',
    strategy: {
      version: 1,
      tier: 'quick',
      personality: {
        aggression: 50,
        bluffFrequency: 30,
        riskTolerance: 50,
        tightness: 50,
      },
    },
    isDirty: false,
    isSaving: false,
    isLoading: !!searchParams.get('id'),
    error: null,
  })

  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedJustNow, setSavedJustNow] = useState(false)
  const [conditionFields, setConditionFields] = useState<ConditionFieldDef[]>([])
  const [presets, setPresets] = useState<PersonalityPreset[]>([])
  const [conflicts, setConflicts] = useState<Record<string, unknown>[]>([])
  const [sidebarVisible, setSidebarVisible] = useState(() => {
    const saved = localStorage.getItem('botbuilder_sidebar_visible')
    return saved !== null ? JSON.parse(saved) : true
  })
  const sidebarCollapsed = useSidebarStore((s) => s.collapsed)
  const [simulatorOpen, setSimulatorOpen] = useState(false)
  const personalityRef = useRef<HTMLDivElement>(null)
  const rulesRef = useRef<HTMLDivElement>(null)

  // Always holds the latest state so the unmount cleanup can access it
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  // Flush unsaved changes immediately when navigating away
  useEffect(() => {
    return () => {
      const s = stateRef.current
      if (!s.isDirty || !s.botId) return
      api.put(`/bots/${s.botId}`, {
        name: s.name,
        description: s.description,
        strategy: {
          version: 1,
          tier: s.tier,
          personality: s.strategy.personality,
          ...(s.tier !== 'quick' && {
            rules: s.strategy.rules,
            rangeChart: s.strategy.rangeChart,
          }),
        },
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Create bot immediately on mount for new bots (no ?id= param)
  useEffect(() => {
    if (searchParams.get('id') || !isAuthenticated) return

    api.get('/bots/my?limit=100&offset=0')
      .then((res) => {
        const existingNames = new Set<string>(
          (res.data.data ?? [])
            .filter((b: { name: string; active?: boolean }) => b.active !== false)
            .map((b: { name: string }) => b.name)
        )
        let name = 'My Bot'
        let counter = 2
        while (existingNames.has(name)) {
          name = `My Bot ${counter++}`
        }

        return api.post('/bots/internal', {
          name,
          description: '',
          strategy: {
            version: 1,
            tier: 'quick' as const,
            personality: { aggression: 50, bluffFrequency: 30, riskTolerance: 50, tightness: 50 },
          },
        })
      })
      .then((res) => {
        const bot = res.data
        setState((prev) => ({ ...prev, botId: bot.id, name: bot.name, originalName: bot.name, isDirty: false }))
        setSearchParams({ id: bot.id }, { replace: true })
      })
      .catch((err) => {
        console.error('❌ Failed to create bot draft:', err)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  // Auto-save on name/description/strategy changes (updates only — bot already exists)
  useEffect(() => {
    if (!state.isDirty || !state.botId) {
      return
    }

    const timer = setTimeout(() => {
      const payload = {
        name: state.name,
        description: state.description,
        strategy: {
          version: 1,
          tier: state.tier,
          personality: state.strategy.personality,
          ...(state.tier !== 'quick' && {
            rules: state.strategy.rules,
            rangeChart: state.strategy.rangeChart,
          }),
        },
      }

      setState((prev) => ({ ...prev, isSaving: true }))

      api.put(`/bots/${state.botId}`, payload)
        .then((res) => {
          const newBotId = res.data.id
          setSaveError(null)

          setState((prev) => ({
            ...prev,
            botId: newBotId,
            originalName: payload.name,
            originalDescription: payload.description,
            isDirty: false,
            isSaving: false,
          }))

          setSavedJustNow(true)
          setTimeout(() => setSavedJustNow(false), 2500)

          // Check for conflicts
          api
            .post('/bots/internal/check-conflicts', { strategy: payload.strategy })
            .then((res) => {
              setConflicts(res.data.conflicts || [])
            })
            .catch((err) => {
              console.error('❌ Conflicts check failed:', err)
            })
        })
        .catch((err) => {
          const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          setSaveError(msg ?? 'Failed to save — please try a different name.')
          setState((prev) => ({ ...prev, isSaving: false }))
        })
    }, 500)

    return () => clearTimeout(timer)
  }, [state.isDirty, state.name, state.description, state.tier, state.strategy, state.botId, state.originalName])

  // Load bot if ?id= param present
  useEffect(() => {
    const botId = searchParams.get('id')
    if (botId && isAuthenticated) {
      api.get(`/bots/${botId}`)
        .then((res) => {
          const bot = res.data
          setState((prev) => ({
            ...prev,
            botId: bot.id,
            name: bot.name,
            description: bot.description || '',
            originalName: bot.name,
            originalDescription: bot.description || '',
            tier: bot.strategy?.tier || 'quick',
            strategy: bot.strategy || prev.strategy,
            isDirty: false,
            isLoading: false,
          }))
        })
        .catch(() => {
          setState((prev) => ({
            ...prev,
            error: 'Failed to load bot',
            isLoading: false,
          }))
        })
    }
  }, [searchParams, isAuthenticated])

  // Load condition fields and presets
  useEffect(() => {
    if (isAuthenticated) {
      Promise.all([
        api.get('/bots/internal/condition-fields'),
        api.get('/bots/internal/presets'),
      ])
        .then(([fieldsRes, presetsRes]) => {
          setConditionFields(fieldsRes.data.fields)
          setPresets(presetsRes.data.presets)
        })
        .catch(() => {
          setState((prev) => ({
            ...prev,
            error: 'Failed to load builder data',
          }))
        })
    }
  }, [isAuthenticated])

  // Update strategy
  const updateStrategy = (updates: Partial<BotStrategy>) => {
    setState((prev) => {
      const newStrategy = { ...prev.strategy, ...updates }
      const isDirty =
        prev.name !== prev.originalName ||
        prev.description !== prev.originalDescription ||
        JSON.stringify(newStrategy) !== JSON.stringify(prev.strategy)

      return {
        ...prev,
        strategy: newStrategy,
        isDirty,
      }
    })
  }

  // Handle tier change
  const handleTierChange = (newTier: StrategyTier) => {
    if (state.isDirty && newTier !== state.tier) {
      setTierWarning('Switching modes will auto-save your current settings. Some settings may not carry over to the new mode.')
      setTimeout(() => setTierWarning(''), 4000)
    }
    setState((prev) => ({
      ...prev,
      tier: newTier,
      strategy: {
        ...prev.strategy,
        tier: newTier,
      },
      isDirty: true,
    }))

    // Scroll to the relevant section for this tier
    setTimeout(() => {
      if (newTier === 'quick') {
        personalityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (newTier === 'strategy') {
        rulesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 0)
  }

  // Toggle sidebar
  const toggleSidebar = () => {
    setSidebarVisible((prev) => {
      const newVal = !prev
      localStorage.setItem('botbuilder_sidebar_visible', JSON.stringify(newVal))
      return newVal
    })
  }

  const toggleSidebarCollapse = useSidebarStore((s) => s.toggle)

  if (!isAuthenticated) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: C.bg,
          color: C.text,
          fontFamily: C.font,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: C.muted }}>Redirecting to sign in...</p>
        </div>
      </div>
    )
  }

  if (state.isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: C.bg,
          color: C.text,
          fontFamily: C.font,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: C.muted }}>Loading bot...</p>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.bg,
        color: C.text,
        fontFamily: C.font,
        display: 'flex',
      }}
    >
      {/* Sidebar */}
      {sidebarVisible && (
        <div
          style={{
            width: sidebarCollapsed ? 60 : 210,
            height: '100vh',
            background: '#0d0d22',
            borderRight: `1px solid ${C.border}`,
            display: 'flex',
            flexDirection: 'column',
            position: 'fixed',
            left: 0,
            top: 0,
            zIndex: 40,
            transition: 'width 0.2s',
            overflow: 'visible',
            flexShrink: 0,
            fontFamily: C.font,
          }}
        >
          {/* Logo */}
          <div style={{ padding: sidebarCollapsed ? '12px 12px 8px' : '28px 20px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            {!sidebarCollapsed && (
              <>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', lineHeight: 1.1 }}>
                  <span style={{ color: C.text }}>Bot</span>
                  <span style={{ color: C.accent }}>Royale</span>
                </div>
                <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginTop: 6, whiteSpace: 'nowrap' }}>
                  Automate. Compete. Win.
                </div>
              </>
            )}
            {sidebarCollapsed && <div style={{ fontSize: 16, color: C.accent }}>&#9670;</div>}
          </div>

          {/* Navigation */}
          <nav style={{ flex: 1, padding: '20px 0', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'visible' }}>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSidebarCollapse() }}
              style={{
                position: 'absolute', right: '-17px', top: '50%', transform: 'translateY(-50%)',
                width: 34, height: 34, background: 'transparent', border: 'none',
                color: 'rgba(0,229,255,0.5)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 'bold', transition: 'color 0.2s', zIndex: 10, padding: 0,
              }}
              title={sidebarCollapsed ? 'Expand' : 'Collapse'}
            >
              {sidebarCollapsed ? '\u00BB' : '\u00AB'}
            </button>
            {[
              { label: 'Home', path: '/' },
              { label: 'My Bots', path: '/bots' },
              { label: 'Tournaments', path: '/tournaments' },
              { label: 'Leaderboard', path: '/leaderboard' },
              { label: 'Tournament Analytics', path: '/games' },
              { label: 'Simulations', path: '/simulations' },
            ].map(({ label, path }) => {
              const active = location.pathname === path
              const icons: Record<string, React.ReactNode> = {
                Home: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
                'My Bots': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
                Tournaments: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/><circle cx="3" cy="18" r="1" fill="currentColor"/></svg>,
                Leaderboard: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="14" width="4" height="8"/><rect x="10" y="6" width="4" height="16"/><rect x="16" y="10" width="4" height="12"/></svg>,
                'Tournament Analytics': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>,
                Simulations: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
              }
              return (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', gap: sidebarCollapsed ? 0 : 10,
                    width: '100%', padding: sidebarCollapsed ? '10px 0' : '10px 20px',
                    background: active ? C.accentDim : 'transparent',
                    border: 'none', borderLeft: sidebarCollapsed ? 'none' : `3px solid ${active ? C.accent : 'transparent'}`,
                    color: active ? C.text : C.muted,
                    fontSize: 14, fontFamily: C.font, cursor: 'pointer',
                    textAlign: 'left', transition: 'all 0.15s',
                  }}
                >
                  <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {icons[label]}
                  </span>
                  {!sidebarCollapsed && label}
                </button>
              )
            })}
          </nav>

          {/* User section */}
          <div style={{ padding: sidebarCollapsed ? '20px 4px' : '16px 20px', borderTop: `1px solid ${C.border}`, position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'linear-gradient(135deg, #00e5ff, #0070ff)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, color: '#000', flexShrink: 0,
              }}>
                {(user?.name?.[0] ?? '?').toUpperCase()}
              </div>
              {!sidebarCollapsed && (
                <div style={{ overflow: 'hidden', flex: 1 }}>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.name ?? 'Player'}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>{user?.role ?? 'user'}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          marginLeft: sidebarVisible ? (sidebarCollapsed ? '60px' : '210px') : '0',
          transition: 'margin-left 0.3s ease',
        }}
      >
        {/* Header */}
        <style>{`
          @keyframes savePulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.45; }
          }
        `}</style>
        <div
          style={{
            padding: '2rem',
            borderBottom: `1px solid ${C.border}`,
            background: `linear-gradient(135deg, ${C.card} 0%, ${C.bg} 100%)`,
            display: 'flex',
            gap: '1rem',
            alignItems: 'flex-start',
          }}
        >
          {!sidebarVisible && (
            <button
              onClick={toggleSidebar}
              style={{
                background: 'none',
                border: 'none',
                color: C.accent,
                cursor: 'pointer',
                padding: '0.5rem',
                fontSize: '1.25rem',
                marginTop: '0.5rem',
              }}
              title="Show sidebar"
            >
              ☰
            </button>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: C.muted, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Bot Name
            </label>
            <input
              type="text"
              value={state.name}
              onChange={(e) => {
                const newName = e.target.value
                const isDirty = newName !== state.originalName || state.description !== state.originalDescription
                setSaveError(null)
                setState((prev) => ({
                  ...prev,
                  name: newName,
                  isDirty,
                }))
              }}
              placeholder="e.g., Aggressive Bot"
              style={{
                background: C.bg,
                border: `1.5px solid ${saveError ? '#e24b4a' : C.border}`,
                color: C.text,
                padding: '0.875rem 1rem',
                borderRadius: '0.5rem',
                fontFamily: C.font,
                fontSize: '1.125rem',
                fontWeight: '600',
                width: '350px',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box',
              }}
            />
            {saveError && (
              <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: '#e24b4a' }}>
                {saveError}
              </div>
            )}
          </div>

          {/* Auto-save status indicator */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', alignSelf: 'center' }}>
            {state.isSaving && (
              <span style={{
                fontSize: '0.8rem',
                color: C.muted,
                fontFamily: C.font,
                animation: 'savePulse 1s ease-in-out infinite',
              }}>
                Saving...
              </span>
            )}
            {savedJustNow && !state.isSaving && (
              <span style={{
                fontSize: '0.8rem',
                color: C.success,
                fontFamily: C.font,
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}>
                ✓ Saved
              </span>
            )}
          </div>
        </div>

        {/* Tier selector */}
        <div
          style={{
            padding: '1rem 1.5rem',
            display: 'flex',
            gap: '1rem',
            borderBottom: `1px solid ${C.border}`,
            background: C.bg,
            zIndex: 10,
            alignItems: 'center',
          }}
        >
          {(['quick', 'strategy', 'pro'] as const).map((tier) => (
            <button
              key={tier}
              onClick={() => handleTierChange(tier)}
              style={{
                padding: '0.625rem 1.25rem',
                background: state.tier === tier ? 'rgba(0, 229, 255, 0.12)' : C.card,
                color: state.tier === tier ? C.accent : C.text,
                border: `2px solid ${state.tier === tier ? C.accent : C.border}`,
                borderRadius: '0.375rem',
                fontFamily: C.font,
                fontSize: '0.9rem',
                fontWeight: state.tier === tier ? 'bold' : '600',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                minWidth: '80px',
                textAlign: 'center',
              }}
            >
              {tier.charAt(0).toUpperCase() + tier.slice(1)}
            </button>
          ))}
        </div>
        {tierWarning && (
          <div style={{
            padding: '10px 24px',
            background: 'rgba(245,158,11,0.1)',
            borderBottom: '1px solid rgba(245,158,11,0.3)',
            color: '#f59e0b',
            fontSize: 12,
            fontFamily: C.font,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            ⚠️ {tierWarning}
          </div>
        )}

        {/* Editor */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            flex: 1,
            overflow: 'hidden',
            gap: '1rem',
            padding: '1.5rem',
          }}
        >
          <div style={{ overflowY: 'auto', paddingRight: '1rem' }}>
            {/* Personality */}
            <div
              ref={personalityRef}
              style={{
                marginBottom: '1.5rem',
                padding: '1.5rem',
                background: C.card,
                borderRadius: '0.5rem',
                border: `1px solid ${C.border}`,
              }}
            >
              <h2 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '1.5rem', margin: 0 }}>
                Personality (Tier 1)
              </h2>
              <PersonalityEditor
                personality={state.strategy.personality}
                presets={presets}
                onChange={(personality) => updateStrategy({ personality })}
              />
            </div>

            {/* Rules */}
            {state.tier !== 'quick' && (
              <>
                {/* Conflicts alert - only show for strategy/pro tiers */}
                {conflicts.length > 0 && (
                  <div
                    style={{
                      marginBottom: '1.5rem',
                      padding: '1rem 1.5rem',
                      background: '#3d2a2a',
                      borderRadius: '0.5rem',
                      border: `1px solid #e24b4a`,
                      borderLeft: '4px solid #e24b4a',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                      <span style={{ color: '#e24b4a', fontSize: '1.25rem', flexShrink: 0 }}>⚠</span>
                      <div>
                        <p style={{ color: '#e24b4a', fontWeight: 'bold', margin: '0 0 0.5rem 0' }}>
                          {conflicts.length} rule {conflicts.length === 1 ? 'conflict' : 'conflicts'} detected
                        </p>
                        <ul style={{ margin: 0, paddingLeft: '1.25rem', color: C.muted, fontSize: '0.875rem' }}>
                          {conflicts.map((c: Record<string, unknown>, i: number) => (
                            <li key={i}>{c.description || c.message || 'Rule conflict detected'}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                <div
                  ref={rulesRef}
                  style={{
                    marginBottom: '1.5rem',
                    padding: '1.5rem',
                    background: C.card,
                    borderRadius: '0.5rem',
                    border: `1px solid ${C.border}`,
                  }}
                >
                  <h2 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '1.5rem', margin: 0 }}>
                    Rules (Tier 2)
                  </h2>
                  <RulesEditor
                    rules={state.strategy.rules}
                    fields={conditionFields}
                    onChange={(rules) => updateStrategy({ rules })}
                  />
                </div>

                {/* Range chart - only for Pro tier */}
                {state.tier === 'pro' && (
                  <div
                    style={{
                      marginBottom: '1.5rem',
                      padding: '1.5rem',
                      background: C.card,
                      borderRadius: '0.5rem',
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    <h2 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '1.5rem', margin: 0 }}>
                      Preflop Range Chart (Tier 3)
                    </h2>
                    <RangeChartComponent
                      rangeChart={state.strategy.rangeChart}
                      onChange={(rangeChart) => updateStrategy({ rangeChart })}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Simulator modal */}
      {simulatorOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setSimulatorOpen(false)}
        >
          <div
            style={{
              background: C.card,
              borderRadius: '0.75rem',
              border: `1px solid ${C.border}`,
              padding: '2rem',
              maxWidth: '90vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSimulatorOpen(false)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'none',
                border: 'none',
                color: C.accent,
                cursor: 'pointer',
                fontSize: '1.5rem',
              }}
            >
              ✕
            </button>

            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: C.text }}>
              🎮 Bot Simulator
            </h2>

            <SimulatePanel strategy={state.strategy} />
          </div>
        </div>
      )}
    </div>
  )
}
