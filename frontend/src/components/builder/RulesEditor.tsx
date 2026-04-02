import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import RuleCard from './RuleCard'

type Street = 'preflop' | 'flop' | 'turn' | 'river'
type ConditionCategory = 'hand' | 'board' | 'opponent' | 'position' | 'stack' | 'pot'
type ConditionOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'between'
type ConditionValue = string | number | boolean | string[] | number[] | [number, number]

interface Condition {
  category: ConditionCategory
  field: string
  operator: ConditionOperator
  value: ConditionValue
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

interface ConditionFieldDef {
  category: ConditionCategory
  field: string
  type: 'enum' | 'number' | 'boolean'
  label: string
  description: string
  enumValues?: string[]
  min?: number
  max?: number
  tier: string
  streets?: Street[]
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#0a0a1a',
  card: '#13132a',
  cardHover: '#161630',
  border: '#1e1e3f',
  accent: '#00e5ff',
  text: '#ffffff',
  muted: '#9ca3af',
  danger: '#e24b4a',
  font: "'Trebuchet MS', sans-serif",
}

// ─── Types ────────────────────────────────────────────────────────────────

interface RulesEditorProps {
  rules: StreetRules | undefined
  fields: ConditionFieldDef[]
  onChange: (rules: StreetRules) => void
}

// ─── Main component ────────────────────────────────────────────────────────

export default function RulesEditor({ rules = {}, fields, onChange }: RulesEditorProps) {
  const [activeStreet, setActiveStreet] = useState<Street>('preflop')

  const currentRules = rules[activeStreet] || []

  const handleUpdateRules = (newRules: Rule[]) => {
    const updated = {
      ...rules,
      [activeStreet]: newRules.length > 0 ? newRules : undefined,
    }
    onChange(updated)
  }

  const handleUpdateRule = (index: number, rule: Rule) => {
    const newRules = [...currentRules]
    newRules[index] = rule
    handleUpdateRules(newRules)
  }

  const handleDeleteRule = (index: number) => {
    const newRules = currentRules.filter((_, i) => i !== index)
    handleUpdateRules(newRules)
  }

  const handleAddRule = () => {
    const newRule: Rule = {
      id: uuidv4(),
      priority: currentRules.length,
      conditions: [],
      action: { type: 'fold' },
      enabled: true,
    }
    handleUpdateRules([...currentRules, newRule])
  }

  return (
    <div>
      {/* Street tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          marginBottom: '1.5rem',
          borderBottom: `1px solid ${C.border}`,
          paddingBottom: '1rem',
        }}
      >
        {(['preflop', 'flop', 'turn', 'river'] as const).map((street) => (
          <button
            key={street}
            onClick={() => setActiveStreet(street)}
            style={{
              padding: '0.75rem 1rem',
              background:
                activeStreet === street ? C.accent : 'transparent',
              color: activeStreet === street ? C.bg : C.text,
              border: `1px solid ${activeStreet === street ? C.accent : C.border}`,
              borderRadius: '0.375rem',
              fontFamily: C.font,
              fontSize: '0.875rem',
              fontWeight: activeStreet === street ? 'bold' : 'normal',
              cursor: 'pointer',
              transition: 'all 0.2s',
              textTransform: 'capitalize',
            }}
          >
            {street}
          </button>
        ))}
      </div>

      {/* Rules list */}
      <div>
        {currentRules.length === 0 ? (
          <div
            style={{
              padding: '2rem',
              background: 'rgba(0, 229, 255, 0.04)',
              borderRadius: '0.5rem',
              textAlign: 'center',
              color: C.muted,
              marginBottom: '1rem',
            }}
          >
            <div style={{ fontSize: '0.875rem' }}>
              No rules yet for {activeStreet}
            </div>
            <div style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
              Rules are evaluated top-to-bottom; first match wins.
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: '1.5rem' }}>
            {currentRules.map((rule, index) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                fields={fields}
                onChange={(updatedRule) => handleUpdateRule(index, updatedRule)}
                onDelete={() => handleDeleteRule(index)}
              />
            ))}
          </div>
        )}

        {/* Add rule button */}
        <button
          onClick={handleAddRule}
          style={{
            width: '100%',
            padding: '1rem',
            background: 'transparent',
            border: `2px dashed ${C.accent}`,
            color: C.accent,
            borderRadius: '0.5rem',
            fontFamily: C.font,
            fontSize: '0.875rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `${C.accent}10`
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          + Add {activeStreet} Rule
        </button>
      </div>
    </div>
  )
}
