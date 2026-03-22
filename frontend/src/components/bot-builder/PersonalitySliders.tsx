import {
  useBotBuilderStore,
  type Personality,
} from "../../stores/botBuilderStore";

const SLIDER_CONFIG: Array<{
  field: keyof Personality;
  label: string;
  description: string;
  lowLabel: string;
  highLabel: string;
  color: string;
}> = [
  {
    field: "aggression",
    label: "Aggression",
    description: "How often to bet/raise vs check/call",
    lowLabel: "Passive",
    highLabel: "Aggressive",
    color: "bg-red-500",
  },
  {
    field: "bluffFrequency",
    label: "Bluff Frequency",
    description: "How often to bet with weak hands",
    lowLabel: "Honest",
    highLabel: "Deceptive",
    color: "bg-purple-500",
  },
  {
    field: "riskTolerance",
    label: "Risk Tolerance",
    description: "Willingness to risk large portions of stack",
    lowLabel: "Cautious",
    highLabel: "Fearless",
    color: "bg-amber-500",
  },
  {
    field: "tightness",
    label: "Tightness",
    description: "How selective with starting hands",
    lowLabel: "Loose",
    highLabel: "Tight",
    color: "bg-blue-500",
  },
];

export function PersonalitySliders() {
  const { personality, setPersonalityField } = useBotBuilderStore();

  return (
    <div className="space-y-6">
      {SLIDER_CONFIG.map((config) => (
        <div key={config.field}>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-[var(--text-primary)]">
              {config.label}
            </label>
            <span className="text-sm font-mono text-[var(--text-muted)]">
              {personality[config.field]}
            </span>
          </div>
          <p className="text-xs text-[var(--text-subtle)] mb-2">
            {config.description}
          </p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--text-muted)] w-16 text-right">
              {config.lowLabel}
            </span>
            <div className="flex-1 relative">
              <input
                type="range"
                min={0}
                max={100}
                value={personality[config.field]}
                onChange={(e) =>
                  setPersonalityField(config.field, Number(e.target.value))
                }
                className="w-full h-2 rounded-full appearance-none cursor-pointer
                  bg-[var(--surface-light)]
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-4
                  [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-[var(--poker-gold)]
                  [&::-webkit-slider-thumb]:cursor-pointer
                  [&::-webkit-slider-thumb]:shadow-md
                  [&::-moz-range-thumb]:w-4
                  [&::-moz-range-thumb]:h-4
                  [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-[var(--poker-gold)]
                  [&::-moz-range-thumb]:cursor-pointer
                  [&::-moz-range-thumb]:border-0"
              />
              <div
                className={`absolute top-0 left-0 h-2 rounded-full pointer-events-none ${config.color} opacity-40`}
                style={{
                  width: `${personality[config.field]}%`,
                }}
              />
            </div>
            <span className="text-xs text-[var(--text-muted)] w-16">
              {config.highLabel}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
