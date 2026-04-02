type ConditionCategory = 'hand' | 'board' | 'opponent' | 'position' | 'stack' | 'pot'
type ConditionOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'between'
type ConditionValue = string | number | boolean | string[] | number[] | [number, number]

interface Condition {
  category: ConditionCategory
  field: string
  operator: ConditionOperator
  value: ConditionValue
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

// ─── Operator options by field type ────────────────────────────────────────────

const OPERATOR_OPTIONS: Record<string, ConditionOperator[]> = {
  enum: ['eq', 'neq', 'in'],
  boolean: ['eq', 'neq'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between'],
}

// ─── Types ────────────────────────────────────────────────────────────────

interface ConditionRowProps {
  condition: Condition
  fields: ConditionFieldDef[]
  onChange: (condition: Condition) => void
  onDelete: () => void
}

// ─── Utility functions ────────────────────────────────────────────────────────

function getValidOperators(fieldType: string): ConditionOperator[] {
  return OPERATOR_OPTIONS[fieldType] || ['eq']
}

function renderValueInput(
  fieldDef: ConditionFieldDef,
  operator: ConditionOperator,
  value: string | number | boolean,
  onChange: (val: string | number | boolean) => void,
) {
  if (fieldDef.type === 'enum') {
    if (operator === 'in') {
      // Multi-select for "in" operator
      const selectedValues = Array.isArray(value) ? value : []
      return (
        <select
          multiple
          value={selectedValues}
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions, (opt) =>
              opt.value,
            )
            onChange(selected)
          }}
          style={{
            flex: 1,
            padding: '0.5rem',
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: '0.375rem',
            color: C.text,
            fontFamily: C.font,
            fontSize: '0.875rem',
          }}
        >
          {fieldDef.enumValues?.map((enumVal) => (
            <option key={enumVal} value={enumVal}>
              {enumVal}
            </option>
          ))}
        </select>
      )
    } else {
      // Single select for eq/neq
      return (
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          style={{
            flex: 1,
            padding: '0.5rem',
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: '0.375rem',
            color: C.text,
            fontFamily: C.font,
            fontSize: '0.875rem',
          }}
        >
          <option value="">Select {fieldDef.label.toLowerCase()}</option>
          {fieldDef.enumValues?.map((enumVal) => (
            <option key={enumVal} value={enumVal}>
              {enumVal}
            </option>
          ))}
        </select>
      )
    }
  }

  if (fieldDef.type === 'boolean') {
    return (
      <select
        value={value === true ? 'true' : 'false'}
        onChange={(e) => onChange(e.target.value === 'true')}
        style={{
          flex: 1,
          padding: '0.5rem',
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: '0.375rem',
          color: C.text,
          fontFamily: C.font,
          fontSize: '0.875rem',
        }}
      >
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    )
  }

  if (fieldDef.type === 'number') {
    if (operator === 'between') {
      // Range input for between operator
      const [min, max] = Array.isArray(value) && value.length === 2 ? value : [0, 0]
      return (
        <div style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
          <input
            type="number"
            value={min}
            onChange={(e) => onChange([parseFloat(e.target.value), max])}
            placeholder="Min"
            min={fieldDef.min}
            max={fieldDef.max}
            style={{
              flex: 1,
              padding: '0.5rem',
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '0.375rem',
              color: C.text,
              fontFamily: C.font,
              fontSize: '0.875rem',
            }}
          />
          <input
            type="number"
            value={max}
            onChange={(e) => onChange([min, parseFloat(e.target.value)])}
            placeholder="Max"
            min={fieldDef.min}
            max={fieldDef.max}
            style={{
              flex: 1,
              padding: '0.5rem',
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '0.375rem',
              color: C.text,
              fontFamily: C.font,
              fontSize: '0.875rem',
            }}
          />
        </div>
      )
    } else {
      // Single number input
      return (
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          min={fieldDef.min}
          max={fieldDef.max}
          placeholder={`${fieldDef.label} value`}
          style={{
            flex: 1,
            padding: '0.5rem',
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: '0.375rem',
            color: C.text,
            fontFamily: C.font,
            fontSize: '0.875rem',
          }}
        />
      )
    }
  }

  return null
}

// ─── Main component ────────────────────────────────────────────────────────

export default function ConditionRow({
  condition,
  fields,
  onChange,
  onDelete,
}: ConditionRowProps) {
  const currentField = fields.find(
    (f) => f.category === condition.category && f.field === condition.field,
  )

  const validOperators = currentField
    ? getValidOperators(currentField.type)
    : []

  // Group fields by category
  const fieldsByCategory = fields.reduce(
    (acc, field) => {
      if (!acc[field.category]) {
        acc[field.category] = []
      }
      acc[field.category].push(field)
      return acc
    },
    {} as Record<string, ConditionFieldDef[]>,
  )

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        alignItems: 'flex-start',
        marginBottom: '0.75rem',
        padding: '0.75rem',
        background: 'rgba(0, 229, 255, 0.04)',
        borderRadius: '0.375rem',
        border: `1px solid ${C.border}`,
      }}
    >
      {/* Field selector */}
      <select
        value={`${condition.category}::${condition.field}`}
        onChange={(e) => {
          const [category, field] = e.target.value.split('::')
          const selectedField = fields.find(
            (f) => f.category === category && f.field === field,
          )
          if (selectedField) {
            onChange({
              ...condition,
              category: selectedField.category,
              field: selectedField.field,
              operator: getValidOperators(selectedField.type)[0],
              value: selectedField.type === 'boolean' ? false : '',
            })
          }
        }}
        style={{
          padding: '0.5rem',
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: '0.375rem',
          color: C.text,
          fontFamily: C.font,
          fontSize: '0.875rem',
          minWidth: '140px',
        }}
      >
        <option value="">Select field</option>
        {Object.entries(fieldsByCategory).map(([category, categoryFields]) => (
          <optgroup key={category} label={category}>
            {categoryFields.map((field) => (
              <option
                key={`${field.category}::${field.field}`}
                value={`${field.category}::${field.field}`}
              >
                {field.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* Operator selector */}
      <select
        value={condition.operator}
        onChange={(e) => {
          onChange({
            ...condition,
            operator: e.target.value as ConditionOperator,
          })
        }}
        disabled={!currentField}
        style={{
          padding: '0.5rem',
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: '0.375rem',
          color: C.text,
          fontFamily: C.font,
          fontSize: '0.875rem',
          minWidth: '80px',
          opacity: !currentField ? 0.5 : 1,
          cursor: !currentField ? 'not-allowed' : 'pointer',
        }}
      >
        {validOperators.map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </select>

      {/* Value input */}
      {currentField && (
        <div style={{ flex: 1, display: 'flex', gap: '0.5rem' }}>
          {renderValueInput(
            currentField,
            condition.operator,
            condition.value,
            (val) => {
              onChange({
                ...condition,
                value: val,
              })
            },
          )}
        </div>
      )}

      {/* Delete button */}
      <button
        onClick={onDelete}
        style={{
          padding: '0.5rem',
          background: 'transparent',
          border: `1px solid ${C.danger}`,
          borderRadius: '0.375rem',
          color: C.danger,
          fontFamily: C.font,
          fontSize: '0.875rem',
          cursor: 'pointer',
          minWidth: '2rem',
        }}
      >
        ✕
      </button>
    </div>
  )
}
