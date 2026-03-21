/**
 * WebSocket Real-time UI Tests
 * ============================
 *
 * Tests that verify the UI updates correctly when WebSocket events are received.
 *
 * Scenarios:
 * - Player joins table → UI shows new player
 * - Player bets → chip stack updates
 * - Community cards dealt → cards animate in
 * - Player folds → UI shows fold state
 * - Winner declared → animation plays
 */

export interface WebSocketTestConfig {
  baseUrl: string;
  backendUrl: string;
  wsUrl: string;
}

export const DEFAULT_WS_CONFIG: WebSocketTestConfig = {
  baseUrl: "http://localhost:3001",
  backendUrl: "http://localhost:3000",
  wsUrl: "ws://localhost:3000",
};

/**
 * WebSocket events to test UI reactions
 */
export const WS_TEST_EVENTS = {
  PLAYER_JOINED: {
    event: "player:joined",
    description: "New player joins the table",
    expectedUIChanges: [
      "New player seat appears",
      "Player count updates",
      "Player name displayed",
      "Chip count shown",
    ],
    timing: "Should appear within 500ms",
  },

  PLAYER_BET: {
    event: "player:bet",
    description: "Player places a bet",
    expectedUIChanges: [
      "Chip stack in front of player decreases",
      "Bet chips appear near player",
      "Pot updates (after action complete)",
      "Action badge shows BET/RAISE",
    ],
    timing: "Animation within 300ms, completion within 1s",
  },

  PLAYER_FOLD: {
    event: "player:fold",
    description: "Player folds their hand",
    expectedUIChanges: [
      "Player seat shows folded state (dimmed)",
      "FOLD badge appears",
      "Cards visually fold/hide",
    ],
    timing: "Within 300ms",
  },

  CARDS_DEALT: {
    event: "cards:dealt",
    description: "Community cards are dealt",
    expectedUIChanges: [
      "Cards animate into center",
      "Stage indicator updates (FLOP/TURN/RIVER)",
      "Cards are clearly visible",
    ],
    timing: "Animation 500ms-1s",
  },

  TURN_CHANGE: {
    event: "turn:change",
    description: "Turn changes to next player",
    expectedUIChanges: [
      "Previous player highlight removed",
      "New active player highlighted",
      "Timer starts for active player",
      "THINKING indicator shows",
    ],
    timing: "Immediate (< 100ms)",
  },

  HAND_WINNER: {
    event: "hand:winner",
    description: "Hand completes and winner is declared",
    expectedUIChanges: [
      "Winner highlight/animation",
      "Winning cards shown (showdown)",
      "Pot chips animate to winner",
      "Toast/notification appears",
    ],
    timing: "Animation 1-2s",
  },

  PLAYER_LEFT: {
    event: "player:left",
    description: "Player leaves the table",
    expectedUIChanges: [
      "Player seat emptied or removed",
      "Player count updates",
      "Remaining players may shift",
    ],
    timing: "Within 500ms",
  },

  ALL_IN: {
    event: "player:allin",
    description: "Player goes all-in",
    expectedUIChanges: [
      "ALL IN badge appears",
      "Full chip stack moves to pot area",
      "Dramatic visual effect",
    ],
    timing: "Within 300ms, animation 1s",
  },

  BLIND_LEVEL_UP: {
    event: "tournament:blindsUp",
    description: "Tournament blind level increases",
    expectedUIChanges: [
      "Blind display updates",
      "Notification/toast appears",
      "Visual/audio cue",
    ],
    timing: "Immediate notification, UI update within 500ms",
  },
};

/**
 * AI Instructions for WebSocket Real-time Tests
 */
export function generateWSTestInstructions(config = DEFAULT_WS_CONFIG): string {
  return `
# WebSocket Real-time UI Test Instructions

## Purpose
Test that the poker table UI correctly responds to real-time WebSocket events.

## Setup
1. Backend running at ${config.backendUrl}
2. Frontend running at ${config.baseUrl}
3. A test game table created with bots

## Test Procedure

### Test 1: Player Action Updates

1. Navigate to a game table with the browser
2. Take initial screenshot: \`game-before-action.png\`
3. Trigger a bot action via API or wait for natural game flow
4. Use browser_snapshot with includeDiff: true to see changes
5. Verify the expected UI changes occurred

### Test 2: Turn Change Visibility

1. Watch for turn changes in the UI
2. Verify the active player indicator moves
3. Check timer appears for active player
4. Take screenshots before/after turn change

### Test 3: Card Deal Animation

1. Start a new hand
2. Capture the pre-flop state
3. Wait for flop to be dealt
4. Use browser_snapshot to verify:
   - 3 cards visible in community area
   - Stage indicator shows "Flop"

### Test 4: All-In Detection

1. Trigger an all-in action
2. Verify ALL IN badge appears
3. Check chip stack moves appropriately
4. Take screenshot for visual verification

### Test 5: Hand Completion

1. Play hand to showdown
2. Verify winner is highlighted
3. Check pot animation to winner
4. Verify winner notification appears

## Verification Steps for Each Event

${Object.entries(WS_TEST_EVENTS)
  .map(
    ([key, event]) => `
### ${event.event}
${event.description}

Expected UI changes:
${event.expectedUIChanges.map((c) => `- ${c}`).join("\n")}

Timing: ${event.timing}
`,
  )
  .join("")}

## Error Conditions to Check

1. **Stale UI**: Elements don't update when expected
2. **Missing animations**: Transitions missing or choppy
3. **Incorrect state**: Wrong player highlighted, wrong counts
4. **Race conditions**: UI flickers between states
5. **Memory leaks**: Performance degrades over time

## Reporting

Document each test with:
- Screenshot before
- Action taken/event received  
- Screenshot after
- Whether expected changes occurred
- Any issues found
`;
}

/**
 * Test scenarios for AI to execute
 */
export const WS_TEST_SCENARIOS = [
  {
    name: "Full Hand Cycle",
    description: "Watch a complete hand from deal to winner",
    steps: [
      "Navigate to active game table",
      "Wait for hand to start (pre-flop)",
      "Screenshot: hand-start.png",
      "Wait for flop (use browser_snapshot with includeDiff)",
      "Screenshot: flop.png - verify 3 cards visible",
      "Wait for turn",
      "Screenshot: turn.png - verify 4 cards visible",
      "Wait for river",
      "Screenshot: river.png - verify 5 cards visible",
      "Wait for showdown/winner",
      "Screenshot: winner.png - verify winner animation",
    ],
    expectedDuration: "30-60 seconds per hand",
  },
  {
    name: "Player Join/Leave",
    description: "Verify player list updates correctly",
    steps: [
      "Navigate to a table with available seats",
      "Screenshot: before-join.png",
      "Trigger a bot to join via API",
      "Use browser_snapshot with includeDiff to see changes",
      "Verify new player seat populated",
      "Screenshot: after-join.png",
    ],
    expectedDuration: "10-20 seconds",
  },
  {
    name: "Rapid Action Sequence",
    description: "Verify UI handles quick successive actions",
    steps: [
      "Navigate to a game in pre-flop",
      "Wait for multiple quick actions (fold, call, raise)",
      "Use browser_snapshot after each action",
      "Verify no UI glitches or state desync",
      "Screenshot final state",
    ],
    expectedDuration: "15-30 seconds",
  },
  {
    name: "All-In Showdown",
    description: "Verify all-in and showdown visuals",
    steps: [
      "Find or create a game where player goes all-in",
      "Screenshot: before-allin.png",
      "Trigger all-in action",
      "Verify ALL IN badge appears",
      "Screenshot: after-allin.png",
      "Wait for showdown",
      "Verify both players' cards revealed",
      "Screenshot: showdown.png",
    ],
    expectedDuration: "20-40 seconds",
  },
];

/**
 * DOM selectors for WebSocket test verification
 */
export const WS_DOM_SELECTORS = {
  // Active player indicator
  ACTIVE_PLAYER: "[class*='scale-1.05']",
  THINKING_INDICATOR: ":has-text('THINKING')",
  TIMER_RING: "svg circle[stroke-dasharray]",

  // Action badges
  ACTION_BET: ":has-text('BET')",
  ACTION_CALL: ":has-text('CALL')",
  ACTION_RAISE: ":has-text('RAISE')",
  ACTION_FOLD: ":has-text('FOLD')",
  ACTION_CHECK: ":has-text('CHECK')",
  ALL_IN_BADGE: ":has-text('ALL IN')",

  // Cards
  COMMUNITY_CARDS_AREA: "[class*='CommunityCards']",
  CARD_ELEMENT: "[class*='PlayingCard']",

  // Pot and chips
  POT_DISPLAY: ":has-text('Main pot')",
  CHIP_STACK: "[class*='PokerChipStack']",

  // Stage indicator
  STAGE_PREFLOP: ":has-text('Pre-Flop')",
  STAGE_FLOP: ":has-text('Flop')",
  STAGE_TURN: ":has-text('Turn')",
  STAGE_RIVER: ":has-text('River')",
  STAGE_SHOWDOWN: ":has-text('Showdown')",

  // Winner
  WINNER_ANIMATION: "[class*='WinnerAnimation']",
  HAND_RESULT_TOAST: "[class*='HandResultToast']",
};

if (require.main === module) {
  console.log(generateWSTestInstructions());
}
