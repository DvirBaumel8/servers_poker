import {
  useBotBuilderStore,
  type StrategyTier,
} from "../../stores/botBuilderStore";

const TIERS: Array<{
  id: StrategyTier;
  name: string;
  description: string;
  features: string[];
}> = [
  {
    id: "quick",
    name: "Quick Bot",
    description: "Set personality sliders and play instantly",
    features: ["Personality sliders", "Preset profiles", "No rules needed"],
  },
  {
    id: "strategy",
    name: "Strategy Builder",
    description: "Build custom IF/THEN rules for each street",
    features: [
      "Everything in Quick",
      "Visual rule builder",
      "Range chart",
      "Per-street control",
    ],
  },
  {
    id: "pro",
    name: "Pro Builder",
    description: "Full control with per-position overrides",
    features: [
      "Everything in Strategy",
      "Position overrides",
      "Advanced conditions",
    ],
  },
];

export function TierSelector() {
  const { tier, setTier } = useBotBuilderStore();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {TIERS.map((t) => {
        const isSelected = tier === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTier(t.id)}
            className={`p-4 rounded-lg border text-left transition-all
              ${
                isSelected
                  ? "border-[var(--poker-gold)] bg-[var(--poker-gold)]/10 ring-1 ring-[var(--poker-gold)]"
                  : "border-[var(--line)] bg-[var(--surface-light)] hover:border-[var(--text-subtle)]"
              }`}
          >
            <h3
              className={`text-base font-semibold mb-1 ${
                isSelected
                  ? "text-[var(--poker-gold)]"
                  : "text-[var(--text-primary)]"
              }`}
            >
              {t.name}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              {t.description}
            </p>
            <ul className="space-y-1">
              {t.features.map((f, i) => (
                <li
                  key={i}
                  className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5"
                >
                  <span
                    className={`w-1 h-1 rounded-full ${
                      isSelected
                        ? "bg-[var(--poker-gold)]"
                        : "bg-[var(--text-subtle)]"
                    }`}
                  />
                  {f}
                </li>
              ))}
            </ul>
          </button>
        );
      })}
    </div>
  );
}
