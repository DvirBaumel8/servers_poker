interface Personality {
  aggression: number
  bluffFrequency: number
  riskTolerance: number
  tightness: number
}

interface PersonalityPreset {
  id: string
  name: string
  description: string
  personality: Personality
  styleDescription: string
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

// ─── Types ────────────────────────────────────────────────────────────────

interface PersonalityEditorProps {
  personality: Personality
  presets: PersonalityPreset[]
  onChange: (personality: Personality) => void
}

// ─── Slider component ────────────────────────────────────────────────────────

interface SliderProps {
  label: string
  description: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
  leftLabel?: string
  rightLabel?: string
}

function Slider({
  label,
  description,
  min,
  max,
  step,
  value,
  onChange,
  leftLabel = 'Low',
  rightLabel = 'High',
}: SliderProps) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '0.875rem',
              fontWeight: 'bold',
              color: C.text,
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontSize: '0.75rem',
              color: C.muted,
            }}
          >
            {description}
          </div>
        </div>
        <div
          style={{
            fontSize: '1rem',
            fontWeight: 'bold',
            color: C.accent,
            minWidth: '3rem',
            textAlign: 'right',
          }}
        >
          {value}
        </div>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        style={{
          width: '100%',
          height: '0.5rem',
          borderRadius: '0.25rem',
          background: `linear-gradient(to right, ${C.accent} 0%, ${C.accent} ${(value - min) / (max - min) * 100}%, ${C.border} ${(value - min) / (max - min) * 100}%, ${C.border} 100%)`,
          outline: 'none',
          cursor: 'pointer',
          WebkitAppearance: 'none',
        } as React.CSSProperties}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '0.25rem',
          fontSize: '0.75rem',
          color: C.muted,
        }}
      >
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────

export default function PersonalityEditor({
  personality,
  presets,
  onChange,
}: PersonalityEditorProps) {
  const handlePresetClick = (preset: PersonalityPreset) => {
    onChange(preset.personality)
  }

  const handleSliderChange = (field: keyof Personality, value: number) => {
    onChange({
      ...personality,
      [field]: value,
    })
  }

  return (
    <div>
      {/* Presets */}
      {presets.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h3
            style={{
              fontSize: '0.875rem',
              fontWeight: 'bold',
              marginBottom: '0.75rem',
              textTransform: 'uppercase',
              color: C.accent,
            }}
          >
            Presets
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {presets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handlePresetClick(preset)}
                style={{
                  padding: '0.75rem',
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = C.cardHover
                  e.currentTarget.style.borderColor = C.accent
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = C.card
                  e.currentTarget.style.borderColor = C.border
                }}
              >
                <div
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 'bold',
                    color: C.text,
                  }}
                >
                  {preset.name}
                </div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: C.muted,
                    marginTop: '0.25rem',
                  }}
                >
                  {preset.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sliders */}
      <div>
        <h3
          style={{
            fontSize: '0.875rem',
            fontWeight: 'bold',
            marginBottom: '1.5rem',
            textTransform: 'uppercase',
            color: C.accent,
          }}
        >
          Personality Sliders
        </h3>

        <Slider
          label="Aggression"
          description="How often to bet/raise vs check/call"
          min={0}
          max={100}
          step={1}
          value={personality.aggression}
          onChange={(v) => handleSliderChange('aggression', v)}
          leftLabel="Passive"
          rightLabel="Aggressive"
        />

        <Slider
          label="Bluff Frequency"
          description="How often to bet with weak hands"
          min={0}
          max={100}
          step={1}
          value={personality.bluffFrequency}
          onChange={(v) => handleSliderChange('bluffFrequency', v)}
          leftLabel="Never"
          rightLabel="Always"
        />

        <Slider
          label="Risk Tolerance"
          description="Willingness to risk large stack portions"
          min={0}
          max={100}
          step={1}
          value={personality.riskTolerance}
          onChange={(v) => handleSliderChange('riskTolerance', v)}
          leftLabel="Conservative"
          rightLabel="Aggressive"
        />

        <Slider
          label="Tightness"
          description="How selective with starting hands (higher = fewer hands)"
          min={0}
          max={100}
          step={1}
          value={personality.tightness}
          onChange={(v) => handleSliderChange('tightness', v)}
          leftLabel="Loose"
          rightLabel="Tight"
        />
      </div>
    </div>
  )
}
