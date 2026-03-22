import { useBotBuilderStore } from "../../stores/botBuilderStore";

export function PersonalityPresets() {
  const { presets, selectedPresetId, setPreset } = useBotBuilderStore();

  if (presets.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">Loading presets...</p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {presets.map((preset) => {
        const isSelected = selectedPresetId === preset.id;
        return (
          <button
            key={preset.id}
            onClick={() => setPreset(preset.id)}
            className={`p-3 rounded-lg border text-left transition-all
              ${
                isSelected
                  ? "border-[var(--poker-gold)] bg-[var(--poker-gold)]/10 ring-1 ring-[var(--poker-gold)]"
                  : "border-[var(--line)] bg-[var(--surface-light)] hover:border-[var(--text-subtle)]"
              }`}
          >
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
              {preset.name}
            </p>
            <p className="text-xs text-[var(--text-muted)] line-clamp-2">
              {preset.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
