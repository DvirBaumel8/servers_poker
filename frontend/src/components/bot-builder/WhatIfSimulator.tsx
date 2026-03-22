import { useState } from "react";
import { useBotBuilderStore } from "../../stores/botBuilderStore";
import { botsApi } from "../../api/bots";
import { useAuthStore } from "../../stores/authStore";

interface SimResult {
  action: { type: string; amount?: number };
  source: string;
  explanation: string;
  ruleId?: string;
  handNotation?: string;
}

const PREBUILT_SCENARIOS = [
  {
    name: "Premium hand, no action",
    description: "You have AA preflop, first to act",
    scenario: {
      stage: "pre-flop",
      holeCards: ["As", "Ah"],
      communityCards: [],
      position: "UTG",
      stackSize: 1000,
      potSize: 15,
      bigBlind: 10,
      facingBet: false,
      betAmount: 0,
      playersInHand: 6,
    },
  },
  {
    name: "Medium pair facing raise",
    description: "You have 88 and someone raised 3x",
    scenario: {
      stage: "pre-flop",
      holeCards: ["8d", "8c"],
      communityCards: [],
      position: "CO",
      stackSize: 800,
      potSize: 45,
      bigBlind: 10,
      facingBet: true,
      betAmount: 30,
      playersInHand: 4,
    },
  },
  {
    name: "Top pair on flop",
    description: "You have AK and the flop is A-7-2 rainbow",
    scenario: {
      stage: "flop",
      holeCards: ["Ac", "Kh"],
      communityCards: ["Ad", "7s", "2c"],
      position: "BTN",
      stackSize: 950,
      potSize: 60,
      bigBlind: 10,
      facingBet: false,
      betAmount: 0,
      playersInHand: 3,
    },
  },
  {
    name: "Flush draw on turn",
    description: "You have two hearts, three on board, turn comes blank",
    scenario: {
      stage: "turn",
      holeCards: ["Kh", "Jh"],
      communityCards: ["9h", "4h", "2c", "Qs"],
      position: "MP",
      stackSize: 600,
      potSize: 120,
      bigBlind: 10,
      facingBet: true,
      betAmount: 60,
      playersInHand: 2,
    },
  },
  {
    name: "Short stack all-in decision",
    description: "You have A5s with only 8 big blinds left",
    scenario: {
      stage: "pre-flop",
      holeCards: ["Ah", "5h"],
      communityCards: [],
      position: "BTN",
      stackSize: 80,
      potSize: 15,
      bigBlind: 10,
      facingBet: false,
      betAmount: 0,
      playersInHand: 3,
    },
  },
  {
    name: "River bluff spot",
    description: "Missed your draw on a scary board",
    scenario: {
      stage: "river",
      holeCards: ["Ts", "9s"],
      communityCards: ["8c", "7d", "2h", "Kc", "3s"],
      position: "CO",
      stackSize: 500,
      potSize: 200,
      bigBlind: 10,
      facingBet: false,
      betAmount: 0,
      playersInHand: 2,
    },
  },
];

export function WhatIfSimulator() {
  const { buildStrategy } = useBotBuilderStore();
  const { token } = useAuthStore();
  const [results, setResults] = useState<Record<number, SimResult | null>>({});
  const [loading, setLoading] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const runScenario = async (index: number) => {
    if (!token) return;
    setLoading((prev) => ({ ...prev, [index]: true }));
    setError(null);
    try {
      const strategy = buildStrategy();
      const scenario = PREBUILT_SCENARIOS[index].scenario;
      const result = await botsApi.simulateAction(strategy, scenario, token);
      setResults((prev) => ({ ...prev, [index]: result }));
    } catch (e: any) {
      setError(e.message || "Simulation failed");
    } finally {
      setLoading((prev) => ({ ...prev, [index]: false }));
    }
  };

  const runAll = async () => {
    if (!token) return;
    setError(null);
    const strategy = buildStrategy();
    const allLoading: Record<number, boolean> = {};
    PREBUILT_SCENARIOS.forEach((_, i) => (allLoading[i] = true));
    setLoading(allLoading);

    for (let i = 0; i < PREBUILT_SCENARIOS.length; i++) {
      try {
        const result = await botsApi.simulateAction(
          strategy,
          PREBUILT_SCENARIOS[i].scenario,
          token,
        );
        setResults((prev) => ({ ...prev, [i]: result }));
      } catch (e: any) {
        setError(e.message || `Scenario ${i + 1} failed`);
      } finally {
        setLoading((prev) => ({ ...prev, [i]: false }));
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-muted)]">
          Test your bot against common poker scenarios. See exactly how it would
          act and why.
        </p>
        <button
          onClick={runAll}
          className="text-xs px-3 py-1.5 rounded-md bg-[var(--poker-gold)]/20
            text-[var(--poker-gold)] hover:bg-[var(--poker-gold)]/30 transition-colors"
        >
          Run All
        </button>
      </div>

      {error && (
        <div className="text-sm text-[var(--error)] bg-[var(--error)]/10 p-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid gap-3">
        {PREBUILT_SCENARIOS.map((sc, i) => (
          <div
            key={i}
            className="border border-[var(--line)] rounded-lg overflow-hidden bg-[var(--surface-light)]"
          >
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {sc.name}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {sc.description}
                </p>
                <div className="flex gap-2 mt-1.5 flex-wrap">
                  <ScenarioBadge label={sc.scenario.stage} />
                  <ScenarioBadge label={`${sc.scenario.holeCards.join(" ")}`} />
                  <ScenarioBadge label={sc.scenario.position} />
                  <ScenarioBadge
                    label={`${sc.scenario.stackSize / sc.scenario.bigBlind}bb`}
                  />
                  {sc.scenario.facingBet && (
                    <ScenarioBadge label={`Facing ${sc.scenario.betAmount}`} />
                  )}
                </div>
              </div>
              <button
                onClick={() => runScenario(i)}
                disabled={loading[i]}
                className="text-xs px-3 py-1.5 rounded-md border border-[var(--line)]
                  text-[var(--text-secondary)] hover:text-[var(--poker-gold)]
                  hover:border-[var(--poker-gold)] transition-colors disabled:opacity-50"
              >
                {loading[i] ? "..." : "Test"}
              </button>
            </div>

            {results[i] && (
              <div className="border-t border-[var(--line)] px-4 py-3 bg-[var(--surface)]">
                <div className="flex items-center gap-3">
                  <ActionBadge type={results[i].action.type} />
                  {results[i].action.amount != null && (
                    <span className="text-sm text-[var(--text-primary)] font-mono">
                      ${results[i].action.amount}
                    </span>
                  )}
                  <span className="text-xs text-[var(--text-subtle)] border-l border-[var(--line)] pl-3">
                    Source: {results[i].source}
                  </span>
                </div>
                {results[i].explanation && (
                  <p className="text-xs text-[var(--text-muted)] mt-1.5">
                    {results[i].explanation}
                  </p>
                )}
                {results[i].handNotation && (
                  <p className="text-xs text-[var(--text-subtle)] mt-1">
                    Hand: {results[i].handNotation}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScenarioBadge({ label }: { label: string }) {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface)] text-[var(--text-subtle)] font-mono">
      {label}
    </span>
  );
}

function ActionBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    fold: "text-red-400 bg-red-500/15",
    check: "text-gray-400 bg-gray-500/15",
    call: "text-blue-400 bg-blue-500/15",
    raise: "text-green-400 bg-green-500/15",
    all_in: "text-yellow-400 bg-yellow-500/15",
  };
  return (
    <span
      className={`text-sm font-bold px-2.5 py-1 rounded-md uppercase ${colors[type] || "text-white bg-white/10"}`}
    >
      {type.replace("_", "-")}
    </span>
  );
}
