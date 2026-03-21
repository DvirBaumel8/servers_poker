/**
 * Game Table Visual Tests
 * =======================
 *
 * Visual regression and layout tests for the poker game table.
 *
 * Tests:
 * - Player seat positioning at various player counts
 * - Card/name overlap detection
 * - Responsive layout at different viewports
 * - Element visibility and accessibility
 *
 * This test is designed to be run by an AI agent using browser MCP tools.
 * The test provides step-by-step instructions for the AI to follow.
 */

import {
  VisualTestResult,
  VisualIssue,
  GAME_VIEWPORTS,
  GAME_SELECTORS,
  checkOverlap,
  getOverlapPercentage,
  formatVisualTestReport,
  ElementBoundingBox,
} from "./visual-test-runner";

export interface GameTableTestConfig {
  baseUrl: string;
  tableId?: string;
  playerCounts: number[];
  viewports: typeof GAME_VIEWPORTS;
}

const DEFAULT_CONFIG: GameTableTestConfig = {
  baseUrl: "http://localhost:3001",
  playerCounts: [2, 6, 9],
  viewports: GAME_VIEWPORTS,
};

/**
 * AI Instructions for Game Table Visual Test
 * ==========================================
 *
 * This function generates instructions for an AI agent to perform visual testing.
 * The AI should use browser MCP tools to execute these tests.
 */
export function generateAITestInstructions(
  config: GameTableTestConfig = DEFAULT_CONFIG,
): string {
  return `
# Game Table Visual Test Instructions

## Setup
1. Ensure the frontend is running at ${config.baseUrl}
2. Ensure the backend is running with a test game available
3. Have browser MCP tools ready

## Test Procedure

### For each player count (${config.playerCounts.join(", ")} players):

#### Step 1: Navigate to Game Table
\`\`\`
browser_navigate to: ${config.baseUrl}/game/{tableId}
Wait for the table to load fully
\`\`\`

#### Step 2: Take Full Page Screenshot
\`\`\`
browser_take_screenshot with filename: game-table-{playerCount}p-{viewport}.png
\`\`\`

#### Step 3: Get DOM Snapshot
\`\`\`
browser_snapshot to understand element structure
\`\`\`

#### Step 4: Check Player Elements for Overlap

For each player seat, get bounding boxes and check for overlaps:

1. Get bounding box of player avatar
2. Get bounding box of player name plate
3. Get bounding box of player cards
4. Check if any cards overlap with adjacent player names
5. Check if any avatars overlap with other avatars

Use these selectors:
- Player avatars: ${GAME_SELECTORS.PLAYER_AVATAR}
- Player names: ${GAME_SELECTORS.PLAYER_NAME}
- Player cards: ${GAME_SELECTORS.PLAYER_CARDS}

#### Step 5: Verify Element Visibility

Check that these elements are visible and not clipped:
- All player names are fully visible (no truncation that hides identity)
- All chip counts are readable
- Community cards area is unobstructed
- Pot display is clearly visible
- Dealer button is visible on correct player

#### Step 6: Responsive Testing

For each viewport in ${GAME_VIEWPORTS.map((v) => v.name).join(", ")}:

1. browser_resize to width x height
2. browser_take_screenshot
3. Check if layout breaks (elements off-screen, overlapping)
4. Check if text is readable
5. Check if interactive elements are tappable (min 44px touch target)

### Issues to Look For

#### Critical Issues (must fail test):
- Player cards completely hiding another player's name
- Elements off-screen that should be visible
- Pot or community cards obscured

#### Major Issues (should fail test):
- More than 30% overlap between player elements
- Text too small to read (< 10px effective size)
- Buttons/interactive elements too small to click

#### Minor Issues (warn but don't fail):
- Slight visual alignment issues
- Suboptimal spacing
- Animation glitches

## Expected Results

### 2-Player Layout
- Players at top (12 o'clock) and bottom (6 o'clock) positions
- Cards should be next to avatars, not overlapping names
- Ample space in center for pot and community cards

### 6-Player Layout
- Players evenly distributed around oval
- No card/name overlaps at standard desktop resolution
- All elements visible without scrolling

### 9-Player Layout (Most Prone to Issues)
- Full ring layout
- THIS IS WHERE OVERLAPS ARE MOST LIKELY
- Pay special attention to players at 3, 4, 5 and 7, 8, 9 positions
- Cards should stack properly next to names

## Report Format

After running all tests, provide a report with:
1. List of all issues found (with severity)
2. Screenshots showing problems
3. Specific element references
4. Suggested fixes if apparent

`;
}

/**
 * Test definitions that can be executed by the AI
 */
export const GAME_TABLE_TESTS = {
  playerOverlapCheck: {
    name: "Player Element Overlap Check",
    description: "Verify no player cards overlap with adjacent player names",
    steps: [
      "Get all player seat elements",
      "For each player, get bounding boxes of: avatar, name, cards",
      "Check each player's cards against all other players' names",
      "Report any overlaps > 10%",
    ],
    severity: "critical" as const,
  },

  allElementsVisible: {
    name: "All Elements Visible",
    description: "Verify all game elements are within viewport and visible",
    steps: [
      "Get viewport dimensions",
      "Get bounding boxes of: pot, community cards, all players",
      "Check each element is within viewport bounds",
      "Check no elements have 0 width/height",
    ],
    severity: "critical" as const,
  },

  textReadability: {
    name: "Text Readability",
    description: "Verify all text elements are readable size",
    steps: [
      "Get all text elements (names, chips, labels)",
      "Check computed font size >= 10px",
      "Check color contrast meets WCAG AA (4.5:1)",
      "Check text is not truncated beyond recognition",
    ],
    severity: "major" as const,
  },

  responsiveLayout: {
    name: "Responsive Layout",
    description: "Verify layout works at different viewport sizes",
    steps: [
      "For each viewport size, resize browser",
      "Take screenshot",
      "Check no elements overflow container",
      "Check no elements stack improperly",
    ],
    severity: "major" as const,
  },

  interactiveElements: {
    name: "Interactive Element Size",
    description: "Verify buttons and clickable areas meet minimum size",
    steps: [
      "Get all button and link elements",
      "Check each has minimum 44x44px touch target",
      "Check elements have visible focus states",
    ],
    severity: "minor" as const,
  },
};

/**
 * Specific overlap scenarios to check
 */
export const OVERLAP_SCENARIOS = {
  cardsOverNames: {
    description: "Player cards overlapping other player names",
    elements: ["player-cards", "player-name"],
    threshold: 10, // percentage
    severity: "critical" as const,
  },
  avatarsOverlapping: {
    description: "Player avatars overlapping each other",
    elements: ["player-avatar", "player-avatar"],
    threshold: 5,
    severity: "critical" as const,
  },
  betsOverPot: {
    description: "Bet displays overlapping pot display",
    elements: ["bet-display", "pot-display"],
    threshold: 20,
    severity: "major" as const,
  },
  cardsOverCommunity: {
    description: "Player cards overlapping community cards",
    elements: ["player-cards", "community-cards"],
    threshold: 5,
    severity: "critical" as const,
  },
};

/**
 * Generate a mock game state for testing
 */
export function generateMockGameState(playerCount: number) {
  const players = [];
  for (let i = 0; i < playerCount; i++) {
    players.push({
      id: `player-${i}`,
      name: `TestPlayer${i + 1}WithLongName`,
      chips: 5000 + Math.floor(Math.random() * 5000),
      bet: i < 3 ? 100 + i * 50 : 0,
      folded: i > playerCount - 2,
      allIn: i === 2,
      holeCards:
        i === 0
          ? [
              { suit: "spades", rank: "A" },
              { suit: "hearts", rank: "K" },
            ]
          : [],
    });
  }

  return {
    tableId: "test-table",
    gameId: "test-game",
    status: "running",
    stage: "flop",
    handNumber: 1,
    pot: 450,
    communityCards: [
      { suit: "diamonds", rank: "Q" },
      { suit: "clubs", rank: "10" },
      { suit: "hearts", rank: "7" },
    ],
    players,
    dealerPosition: 0,
    currentPlayerId: "player-1",
  };
}

/**
 * CLI runner for visual tests
 */
if (require.main === module) {
  console.log(generateAITestInstructions());
  console.log("\n\n---\n\nTest definitions:\n");
  console.log(JSON.stringify(GAME_TABLE_TESTS, null, 2));
}

export { DEFAULT_CONFIG };
