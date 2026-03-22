import { useState } from "react";
import { useBotBuilderStore } from "../../stores/botBuilderStore";

const POSITIONS = [
  { value: "UTG", label: "Under the Gun", short: "UTG" },
  { value: "MP", label: "Middle Position", short: "MP" },
  { value: "CO", label: "Cutoff", short: "CO" },
  { value: "BTN", label: "Button", short: "BTN" },
  { value: "SB", label: "Small Blind", short: "SB" },
  { value: "BB", label: "Big Blind", short: "BB" },
];

export function PositionOverrides() {
  const { positionOverrides } = useBotBuilderStore();
  const [activePosition, setActivePosition] = useState<string | null>(null);

  const togglePosition = (pos: string) => {
    if (activePosition === pos) {
      setActivePosition(null);
    } else {
      setActivePosition(pos);
      if (!positionOverrides[pos]) {
        useBotBuilderStore.setState((s) => ({
          positionOverrides: {
            ...s.positionOverrides,
            [pos]: { personality: { ...s.personality } },
          },
        }));
      }
    }
  };

  const updatePositionPersonality = (
    pos: string,
    field: string,
    value: number,
  ) => {
    useBotBuilderStore.setState((s) => ({
      positionOverrides: {
        ...s.positionOverrides,
        [pos]: {
          ...s.positionOverrides[pos],
          personality: {
            ...s.positionOverrides[pos]?.personality,
            [field]: value,
          },
        },
      },
    }));
  };

  const removePosition = (pos: string) => {
    useBotBuilderStore.setState((s) => {
      const next = { ...s.positionOverrides };
      delete next[pos];
      return { positionOverrides: next };
    });
    if (activePosition === pos) setActivePosition(null);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        Override personality for specific table positions. Positions without
        overrides use the default personality settings.
      </p>

      {/* Position selector grid */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {POSITIONS.map((pos) => {
          const hasOverride = !!positionOverrides[pos.value];
          const isActive = activePosition === pos.value;
          return (
            <button
              key={pos.value}
              onClick={() => togglePosition(pos.value)}
              className={`relative px-3 py-2 rounded-lg text-sm font-medium transition-all
                ${
                  isActive
                    ? "bg-[var(--poker-gold)] text-black ring-2 ring-[var(--poker-gold)]/50"
                    : hasOverride
                      ? "bg-[var(--poker-gold)]/20 text-[var(--poker-gold)] border border-[var(--poker-gold)]/40"
                      : "bg-[var(--surface-light)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--line)]"
                }`}
              title={pos.label}
            >
              {pos.short}
              {hasOverride && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[var(--poker-gold)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Active position editor */}
      {activePosition && positionOverrides[activePosition] && (
        <div className="border border-[var(--line)] rounded-lg p-4 bg-[var(--surface-light)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">
              {POSITIONS.find((p) => p.value === activePosition)?.label}{" "}
              Override
            </h3>
            <button
              onClick={() => removePosition(activePosition)}
              className="text-xs text-[var(--error)] hover:text-red-300"
            >
              Remove Override
            </button>
          </div>
          <PositionPersonalityEditor
            personality={positionOverrides[activePosition].personality}
            onChange={(field, value) =>
              updatePositionPersonality(activePosition, field, value)
            }
          />
        </div>
      )}
    </div>
  );
}

function PositionPersonalityEditor({
  personality,
  onChange,
}: {
  personality: {
    aggression: number;
    bluffFrequency: number;
    riskTolerance: number;
    tightness: number;
  };
  onChange: (field: string, value: number) => void;
}) {
  const sliders = [
    {
      field: "aggression",
      label: "Aggression",
      description: "Bet/raise vs. check/call tendency",
      min: 0,
      max: 100,
    },
    {
      field: "bluffFrequency",
      label: "Bluff Frequency",
      description: "How often to bluff with weak hands",
      min: 0,
      max: 100,
    },
    {
      field: "riskTolerance",
      label: "Risk Tolerance",
      description: "Willingness to risk large portions of stack",
      min: 0,
      max: 100,
    },
    {
      field: "tightness",
      label: "Tightness",
      description: "How selective with starting hands",
      min: 0,
      max: 100,
    },
  ];

  return (
    <div className="space-y-4">
      {sliders.map((s) => (
        <div key={s.field}>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm text-[var(--text-secondary)]">
              {s.label}
            </label>
            <span className="text-sm font-mono text-[var(--poker-gold)]">
              {personality[s.field as keyof typeof personality]}
            </span>
          </div>
          <input
            type="range"
            min={s.min}
            max={s.max}
            value={personality[s.field as keyof typeof personality]}
            onChange={(e) => onChange(s.field, Number(e.target.value))}
            className="w-full accent-[var(--poker-gold)]"
          />
          <p className="text-xs text-[var(--text-subtle)] mt-0.5">
            {s.description}
          </p>
        </div>
      ))}
    </div>
  );
}
