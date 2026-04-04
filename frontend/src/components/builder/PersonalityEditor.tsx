import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts'

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

// ─── Preset icons ─────────────────────────────────────────────────────────────

const PRESET_ICONS: Record<string, string> = {
  Shark: '\u{1F988}',
  Rock: '\u{1FAA8}',
  Maniac: '\u{1F525}',
  'Calling Station': '\u{1F4DE}',
  Nit: '\u{1F512}',
  'Balanced Pro': '\u{2696}\u{FE0F}',
  Tricky: '\u{1F3AD}',
  Bully: '\u{1F44A}',
}

function getPresetIcon(name: string): string {
  return PRESET_ICONS[name] || '\u{1F916}'
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
          background: `linear-gradient(to right, ${C.accent} 0%, ${C.accent} ${((value - min) / (max - min)) * 100}%, ${C.border} ${((value - min) / (max - min)) * 100}%, ${C.border} 100%)`,
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

// ─── Radar chart component ───────────────────────────────────────────────────

function PersonalityRadar({ personality }: { personality: Personality }) {
  const data = [
    { axis: 'Aggression', value: personality.aggression },
    { axis: 'Bluff Freq', value: personality.bluffFrequency },
    { axis: 'Risk', value: personality.riskTolerance },
    { axis: 'Tightness', value: personality.tightness },
  ]

  return (
    <ResponsiveContainer width="100%" height={240}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke={C.border} />
        <PolarAngleAxis
          dataKey="axis"
          tick={{ fill: C.muted, fontSize: 12, fontFamily: C.font }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 100]}
          tick={false}
          axisLine={false}
        />
        <Radar
          dataKey="value"
          stroke={C.accent}
          fill={C.accent}
          fillOpacity={0.25}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>{getPresetIcon(preset.name)}</span>
                  <div
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 'bold',
                      color: C.text,
                    }}
                  >
                    {preset.name}
                  </div>
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

      {/* Radar Chart + Sliders */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '2rem',
          alignItems: 'start',
        }}
      >
        {/* Radar Chart */}
        <div
          style={{
            padding: '1rem',
            background: 'rgba(0, 229, 255, 0.02)',
            border: `1px solid ${C.border}`,
            borderRadius: '0.5rem',
          }}
        >
          <h3
            style={{
              fontSize: '0.875rem',
              fontWeight: 'bold',
              marginBottom: '0.5rem',
              textTransform: 'uppercase',
              color: C.accent,
              textAlign: 'center',
            }}
          >
            Persona Profile
          </h3>
          <PersonalityRadar personality={personality} />
        </div>

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

      {/* Responsive: stack on small screens via media query in style tag */}
      <style>{`
        @media (max-width: 768px) {
          .personality-editor-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
