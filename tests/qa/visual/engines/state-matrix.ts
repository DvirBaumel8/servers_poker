/**
 * State Combination Matrix Generator
 * ===================================
 *
 * Generates test combinations using pairwise testing
 * to maximize bug discovery with minimal test cases.
 *
 * Instead of testing all combinations (2000+), we use
 * pairwise testing to cover all pairs of states (~100 tests).
 */

export interface StateVariable {
  name: string;
  values: string[];
}

export interface StateCombo {
  id: string;
  variables: Record<string, string>;
  description: string;
}

/**
 * State variables for the poker platform
 */
export const PLATFORM_STATES: StateVariable[] = [
  {
    name: "user_auth",
    values: ["logged_out", "logged_in", "admin", "suspended"],
  },
  {
    name: "game_status",
    values: ["waiting", "running", "showdown", "finished", "error"],
  },
  {
    name: "player_count",
    values: ["0", "1", "2", "6", "9"],
  },
  {
    name: "player_state",
    values: ["active", "folded", "all_in", "disconnected", "busted"],
  },
  {
    name: "network",
    values: ["online", "slow", "offline", "reconnecting"],
  },
  {
    name: "tournament_phase",
    values: ["registration", "running", "final_table", "finished"],
  },
  {
    name: "data_state",
    values: ["loading", "loaded", "empty", "error"],
  },
  {
    name: "viewport",
    values: ["desktop", "tablet", "mobile", "fold"],
  },
];

/**
 * Game table specific states
 */
export const GAME_TABLE_STATES: StateVariable[] = [
  {
    name: "stage",
    values: ["pre-flop", "flop", "turn", "river", "showdown"],
  },
  {
    name: "pot_size",
    values: ["0", "small", "medium", "large", "huge"],
  },
  {
    name: "active_player_position",
    values: ["0", "1", "2", "3", "4", "5", "6", "7", "8"],
  },
  {
    name: "dealer_position",
    values: ["0", "1", "2", "3", "4", "5", "6", "7", "8"],
  },
  {
    name: "player_cards_visible",
    values: ["none", "hero_only", "showdown_all"],
  },
  {
    name: "community_cards",
    values: ["0", "3", "4", "5"],
  },
  {
    name: "recent_action",
    values: ["none", "fold", "check", "call", "bet", "raise", "all_in"],
  },
  {
    name: "timer_state",
    values: ["not_shown", "plenty_time", "warning", "critical"],
  },
];

/**
 * Generate pairwise combinations
 * Uses a greedy algorithm to cover all pairs of values
 */
export function generatePairwiseCombinations(
  variables: StateVariable[],
): StateCombo[] {
  const combos: StateCombo[] = [];
  const pairs = generateAllPairs(variables);
  const coveredPairs = new Set<string>();

  let comboId = 0;

  while (coveredPairs.size < pairs.length) {
    // Generate a new combination that covers the most uncovered pairs
    const combo = generateBestCombo(variables, pairs, coveredPairs);

    // Mark pairs as covered
    for (const pair of getCombosPairs(combo, variables)) {
      coveredPairs.add(pair);
    }

    combos.push({
      id: `STATE-${String(comboId++).padStart(3, "0")}`,
      variables: combo,
      description: generateComboDescription(combo),
    });
  }

  return combos;
}

function generateAllPairs(variables: StateVariable[]): string[] {
  const pairs: string[] = [];

  for (let i = 0; i < variables.length; i++) {
    for (let j = i + 1; j < variables.length; j++) {
      const var1 = variables[i];
      const var2 = variables[j];

      for (const val1 of var1.values) {
        for (const val2 of var2.values) {
          pairs.push(`${var1.name}:${val1}|${var2.name}:${val2}`);
        }
      }
    }
  }

  return pairs;
}

function generateBestCombo(
  variables: StateVariable[],
  allPairs: string[],
  coveredPairs: Set<string>,
): Record<string, string> {
  let bestCombo: Record<string, string> = {};
  let bestScore = 0;

  // Try random combinations and pick the one that covers most uncovered pairs
  for (let attempt = 0; attempt < 100; attempt++) {
    const combo: Record<string, string> = {};

    for (const variable of variables) {
      combo[variable.name] =
        variable.values[Math.floor(Math.random() * variable.values.length)];
    }

    const score = countUncoveredPairs(combo, variables, allPairs, coveredPairs);

    if (score > bestScore) {
      bestScore = score;
      bestCombo = combo;
    }
  }

  return bestCombo;
}

function countUncoveredPairs(
  combo: Record<string, string>,
  variables: StateVariable[],
  allPairs: string[],
  coveredPairs: Set<string>,
): number {
  let count = 0;

  for (const pair of getCombosPairs(combo, variables)) {
    if (!coveredPairs.has(pair)) {
      count++;
    }
  }

  return count;
}

function getCombosPairs(
  combo: Record<string, string>,
  variables: StateVariable[],
): string[] {
  const pairs: string[] = [];

  for (let i = 0; i < variables.length; i++) {
    for (let j = i + 1; j < variables.length; j++) {
      const var1 = variables[i];
      const var2 = variables[j];
      pairs.push(
        `${var1.name}:${combo[var1.name]}|${var2.name}:${combo[var2.name]}`,
      );
    }
  }

  return pairs;
}

function generateComboDescription(combo: Record<string, string>): string {
  const parts: string[] = [];

  if (combo.user_auth) parts.push(`User: ${combo.user_auth}`);
  if (combo.game_status) parts.push(`Game: ${combo.game_status}`);
  if (combo.player_count) parts.push(`Players: ${combo.player_count}`);
  if (combo.network) parts.push(`Network: ${combo.network}`);
  if (combo.viewport) parts.push(`Viewport: ${combo.viewport}`);

  return parts.join(", ");
}

/**
 * Generate high-value state combinations (manually curated)
 * These are known to produce bugs
 */
export function getHighValueCombinations(): StateCombo[] {
  return [
    // Auth edge cases
    {
      id: "HV-001",
      variables: {
        user_auth: "logged_out",
        page: "/bots",
        action: "view_private",
      },
      description: "Logged out user accessing private bot data",
    },
    {
      id: "HV-002",
      variables: {
        user_auth: "suspended",
        page: "/game",
        action: "join_table",
      },
      description: "Suspended user trying to join game",
    },

    // Game state edge cases
    {
      id: "HV-003",
      variables: {
        game_status: "running",
        player_count: "1",
        action: "play_hand",
      },
      description: "Running game with only 1 player",
    },
    {
      id: "HV-004",
      variables: { game_status: "showdown", community_cards: "0" },
      description: "Showdown with no community cards",
    },
    {
      id: "HV-005",
      variables: {
        player_count: "9",
        viewport: "mobile",
        action: "view_table",
      },
      description: "Full 9-player table on mobile viewport",
    },

    // Network edge cases
    {
      id: "HV-006",
      variables: {
        network: "offline",
        game_status: "running",
        action: "place_bet",
      },
      description: "Placing bet while offline",
    },
    {
      id: "HV-007",
      variables: { network: "reconnecting", tournament_phase: "final_table" },
      description: "Reconnecting during final table",
    },

    // Data edge cases
    {
      id: "HV-008",
      variables: { data_state: "loading", action: "navigate_away" },
      description: "Navigating away while loading",
    },
    {
      id: "HV-009",
      variables: { data_state: "error", action: "retry", network: "offline" },
      description: "Retrying after error while offline",
    },

    // Tournament edge cases
    {
      id: "HV-010",
      variables: {
        tournament_phase: "running",
        player_count: "0",
        action: "view_table",
      },
      description: "Tournament table with no players",
    },

    // UI stress tests
    {
      id: "HV-011",
      variables: {
        player_count: "9",
        recent_action: "all_in",
        pot_size: "huge",
      },
      description: "9 players, all-in action, huge pot display",
    },
    {
      id: "HV-012",
      variables: { timer_state: "critical", player_state: "all_in" },
      description: "Timer critical but player already all-in",
    },

    // Animation stress
    {
      id: "HV-013",
      variables: {
        stage: "showdown",
        recent_action: "all_in",
        player_count: "9",
      },
      description: "Showdown reveal with 9 players after all-in",
    },

    // Viewport edge cases
    {
      id: "HV-014",
      variables: {
        viewport: "fold",
        player_count: "9",
        game_status: "running",
      },
      description: "Galaxy Fold with full table running",
    },
    {
      id: "HV-015",
      variables: { viewport: "4k", player_count: "2", pot_size: "small" },
      description: "4K display with heads-up small pot",
    },
  ];
}

/**
 * Generate test instructions from state combinations
 */
export function generateStateTestInstructions(combos: StateCombo[]): string {
  return `
# State Combination Testing

## Overview
Testing ${combos.length} state combinations to find bugs that only appear
in specific combinations of application state.

## Test Procedure

For each combination:

### 1. Set Up State
Configure the application to match the required state:
- User authentication level
- Game status
- Player count
- Network conditions
- Data loading state

### 2. Execute Actions
Perform the specified actions for this state combination.

### 3. Verify Behavior
Check that:
- UI renders correctly
- No console errors
- No visual glitches
- Data displays correctly
- Navigation works
- Actions complete successfully

### 4. Document Issues
For any bugs found, record:
- State combination ID
- All state variables
- What went wrong
- Screenshot

## High-Value Combinations (Test First)

${getHighValueCombinations()
  .map(
    (c) => `
### ${c.id}: ${c.description}
\`\`\`
${Object.entries(c.variables)
  .map(([k, v]) => `${k}: ${v}`)
  .join("\n")}
\`\`\`
`,
  )
  .join("\n")}

## Generated Pairwise Combinations

${combos
  .slice(0, 20)
  .map(
    (c) => `
### ${c.id}
${c.description}
\`\`\`
${Object.entries(c.variables)
  .map(([k, v]) => `${k}: ${v}`)
  .join("\n")}
\`\`\`
`,
  )
  .join("\n")}

... and ${combos.length - 20} more combinations
`;
}

/**
 * Quick generation - get essential combinations
 */
export function getEssentialCombinations(): StateCombo[] {
  return [
    // Happy paths
    {
      id: "ESS-001",
      variables: {
        user_auth: "logged_in",
        game_status: "running",
        player_count: "6",
        network: "online",
      },
      description: "Normal 6-player game, logged in",
    },
    {
      id: "ESS-002",
      variables: {
        user_auth: "logged_out",
        page: "/tables",
        data_state: "loaded",
      },
      description: "Viewing tables logged out",
    },

    // Error paths
    {
      id: "ESS-003",
      variables: {
        user_auth: "logged_in",
        data_state: "error",
        network: "online",
      },
      description: "API error while logged in",
    },
    {
      id: "ESS-004",
      variables: { network: "offline", game_status: "running" },
      description: "Network goes offline during game",
    },

    // Edge cases
    {
      id: "ESS-005",
      variables: { player_count: "9", viewport: "mobile" },
      description: "Full table on mobile",
    },
    {
      id: "ESS-006",
      variables: {
        player_count: "0",
        game_status: "waiting",
        data_state: "loaded",
      },
      description: "Empty table waiting",
    },

    // Tournament
    {
      id: "ESS-007",
      variables: { tournament_phase: "final_table", player_count: "9" },
      description: "Final table full",
    },
    {
      id: "ESS-008",
      variables: { tournament_phase: "finished", data_state: "loaded" },
      description: "Tournament complete, viewing results",
    },
  ];
}
