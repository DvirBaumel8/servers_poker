import { useEffect, useState, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '../lib/axios'
import { useAuthStore } from '../store/authStore'
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
    isLoading: false,
    error: null,
  })

  const [conditionFields, setConditionFields] = useState<ConditionFieldDef[]>([])
  const [presets, setPresets] = useState<PersonalityPreset[]>([])
  const [conflicts, setConflicts] = useState<Record<string, unknown>[]>([])
  const [sidebarVisible, setSidebarVisible] = useState(() => {
    const saved = localStorage.getItem('botbuilder_sidebar_visible')
    return saved !== null ? JSON.parse(saved) : true
  })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('botbuilder_sidebar_collapsed')
    return saved !== null ? JSON.parse(saved) : false
  })
  const [simulatorOpen, setSimulatorOpen] = useState(false)
  const personalityRef = useRef<HTMLDivElement>(null)
  const rulesRef = useRef<HTMLDivElement>(null)

  // Auto-save on name/description/strategy changes
  useEffect(() => {
    console.log('🔄 Auto-save effect triggered:', { isDirty: state.isDirty, botId: state.botId, name: state.name, originalName: state.originalName })

    if (!state.isDirty) {
      console.log('⏸️ isDirty is false, skipping auto-save')
      return
    }

    console.log('⏰ Auto-save timer started for:', state.name)

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

      console.log('💾 Auto-saving bot:', payload.name)

      // Create new bot if it doesn't exist, otherwise update
      const request = state.botId
        ? api.put(`/bots/${state.botId}`, payload)
        : api.post('/bots/internal', payload)

      request
        .then((res) => {
          console.log('✅ Auto-save succeeded:', res.data)
          const newBotId = res.data.id

          setState((prev) => ({
            ...prev,
            botId: newBotId,
            originalName: payload.name,
            originalDescription: payload.description,
            isDirty: false,
          }))

          // Update URL if this is a new bot
          if (!state.botId) {
            setSearchParams({ id: newBotId })
          }

          // Check for conflicts
          api
            .post('/bots/internal/check-conflicts', { strategy: payload.strategy })
            .then((res) => {
              console.log('🔍 Conflicts check response:', res.data)
              setConflicts(res.data.conflicts || [])
              console.log('⚠️ Conflicts found:', res.data.conflicts || [])
            })
            .catch((err) => {
              console.error('❌ Conflicts check failed:', err)
            })
        })
        .catch((err) => {
          console.error('❌ Auto-save failed:', err)
        })
    }, 2000)

    return () => clearTimeout(timer)
  }, [state.isDirty, state.name, state.description, state.tier, state.strategy, state.botId, setSearchParams, state.originalName])

  // Load bot if ?id= param present
  useEffect(() => {
    const botId = searchParams.get('id')
    if (botId && isAuthenticated) {
      api.get(`/bots/${botId}`)
        .then((res) => {
          const bot = res.data
          console.log('📥 Bot loaded:', { id: bot.id, name: bot.name, description: bot.description })
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

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const newVal = !prev
      localStorage.setItem('botbuilder_sidebar_collapsed', JSON.stringify(newVal))
      return newVal
    })
  }

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
            width: sidebarCollapsed ? '60px' : '210px',
            height: '100vh',
            background: '#0d0d22',
            borderRight: `1px solid ${C.border}`,
            display: 'flex',
            flexDirection: 'column',
            position: 'fixed',
            left: 0,
            top: 0,
            zIndex: 40,
            transition: 'width 0.3s ease',
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          {/* Collapse button */}
          <button
            onClick={toggleSidebarCollapse}
            style={{
              position: 'absolute',
              right: '-12px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '24px',
              height: '48px',
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '0 8px 8px 0',
              color: C.accent,
              cursor: 'pointer',
              zIndex: 50,
            }}
            title={sidebarCollapsed ? 'Expand' : 'Collapse'}
          >
            {sidebarCollapsed ? '▶' : '◀'}
          </button>

          {/* Logo */}
          {!sidebarCollapsed && (
            <div style={{ padding: '20px' }}>
              <div style={{ fontSize: '16px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase' }}>
                <span style={{ color: C.text }}>Bot</span>
                <span style={{ color: C.accent }}>Royale</span>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav style={{ flex: 1, padding: '20px 0' }}>
            {[
              { label: 'Home', path: '/' },
              { label: 'My Bots', path: '/bots' },
              { label: 'Tournaments', path: '/tournaments' },
              { label: 'Live Games', path: '/games' },
            ].map(({ label, path }) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                style={{
                  width: '100%',
                  padding: '10px 20px',
                  background: 'transparent',
                  border: 'none',
                  color: C.muted,
                  fontSize: '14px',
                  fontFamily: C.font,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                }}
              >
                {!sidebarCollapsed && label}
              </button>
            ))}

            {/* Simulator button */}
            <button
              onClick={() => setSimulatorOpen(true)}
              style={{
                width: '100%',
                padding: '10px 20px',
                background: 'transparent',
                border: 'none',
                color: C.muted,
                fontSize: '14px',
                fontFamily: C.font,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              {!sidebarCollapsed && '🎮 Bot Simulator'}
            </button>
          </nav>

          {/* User section */}
          {!sidebarCollapsed && (
            <div style={{ padding: '16px 20px', borderTop: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #00e5ff, #0070ff)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: '700',
                    color: '#000',
                    flexShrink: 0,
                  }}
                >
                  {(user?.name?.[0] ?? '?').toUpperCase()}
                </div>
                <div style={{ overflow: 'hidden', flex: 1 }}>
                  <div style={{ fontSize: '13px', color: C.text, fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.name ?? 'Player'}
                  </div>
                  <button
                    onClick={() => {
                      logout()
                      navigate('/signin')
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: C.danger,
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontFamily: C.font,
                      padding: 0,
                    }}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          )}
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
                console.log('📝 Name changed:', { newName, originalName: state.originalName, isDirty })
                setState((prev) => ({
                  ...prev,
                  name: newName,
                  isDirty,
                }))
              }}
              placeholder="e.g., Aggressive Bot"
              style={{
                background: C.bg,
                border: `1.5px solid ${C.border}`,
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
                background: state.tier === tier ? C.accent : C.card,
                color: state.tier === tier ? '#000000' : C.text,
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
