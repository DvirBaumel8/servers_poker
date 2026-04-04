import ConditionRow from './ConditionRow'
import ActionEditor from './ActionEditor'

type ConditionCategory = 'hand' | 'board' | 'opponent' | 'position' | 'stack' | 'pot'
type ConditionOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'between'
type ConditionValue = string | number | boolean | string[] | number[] | [number, number]

interface Condition {
  category: ConditionCategory
  field: string
  operator: ConditionOperator
  value: ConditionValue
}

type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'all_in'
type SizingMode = 'pot_fraction' | 'bb_multiple' | 'previous_bet_multiple' | 'fixed'

interface ActionDefinition {
  type: ActionType
  sizing?: { mode: SizingMode; value: number }
}

interface Rule {
  id: string
  priority: number
  conditions: Condition[]
  action: ActionDefinition
  enabled: boolean
  label?: string
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
  streets?: string[]
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

interface RuleCardProps {
  rule: Rule
  fields: ConditionFieldDef[]
  onChange: (rule: Rule) => void
  onDelete: () => void
}

// ─── Main component ────────────────────────────────────────────────────────

export default function RuleCard({
  rule,
  fields,
  onChange,
  onDelete,
}: RuleCardProps) {
  const handleConditionChange = (index: number, condition: Condition) => {
    const newConditions = [...rule.conditions]
    newConditions[index] = condition
    onChange({
      ...rule,
      conditions: newConditions,
    })
  }

  const handleDeleteCondition = (index: number) => {
    const newConditions = rule.conditions.filter((_, i) => i !== index)
    onChange({
      ...rule,
      conditions: newConditions,
    })
  }

  const handleAddCondition = () => {
    const defaultField = fields.find((f) => f.type !== 'boolean')
    if (defaultField) {
      const newCondition: Condition = {
        category: defaultField.category,
        field: defaultField.field,
        operator: 'eq',
        value: defaultField.type === 'enum' ? '' : 0,
      }
      onChange({
        ...rule,
        conditions: [...rule.conditions, newCondition],
      })
    }
  }

  const handleToggleEnable = () => {
    onChange({
      ...rule,
      enabled: !rule.enabled,
    })
  }

  return (
    <div
      style={{
        padding: '1.5rem',
        background: rule.enabled ? C.card : `${C.card}80`,
        border: `2px solid ${rule.enabled ? C.border : `${C.border}80`}`,
        borderRadius: '0.5rem',
        marginBottom: '1.5rem',
        opacity: rule.enabled ? 1 : 0.6,
      }}
    >
      {/* Header: priority, toggle, delete */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '1rem',
          gap: '1rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            flex: 1,
          }}
        >
          {/* Rule name input - replaces the "Rule #X" header */}
          <input
            type="text"
            value={rule.label || ''}
            onChange={(e) => {
              onChange({
                ...rule,
                label: e.target.value || undefined,
              })
            }}
            placeholder={`Rule #${rule.priority + 1}`}
            style={{
              padding: '0.5rem 0.75rem',
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: '0.375rem',
              color: C.text,
              fontFamily: C.font,
              fontSize: '1rem',
              fontWeight: 'bold',
              flex: 1,
              minWidth: '200px',
              maxWidth: '300px',
            }}
          />

          <button
            onClick={handleToggleEnable}
            style={{
              padding: '0.5rem 1rem',
              background: rule.enabled ? C.accent : C.border,
              color: rule.enabled ? C.bg : C.muted,
              border: 'none',
              borderRadius: '0.375rem',
              fontFamily: C.font,
              fontSize: '0.8125rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {rule.enabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        <button
          onClick={onDelete}
          style={{
            padding: '0.5rem 1rem',
            background: 'transparent',
            border: `1px solid ${C.danger}`,
            color: C.danger,
            borderRadius: '0.375rem',
            fontFamily: C.font,
            fontSize: '0.75rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          Delete
        </button>
      </div>

      {/* IF section */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            fontSize: '1rem',
            fontWeight: 'bold',
            color: C.accent,
            textTransform: 'uppercase',
            marginBottom: '0.75rem',
          }}
        >
          IF
        </div>

        {rule.conditions.length === 0 ? (
          <div
            style={{
              padding: '1rem',
              background: 'rgba(0, 229, 255, 0.04)',
              borderRadius: '0.375rem',
              textAlign: 'center',
              color: C.muted,
              fontSize: '0.875rem',
            }}
          >
            No conditions yet
          </div>
        ) : (
          <div>
            {rule.conditions.map((condition, index) => (
              <div key={index}>
                <ConditionRow
                  condition={condition}
                  fields={fields}
                  onChange={(cond) => handleConditionChange(index, cond)}
                  onDelete={() => handleDeleteCondition(index)}
                />
                {index < rule.conditions.length - 1 && (
                  <div
                    style={{
                      paddingLeft: '0.75rem',
                      marginBottom: '0.5rem',
                      fontSize: '1rem',
                      fontWeight: 'bold',
                      color: C.accent,
                      textTransform: 'uppercase',
                    }}
                  >
                    AND
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleAddCondition}
          style={{
            marginTop: '0.75rem',
            padding: '0.5rem 1rem',
            background: 'transparent',
            border: `1px solid ${C.accent}`,
            color: C.accent,
            borderRadius: '0.375rem',
            fontFamily: C.font,
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          + Add Condition
        </button>
      </div>

      {/* THEN section */}
      <div>
        <div
          style={{
            fontSize: '1rem',
            fontWeight: 'bold',
            color: C.accent,
            textTransform: 'uppercase',
            marginBottom: '0.75rem',
          }}
        >
          THEN
        </div>

        <ActionEditor
          action={rule.action}
          onChange={(action) => {
            onChange({
              ...rule,
              action,
            })
          }}
        />
      </div>
    </div>
  )
}
