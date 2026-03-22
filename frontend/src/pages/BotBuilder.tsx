import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBotBuilderStore } from "../stores/botBuilderStore";
import { useAuthStore } from "../stores/authStore";
import { TierSelector } from "../components/bot-builder/TierSelector";
import { PersonalitySliders } from "../components/bot-builder/PersonalitySliders";
import { PersonalityPresets } from "../components/bot-builder/PersonalityPresets";
import { RuleBuilder } from "../components/bot-builder/RuleBuilder";
import { RangeChart } from "../components/bot-builder/RangeChart";
import { PositionOverrides } from "../components/bot-builder/PositionOverrides";
import { WhatIfSimulator } from "../components/bot-builder/WhatIfSimulator";
import {
  PageShell,
  PageHeader,
  SurfaceCard,
  Button,
  AlertBanner,
  TextField,
} from "../components/ui/primitives";

export function BotBuilder() {
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const {
    tier,
    name,
    description,
    saving,
    error,
    setName,
    setDescription,
    loadPresets,
    loadConditionFields,
    saveBot,
    reset,
  } = useBotBuilderStore();

  const [step, setStep] = useState<"tier" | "personality" | "rules" | "review">(
    "tier",
  );

  useEffect(() => {
    loadPresets();
    loadConditionFields();
    return () => reset();
  }, []);

  const steps = getSteps(tier);
  const currentStepIndex = steps.indexOf(step);

  const handleSave = async () => {
    if (!token) return;
    try {
      await saveBot(token);
      navigate("/bots");
    } catch {
      // error is set in store
    }
  };

  const canProceed = () => {
    if (step === "tier") return true;
    if (step === "personality") return true;
    if (step === "rules") return true;
    if (step === "review") return name.length >= 2;
    return false;
  };

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setStep(steps[nextIndex]);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setStep(steps[prevIndex]);
    }
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="Bot Builder"
        title="Create Your Bot"
        description="Design a poker bot using personality sliders, rules, and range charts — no coding required."
        backHref="/bots"
        backLabel="Back to Bots"
      />

      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((s, i) => (
          <button
            key={s}
            onClick={() => setStep(s)}
            className="flex items-center gap-2 group"
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
                ${
                  i <= currentStepIndex
                    ? "bg-[var(--poker-gold)] text-black"
                    : "bg-[var(--surface-light)] text-[var(--text-muted)]"
                }`}
            >
              {i + 1}
            </div>
            <span
              className={`text-sm hidden sm:block ${
                step === s
                  ? "text-[var(--text-primary)] font-medium"
                  : "text-[var(--text-muted)]"
              }`}
            >
              {STEP_LABELS[s]}
            </span>
            {i < steps.length - 1 && (
              <div
                className={`w-8 h-px ${
                  i < currentStepIndex
                    ? "bg-[var(--poker-gold)]"
                    : "bg-[var(--line)]"
                }`}
              />
            )}
          </button>
        ))}
      </div>

      {error && (
        <AlertBanner
          tone="danger"
          onDismiss={() => useBotBuilderStore.setState({ error: null })}
        >
          {error}
        </AlertBanner>
      )}

      {/* Step content */}
      <div className="mb-8">
        {step === "tier" && (
          <SurfaceCard>
            <h2 className="section-title mb-4">Choose Complexity Level</h2>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              Start simple with personality sliders, or go deeper with rules and
              range charts.
            </p>
            <TierSelector />
          </SurfaceCard>
        )}

        {step === "personality" && (
          <div className="space-y-6">
            <SurfaceCard>
              <h2 className="section-title mb-4">Preset Profiles</h2>
              <p className="text-sm text-[var(--text-muted)] mb-4">
                Start with a preset, then fine-tune the sliders to match your
                style.
              </p>
              <PersonalityPresets />
            </SurfaceCard>

            <SurfaceCard>
              <h2 className="section-title mb-4">Personality Sliders</h2>
              <p className="text-sm text-[var(--text-muted)] mb-4">
                These sliders define your bot&apos;s DNA. They serve as the
                fallback behavior when no specific rule matches.
              </p>
              <PersonalitySliders />
            </SurfaceCard>
          </div>
        )}

        {step === "rules" && (
          <div className="space-y-6">
            <SurfaceCard>
              <h2 className="section-title mb-4">Strategy Rules</h2>
              <p className="text-sm text-[var(--text-muted)] mb-4">
                Build IF/THEN rules for each street. Rules are evaluated
                top-to-bottom — the first matching rule wins. Anything not
                covered falls back to personality.
              </p>
              <RuleBuilder />
            </SurfaceCard>

            <SurfaceCard>
              <h2 className="section-title mb-4">Pre-Flop Range Chart</h2>
              <p className="text-sm text-[var(--text-muted)] mb-4">
                Paint your pre-flop opening ranges. Click or drag to assign
                actions. Hands not painted use personality fallback.
              </p>
              <RangeChart />
            </SurfaceCard>

            {tier === "pro" && (
              <SurfaceCard>
                <h2 className="section-title mb-4">Position Overrides</h2>
                <PositionOverrides />
              </SurfaceCard>
            )}
          </div>
        )}

        {step === "review" && (
          <div className="space-y-6">
            <SurfaceCard>
              <h2 className="section-title mb-4">Name & Save</h2>
              <div className="space-y-4 max-w-md">
                <TextField
                  label="Bot Name"
                  value={name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setName(e.target.value)
                  }
                  placeholder="e.g., GoldShark-v1"
                  hint="2-100 chars, letters, numbers, underscores, hyphens"
                  error={
                    name.length > 0 && name.length < 2
                      ? "Name too short"
                      : undefined
                  }
                />
                <TextField
                  label="Description"
                  value={description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setDescription(e.target.value)
                  }
                  placeholder="Brief description of your bot's strategy..."
                  multiline
                />

                <div className="pt-4">
                  <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
                    Strategy Summary
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-[var(--surface)] p-3 rounded-lg">
                      <p className="text-[var(--text-muted)]">Tier</p>
                      <p className="text-[var(--text-primary)] font-medium capitalize">
                        {tier}
                      </p>
                    </div>
                    <div className="bg-[var(--surface)] p-3 rounded-lg">
                      <p className="text-[var(--text-muted)]">Personality</p>
                      <p className="text-[var(--text-primary)] font-medium">
                        {useBotBuilderStore.getState().selectedPresetId
                          ? useBotBuilderStore
                              .getState()
                              .presets.find(
                                (p) =>
                                  p.id ===
                                  useBotBuilderStore.getState()
                                    .selectedPresetId,
                              )?.name || "Custom"
                          : "Custom"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <h2 className="section-title mb-4">What-If Simulator</h2>
              <p className="text-sm text-[var(--text-muted)] mb-4">
                Test your bot against common poker scenarios before saving.
              </p>
              <WhatIfSimulator />
            </SurfaceCard>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <Button
          variant="ghost"
          onClick={handleBack}
          disabled={currentStepIndex === 0}
        >
          Back
        </Button>

        {step === "review" ? (
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!canProceed() || saving}
          >
            {saving ? "Creating..." : "Create Bot"}
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={handleNext}
            disabled={!canProceed()}
          >
            Next
          </Button>
        )}
      </div>
    </PageShell>
  );
}

const STEP_LABELS: Record<string, string> = {
  tier: "Complexity",
  personality: "Personality",
  rules: "Strategy",
  review: "Review",
};

function getSteps(
  tier: string,
): Array<"tier" | "personality" | "rules" | "review"> {
  if (tier === "quick") {
    return ["tier", "personality", "review"];
  }
  return ["tier", "personality", "rules", "review"];
}
