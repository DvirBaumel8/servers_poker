/**
 * Strategy Evaluation Resilience Tests
 * =====================================
 *
 * Tests for handling:
 * - Corrupt strategy JSON
 * - Invalid personality values
 * - Missing strategy fields
 * - Extreme boundary values
 * - Strategy evaluation performance
 */

export interface ResilienceTestConfig {
  backendUrl: string;
  timeoutMs: number;
}

export const DEFAULT_RESILIENCE_CONFIG: ResilienceTestConfig = {
  backendUrl: "http://localhost:3000",
  timeoutMs: 10000,
};

export const STRATEGY_FAULT_MODES = {
  NORMAL: "normal",
  CORRUPT_JSON: "corrupt_json",
  EXTREME_AGGRESSIVE: "extreme_aggressive",
  EXTREME_PASSIVE: "extreme_passive",
  INVALID_VALUES: "invalid_values",
  MISSING_FIELDS: "missing_fields",
};

export function createFaultStrategy(
  faultMode: string,
): Record<string, unknown> {
  switch (faultMode) {
    case STRATEGY_FAULT_MODES.CORRUPT_JSON:
      return {
        version: "invalid",
        tier: 123,
        personality: "not_an_object",
      } as any;

    case STRATEGY_FAULT_MODES.EXTREME_AGGRESSIVE:
      return {
        version: 1,
        tier: "quick",
        personality: {
          aggression: 100,
          bluffFrequency: 100,
          riskTolerance: 100,
          tightness: 0,
        },
      };

    case STRATEGY_FAULT_MODES.EXTREME_PASSIVE:
      return {
        version: 1,
        tier: "quick",
        personality: {
          aggression: 0,
          bluffFrequency: 0,
          riskTolerance: 0,
          tightness: 100,
        },
      };

    case STRATEGY_FAULT_MODES.INVALID_VALUES:
      return {
        version: 1,
        tier: "quick",
        personality: {
          aggression: -50,
          bluffFrequency: 999,
          riskTolerance: NaN,
          tightness: undefined,
        },
      };

    case STRATEGY_FAULT_MODES.MISSING_FIELDS:
      return { version: 1 };

    case STRATEGY_FAULT_MODES.NORMAL:
    default:
      return {
        version: 1,
        tier: "quick",
        personality: {
          aggression: 50,
          bluffFrequency: 50,
          riskTolerance: 50,
          tightness: 50,
        },
      };
  }
}

export const RESILIENCE_SCENARIOS = [
  {
    name: "Corrupt Strategy JSON",
    description: "Bot with corrupt strategy should use fallback behavior",
    setup: {
      totalBots: 6,
      faultBots: [{ position: 2, mode: STRATEGY_FAULT_MODES.CORRUPT_JSON }],
    },
    expectedBehavior: [
      "Game doesn't crash",
      "Bot with corrupt strategy uses default behavior",
      "Other bots continue playing normally",
      "Hand completes normally",
    ],
    maxDuration: 30000,
  },
  {
    name: "Extreme Personality Values",
    description: "Bots with extreme (boundary) personality values",
    setup: {
      totalBots: 4,
      faultBots: [
        { position: 0, mode: STRATEGY_FAULT_MODES.EXTREME_AGGRESSIVE },
        { position: 1, mode: STRATEGY_FAULT_MODES.EXTREME_PASSIVE },
      ],
    },
    expectedBehavior: [
      "Game runs with extreme bots",
      "No crashes from boundary values",
      "Actions remain valid",
    ],
    maxDuration: 30000,
  },
  {
    name: "Invalid Strategy Values",
    description: "Strategy with NaN, negative, and out-of-range values",
    setup: {
      totalBots: 4,
      faultBots: [
        { position: 0, mode: STRATEGY_FAULT_MODES.INVALID_VALUES },
        { position: 1, mode: STRATEGY_FAULT_MODES.INVALID_VALUES },
      ],
    },
    expectedBehavior: [
      "Invalid values clamped or defaulted",
      "Game continues without errors",
      "No undefined behavior",
    ],
    maxDuration: 30000,
  },
  {
    name: "Missing Strategy Fields",
    description: "Strategy JSON missing required fields",
    setup: {
      totalBots: 6,
      faultBots: [
        { position: 1, mode: STRATEGY_FAULT_MODES.MISSING_FIELDS },
        { position: 3, mode: STRATEGY_FAULT_MODES.MISSING_FIELDS },
      ],
    },
    expectedBehavior: [
      "Missing fields defaulted",
      "Default action applied",
      "No crash or undefined behavior",
    ],
    maxDuration: 30000,
  },
  {
    name: "All Bots Corrupt Strategy",
    description: "Worst case - all bots have invalid strategies",
    setup: {
      totalBots: 4,
      faultBots: [
        { position: 0, mode: STRATEGY_FAULT_MODES.CORRUPT_JSON },
        { position: 1, mode: STRATEGY_FAULT_MODES.CORRUPT_JSON },
        { position: 2, mode: STRATEGY_FAULT_MODES.CORRUPT_JSON },
        { position: 3, mode: STRATEGY_FAULT_MODES.CORRUPT_JSON },
      ],
    },
    expectedBehavior: [
      "Game doesn't hang indefinitely",
      "All bots use fallback behavior",
      "Game state remains consistent",
    ],
    maxDuration: 60000,
  },
  {
    name: "Mixed Strategy Faults",
    description: "Mix of fault modes in the same game",
    setup: {
      totalBots: 6,
      faultBots: [
        { position: 0, mode: STRATEGY_FAULT_MODES.EXTREME_AGGRESSIVE },
        { position: 2, mode: STRATEGY_FAULT_MODES.MISSING_FIELDS },
        { position: 4, mode: STRATEGY_FAULT_MODES.INVALID_VALUES },
      ],
    },
    expectedBehavior: [
      "Mixed fault bots handled",
      "Game completes or reaches steady state",
      "No orphaned game state",
    ],
    maxDuration: 60000,
  },
];

export function generateResilienceTestInstructions(
  config = DEFAULT_RESILIENCE_CONFIG,
): string {
  return `
# Strategy Evaluation Resilience Test Instructions

## Purpose
Test that the poker system handles strategy evaluation faults gracefully:
- Corrupt strategy JSON
- Invalid personality values
- Missing strategy fields
- Extreme boundary values

## Strategy Fault Modes

| Mode | Description |
|------|-------------|
| corrupt_json | Invalid types for version, tier, personality |
| extreme_aggressive | All values at maximum (100/0) |
| extreme_passive | All values at minimum (0/100) |
| invalid_values | Negative, NaN, and out-of-range numbers |
| missing_fields | Strategy JSON with only version field |

## Test Scenarios

${RESILIENCE_SCENARIOS.map(
  (s, i) => `
### ${i + 1}. ${s.name}
${s.description}

Setup: ${s.setup.totalBots} bots, ${s.setup.faultBots.length} with faults

Expected:
${s.expectedBehavior.map((b) => `- ${b}`).join("\n")}

Max duration: ${s.maxDuration}ms
`,
).join("")}
`;
}

export async function runResilienceScenario(
  scenario: (typeof RESILIENCE_SCENARIOS)[0],
  config = DEFAULT_RESILIENCE_CONFIG,
): Promise<{
  success: boolean;
  duration: number;
  errors: string[];
  observations: string[];
}> {
  const errors: string[] = [];
  const observations: string[] = [];
  const startTime = Date.now();

  console.log(`\n=== Running: ${scenario.name} ===`);
  console.log(scenario.description);

  try {
    for (let i = 0; i < scenario.setup.totalBots; i++) {
      const faultBot = scenario.setup.faultBots.find((f) => f.position === i);
      const mode = faultBot?.mode || STRATEGY_FAULT_MODES.NORMAL;
      const strategy = createFaultStrategy(mode);
      observations.push(
        `Bot ${i}: mode=${mode}, strategy=${JSON.stringify(strategy).slice(0, 80)}`,
      );
    }

    observations.push(
      "Strategy configurations generated, ready for game creation",
    );
  } catch (err) {
    errors.push(`Scenario error: ${err}`);
  }

  const duration = Date.now() - startTime;
  const success = errors.length === 0;

  return { success, duration, errors, observations };
}

if (require.main === module) {
  console.log(generateResilienceTestInstructions());
}
