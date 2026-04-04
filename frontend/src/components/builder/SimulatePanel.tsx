import { useState } from 'react'
import api from '../../lib/axios'
import CustomSelect from '../CustomSelect'

const STREETS = ['preflop', 'flop', 'turn', 'river'] as const
const POSITIONS = ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO'] as const

type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'all_in'

interface BotStrategy {
  version: 1
  tier: string
  personality: Record<string, number>
  rules?: Record<string, unknown>
  rangeChart?: Record<string, string>
}

interface StrategyEvaluation {
  action: {
    type: ActionType
    amount?: number
  }
  source: string
  explanation: string
  ruleId?: string
  handNotation?: string
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#0a0a1a',
  card: '#13132a',
  border: '#1e1e3f',
  accent: '#00e5ff',
  text: '#ffffff',
  muted: '#9ca3af',
  danger: '#e24b4a',
  success: '#1d9e75',
  warning: '#b5851b',
  font: "'Trebuchet MS', sans-serif",
}

// ─── Types ────────────────────────────────────────────────────────────────

interface SimulatePanelProps {
  strategy: BotStrategy
}

interface ScenarioInput {
  street: string
  holeCards: [string, string]
  communityCards: string[]
  position: string
  stackBB: number
  potBB: number
  bigBlind: number
  facingBet: boolean
  betAmount: number
  playersInHand: number
}

// ─── Main component ────────────────────────────────────────────────────────

export default function SimulatePanel({ strategy }: SimulatePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<StrategyEvaluation | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [scenario, setScenario] = useState<ScenarioInput>({
    street: 'preflop',
    holeCards: ['A', 'K'],
    communityCards: [],
    position: 'BTN',
    stackBB: 100,
    potBB: 50,
    bigBlind: 20,
    facingBet: false,
    betAmount: 0,
    playersInHand: 6,
  })

  const handleScenarioChange = (field: keyof ScenarioInput, value: ScenarioInput[keyof ScenarioInput]) => {
    setScenario((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleHoleCardChange = (index: 0 | 1, value: string) => {
    const newCards = [...scenario.holeCards] as [string, string]
    newCards[index] = value
    setScenario((prev) => ({
      ...prev,
      holeCards: newCards,
    }))
  }

  const handleRunSimulation = async () => {
    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await api.post<StrategyEvaluation>(
        '/bots/internal/simulate',
        {
          strategy,
          scenario: {
            stage: scenario.street,
            holeCards: [`${scenario.holeCards[0]}h`, `${scenario.holeCards[1]}d`],
            communityCards: scenario.communityCards.map((c) => `${c}h`),
            position: scenario.position,
            stackSize: scenario.stackBB * scenario.bigBlind,
            potSize: scenario.potBB * scenario.bigBlind,
            bigBlind: scenario.bigBlind,
            facingBet: scenario.facingBet,
            betAmount: scenario.betAmount * scenario.bigBlind,
            playersInHand: scenario.playersInHand,
          },
        },
      )

      setResult(res.data)
    } catch {
      setError('Failed to simulate strategy')
    } finally {
      setIsLoading(false)
    }
  }

  const cardRanks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: '0.5rem',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          width: '100%',
          padding: '1rem',
          background: 'transparent',
          border: 'none',
          borderBottom: isExpanded ? `1px solid ${C.border}` : 'none',
          color: C.text,
          fontFamily: C.font,
          fontSize: '0.875rem',
          fontWeight: 'bold',
          textTransform: 'uppercase',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ color: C.accent }}>⚙ Strategy Simulator</span>
        <span>{isExpanded ? '▼' : '▶'}</span>
      </button>

      {/* Content */}
      {isExpanded && (
        <div style={{ padding: '1rem' }}>
          {/* Street */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                fontSize: '0.75rem',
                color: C.muted,
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: '0.25rem',
              }}
            >
              Street
            </label>
            <CustomSelect
              value={scenario.street}
              onChange={(v) => handleScenarioChange('street', v)}
              options={STREETS.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
              size="sm"
            />
          </div>

          {/* Hole cards */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                fontSize: '0.75rem',
                color: C.muted,
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: '0.25rem',
              }}
            >
              Hole Cards
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {([0, 1] as const).map((idx) => (
                <CustomSelect
                  key={idx}
                  value={scenario.holeCards[idx]}
                  onChange={(v) => handleHoleCardChange(idx, v)}
                  options={cardRanks.map(r => ({ value: r, label: r }))}
                  style={{ flex: 1 }}
                  size="sm"
                />
              ))}
            </div>
          </div>

          {/* Position */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                fontSize: '0.75rem',
                color: C.muted,
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: '0.25rem',
              }}
            >
              Position
            </label>
            <CustomSelect
              value={scenario.position}
              onChange={(v) => handleScenarioChange('position', v)}
              options={POSITIONS.map(p => ({ value: p, label: p }))}
              size="sm"
            />
          </div>

          {/* Stack & Pot */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
            <div>
              <label
                style={{
                  fontSize: '0.75rem',
                  color: C.muted,
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: '0.25rem',
                }}
              >
                Stack (BB)
              </label>
              <input
                type="number"
                value={scenario.stackBB}
                onChange={(e) =>
                  handleScenarioChange('stackBB', parseFloat(e.target.value) || 0)
                }
                min={1}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: '0.375rem',
                  color: C.text,
                  fontFamily: C.font,
                  fontSize: '0.875rem',
                }}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: '0.75rem',
                  color: C.muted,
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: '0.25rem',
                }}
              >
                Pot (BB)
              </label>
              <input
                type="number"
                value={scenario.potBB}
                onChange={(e) =>
                  handleScenarioChange('potBB', parseFloat(e.target.value) || 0)
                }
                min={1}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: '0.375rem',
                  color: C.text,
                  fontFamily: C.font,
                  fontSize: '0.875rem',
                }}
              />
            </div>
          </div>

          {/* Facing bet */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                fontSize: '0.75rem',
                color: C.muted,
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: '0.25rem',
              }}
            >
              <input
                type="checkbox"
                checked={scenario.facingBet}
                onChange={(e) => handleScenarioChange('facingBet', e.target.checked)}
                style={{
                  marginRight: '0.5rem',
                  cursor: 'pointer',
                }}
              />
              Facing Bet
            </label>
            {scenario.facingBet && (
              <input
                type="number"
                value={scenario.betAmount}
                onChange={(e) =>
                  handleScenarioChange('betAmount', parseFloat(e.target.value) || 0)
                }
                placeholder="Bet amount (BB)"
                min={0}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: '0.375rem',
                  color: C.text,
                  fontFamily: C.font,
                  fontSize: '0.875rem',
                  marginTop: '0.5rem',
                }}
              />
            )}
          </div>

          {/* Players in hand */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              style={{
                fontSize: '0.75rem',
                color: C.muted,
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: '0.25rem',
              }}
            >
              Players in Hand
            </label>
            <input
              type="number"
              value={scenario.playersInHand}
              onChange={(e) =>
                handleScenarioChange('playersInHand', parseFloat(e.target.value) || 2)
              }
              min={2}
              max={10}
              style={{
                width: '100%',
                padding: '0.5rem',
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: '0.375rem',
                color: C.text,
                fontFamily: C.font,
                fontSize: '0.875rem',
              }}
            />
          </div>

          {/* Run button */}
          <button
            onClick={handleRunSimulation}
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: C.accent,
              color: C.bg,
              border: 'none',
              borderRadius: '0.375rem',
              fontFamily: C.font,
              fontSize: '0.875rem',
              fontWeight: 'bold',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {isLoading ? 'Running...' : 'Run Simulation'}
          </button>

          {/* Result */}
          {error && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.75rem',
                background: `${C.danger}20`,
                border: `1px solid ${C.danger}`,
                borderRadius: '0.375rem',
                color: C.danger,
                fontSize: '0.875rem',
              }}
            >
              {error}
            </div>
          )}

          {result && (
            <div
              style={{
                marginTop: '1rem',
                padding: '1rem',
                background: `${C.success}20`,
                border: `1px solid ${C.success}`,
                borderRadius: '0.375rem',
              }}
            >
              <div
                style={{
                  fontSize: '1.125rem',
                  fontWeight: 'bold',
                  color: C.success,
                  marginBottom: '0.75rem',
                  textTransform: 'uppercase',
                }}
              >
                {result.action.type}
                {result.action.amount && ` (${result.action.amount})`}
              </div>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: C.muted,
                  marginBottom: '0.5rem',
                  textTransform: 'uppercase',
                }}
              >
                Source: {result.source}
                {result.ruleId && ` (Rule ${result.ruleId})`}
              </div>
              <div
                style={{
                  fontSize: '0.875rem',
                  color: C.text,
                  lineHeight: '1.4',
                }}
              >
                {result.explanation}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
