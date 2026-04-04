type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'all_in'
type SizingMode = 'pot_fraction' | 'bb_multiple' | 'previous_bet_multiple' | 'fixed'

interface ActionDefinition {
  type: ActionType
  sizing?: { mode: SizingMode; value: number }
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
  success: '#1d9e75',
  warning: '#b5851b',
  purple: '#8b5cf6',
  font: "'Trebuchet MS', sans-serif",
}

// ─── Action colors ────────────────────────────────────────────────────────────

const ACTION_COLORS: Record<ActionType, string> = {
  fold: C.danger,
  check: C.muted,
  call: C.warning,
  raise: C.success,
  all_in: C.purple,
}

// ─── Types ────────────────────────────────────────────────────────────────

interface ActionEditorProps {
  action: ActionDefinition
  onChange: (action: ActionDefinition) => void
}

// ─── Main component ────────────────────────────────────────────────────────

export default function ActionEditor({ action, onChange }: ActionEditorProps) {
  const actionType = action.type
  const sizing = action.sizing

  const handleActionChange = (newType: ActionType) => {
    const newAction: ActionDefinition = { type: newType }
    if (newType === 'raise' && !sizing) {
      newAction.sizing = { mode: 'pot_fraction', value: 1 }
    }
    onChange(newAction)
  }

  const handleSizingChange = (mode: SizingMode, value: number) => {
    onChange({
      ...action,
      sizing: { mode, value },
    })
  }

  const generateSizingPreview = (): string => {
    if (!sizing) return ''

    switch (sizing.mode) {
      case 'pot_fraction':
        return `Raise to ${sizing.value}× pot`
      case 'bb_multiple':
        return `Raise ${sizing.value}× BB`
      case 'previous_bet_multiple':
        return `Raise ${sizing.value}× previous bet`
      case 'fixed':
        return `Raise fixed ${sizing.value} chips`
      default:
        return ''
    }
  }

  return (
    <div>
      {/* Action buttons */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: actionType === 'raise' ? '1rem' : 0,
          flexWrap: 'wrap',
        }}
      >
        {(['fold', 'check', 'call', 'raise', 'all_in'] as const).map((act) => (
          <button
            key={act}
            onClick={() => handleActionChange(act)}
            style={{
              padding: '0.5rem 1rem',
              background:
                actionType === act
                  ? ACTION_COLORS[act]
                  : 'transparent',
              color: actionType === act ? C.bg : ACTION_COLORS[act],
              border: `1px solid ${ACTION_COLORS[act]}`,
              borderRadius: '0.375rem',
              fontFamily: C.font,
              fontSize: '0.875rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (actionType !== act) {
                e.currentTarget.style.background = `${ACTION_COLORS[act]}20`
              }
            }}
            onMouseLeave={(e) => {
              if (actionType !== act) {
                e.currentTarget.style.background = 'transparent'
              }
            }}
          >
            {act.charAt(0).toUpperCase() + act.slice(1)}
          </button>
        ))}
      </div>

      {/* Sizing options for raise */}
      {actionType === 'raise' && sizing && (
        <div
          style={{
            padding: '1rem',
            background: 'rgba(29, 158, 117, 0.1)',
            borderRadius: '0.375rem',
            border: `1px solid ${C.success}20`,
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: '1rem',
              marginBottom: '0.75rem',
            }}
          >
            {/* Sizing mode */}
            <div style={{ flex: 1 }}>
              <label
                style={{
                  fontSize: '0.75rem',
                  color: C.muted,
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: '0.25rem',
                }}
              >
                Sizing Mode
              </label>
              <select
                value={sizing.mode}
                onChange={(e) => handleSizingChange(e.target.value as SizingMode, sizing.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: '0.375rem',
                  color: C.text,
                  fontFamily: C.font,
                  fontSize: '0.875rem',
                }}
              >
                <option value="pot_fraction">Pot Fraction (e.g., 2.5×)</option>
                <option value="bb_multiple">BB Multiple (e.g., 3×)</option>
                <option value="previous_bet_multiple">
                  Previous Bet Multiple
                </option>
                <option value="fixed">Fixed Amount</option>
              </select>
            </div>

            {/* Value */}
            <div style={{ flex: 1 }}>
              <label
                style={{
                  fontSize: '0.75rem',
                  color: C.muted,
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: '0.25rem',
                }}
              >
                Value
              </label>
              <input
                type="number"
                value={sizing.value}
                onChange={(e) =>
                  handleSizingChange(sizing.mode, parseFloat(e.target.value) || 0)
                }
                min={0.1}
                step={0.1}
                placeholder="Amount"
                style={{
                  width: '100%',
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
          </div>

          {/* Preview */}
          <div
            style={{
              padding: '0.75rem',
              background: C.card,
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              color: C.success,
              textAlign: 'center',
              fontWeight: 'bold',
            }}
          >
            {generateSizingPreview()}
          </div>
        </div>
      )}
    </div>
  )
}
