#!/usr/bin/env npx ts-node
/**
 * Visual QA Monster - Main Runner
 * ================================
 *
 * The comprehensive visual testing system that finds 200+ bugs.
 *
 * Usage:
 *   npx ts-node tests/visual/run-monster.ts [command] [options]
 *
 * Commands:
 *   full          Run all tests (30+ minutes)
 *   quick         Run essential tests (5 minutes)
 *   responsive    Run viewport tests only
 *   states        Run state combination tests
 *   overlaps      Run overlap detection tests
 *   flows         Run user flow tests
 *   errors        Run error state tests
 *   generate      Generate AI instructions
 *
 * Options:
 *   --pages=<list>     Comma-separated pages to test
 *   --viewports=<list> Comma-separated viewports to test
 *   --output=<file>    Output file for report
 *   --verbose          Enable verbose logging
 */

import {
  STANDARD_VIEWPORTS,
  STANDARD_PAGES,
  DEFAULT_THRESHOLDS,
  EDGE_CASE_DATA,
  generateAIInstructions,
  formatBugReport,
  Bug,
  Viewport,
  PageConfig,
} from "./orchestrator";

import { generateResponsiveTestInstructions } from "./engines/responsive-checker";
import {
  generatePairwiseCombinations,
  generateStateTestInstructions,
  getHighValueCombinations,
  getEssentialCombinations,
  PLATFORM_STATES,
  GAME_TABLE_STATES,
} from "./engines/state-matrix";

const BASE_URL = "http://localhost:3001";

interface MonsterConfig {
  baseUrl: string;
  pages: PageConfig[];
  viewports: Viewport[];
  runResponsive: boolean;
  runStates: boolean;
  runOverlaps: boolean;
  runFlows: boolean;
  runErrors: boolean;
  runAccessibility: boolean;
  runPerformance: boolean;
  verbose: boolean;
}

const DEFAULT_CONFIG: MonsterConfig = {
  baseUrl: BASE_URL,
  pages: STANDARD_PAGES,
  viewports: STANDARD_VIEWPORTS,
  runResponsive: true,
  runStates: true,
  runOverlaps: true,
  runFlows: true,
  runErrors: true,
  runAccessibility: true,
  runPerformance: true,
  verbose: false,
};

/**
 * Generate complete AI instructions for monster testing
 */
function generateMonsterInstructions(config: MonsterConfig): string {
  const instructions = `
# 🦖 Visual QA Monster - Complete Test Instructions

**Target:** Find 200+ bugs across all UI surfaces
**Estimated Duration:** 30-45 minutes
**Pages:** ${config.pages.length}
**Viewports:** ${config.viewports.length}

---

## Prerequisites

1. Frontend running at ${config.baseUrl}
2. Backend running at http://localhost:3000
3. Browser MCP available
4. Lock browser before starting

---

## Phase 1: Responsive Testing (40% of bugs)

Test every page at every viewport to catch layout issues.

### Viewports (${config.viewports.length} total)

#### Desktop (5)
${config.viewports
  .filter((v) => v.deviceType === "desktop")
  .map((v) => `- ${v.name}: ${v.width}x${v.height}`)
  .join("\n")}

#### Tablet (3)
${config.viewports
  .filter((v) => v.deviceType === "tablet")
  .map((v) => `- ${v.name}: ${v.width}x${v.height}`)
  .join("\n")}

#### Mobile (8)
${config.viewports
  .filter((v) => v.deviceType === "mobile")
  .map((v) => `- ${v.name}: ${v.width}x${v.height}`)
  .join("\n")}

### Pages (${config.pages.length} total)
${config.pages.map((p) => `- ${p.name}: ${p.path}`).join("\n")}

### Test Procedure

For EACH page:
1. Navigate to page
2. For EACH viewport:
   a. Resize browser
   b. Take screenshot
   c. Check for:
      - Horizontal overflow
      - Navigation truncation/breaking
      - Text unreadable
      - Touch targets < 44px (mobile)
      - Critical elements off-screen
      - Layout breaks

### Quick Viewport Test (6 essential)
1. Desktop (1366x768)
2. Laptop (1280x800)
3. Tablet Portrait (768x1024)
4. Mobile Large (428x926)
5. Mobile Standard (375x667)
6. Galaxy Fold (280x653)

---

## Phase 2: State Combination Testing (25% of bugs)

Test different application states to find bugs that only appear
in specific combinations.

### High-Value Combinations (Test First)

${getHighValueCombinations()
  .slice(0, 10)
  .map(
    (c) => `
#### ${c.id}: ${c.description}
\`\`\`
${Object.entries(c.variables)
  .map(([k, v]) => `${k}: ${v}`)
  .join("\n")}
\`\`\`
`,
  )
  .join("")}

### State Variables
${PLATFORM_STATES.map((s) => `- ${s.name}: ${s.values.join(", ")}`).join("\n")}

---

## Phase 3: Overlap Detection (15% of bugs)

Critical for poker tables where player elements can overlap.

### Test Scenarios

1. **2-Player Table (Heads Up)**
   - Cards should not overlap names
   - Clear separation between players

2. **6-Player Table**
   - Even distribution around table
   - Bet chips don't obscure player info

3. **9-Player Table (Full Ring)** ⚠️ MOST BUGS HERE
   - Tightest spacing
   - Cards from positions 3-5 may overlap names of 4-6
   - Watch positions 7-9 (right side)

### Overlap Check Procedure

\`\`\`
1. Navigate to game table with players
2. For each player seat:
   a. browser_get_bounding_box for avatar
   b. browser_get_bounding_box for name plate
   c. browser_get_bounding_box for cards
3. For each pair of elements:
   a. Check if bounding boxes overlap > 10%
   b. If overlap: BUG
\`\`\`

### Critical Overlaps to Check
- Player N's cards vs Player N+1's name
- All-in badge vs timer ring
- Dealer button vs avatar
- Action badge vs cards
- Bet chips vs pot display

---

## Phase 4: Error State Testing (10% of bugs)

Verify graceful error handling.

### Error Scenarios to Test

| Scenario | URL/Action | Expected UI |
|----------|------------|-------------|
| Game 404 | /game/fake-id | "Game not found" message |
| Tournament 404 | /tournament/fake-id | "Tournament not found" |
| Bot 404 | /bot/fake-id | "Bot not found" |
| API Error | (backend down) | Error message + retry |
| Offline | (disable network) | Offline indicator |
| Auth Expired | (clear token) | Redirect to login |

### Error Check Procedure

1. Navigate to error URL
2. Verify:
   - Error message is user-friendly
   - No blank screen
   - Recovery option available
   - No console errors visible to user

---

## Phase 5: User Flow Testing (10% of bugs)

Test complete user journeys.

### Flow 1: New User Registration
1. Home page
2. Click "Create Account"
3. Fill registration form
4. Submit
5. Verify confirmation

### Flow 2: Watch a Game
1. Tables page
2. Click "Watch table"
3. Game view loads
4. Back to tables

### Flow 3: Browse Tournaments
1. Tournaments page
2. Filter by status
3. Click tournament
4. View details

---

## Bug Classification Guide

### Critical (Must fix immediately)
- Page won't load
- Data mismatch (UI shows wrong info)
- Navigation completely broken
- Security issue (XSS, auth bypass)

### High (Fix this sprint)
- Major functionality broken
- Significant visual regression
- Accessibility blocker
- Performance major degradation

### Medium (Fix soon)
- Minor functionality issue
- Responsive layout problem
- Accessibility issue (non-blocker)
- UI inconsistency

### Low (Backlog)
- Cosmetic issue
- Minor text truncation
- Edge case handling
- Polish items

---

## Output Format

For each bug found:

\`\`\`markdown
### BUG-{TYPE}-{NUMBER}: {Title}

**Type:** responsive | overlap | state | flow | error | accessibility
**Severity:** critical | high | medium | low
**Page:** {page path}
**Viewport:** {viewport name} ({width}x{height})

**Description:**
{What happened}

**Expected:**
{What should happen}

**Actual:**
{What actually happened}

**Screenshot:** {filename}

**Repro Steps:**
1. Navigate to ...
2. Resize to ...
3. Observe ...
\`\`\`

---

## Final Report Template

\`\`\`markdown
# Visual QA Monster Report

**Date:** {date}
**Duration:** {duration}
**Tester:** AI Agent

## Summary

| Category | Bugs |
|----------|------|
| Critical | X |
| High | X |
| Medium | X |
| Low | X |
| **Total** | **X** |

## Bugs by Type

| Type | Count |
|------|-------|
| Responsive | X |
| Overlap | X |
| State | X |
| Flow | X |
| Error | X |
| Accessibility | X |

## Top Issues

1. ...
2. ...
3. ...

## Recommendations

1. ...
2. ...
3. ...
\`\`\`

---

## Quick Start (5-Minute Test)

If time is limited, run these essential tests:

1. **Home page** at desktop + mobile
2. **Tables page** at desktop + mobile
3. **Game table** with 9 players at desktop + mobile
4. **404 page** test
5. **Offline** test

Expected: 10-20 bugs from quick test
`;

  return instructions;
}

/**
 * Generate quick test instructions (5 minutes)
 */
function generateQuickTestInstructions(): string {
  return `
# Quick Visual QA Test (5 Minutes)

## Focus Areas
Run these essential tests to catch the most bugs quickly.

### Test 1: Core Pages at Desktop (1366x768)
\`\`\`
browser_resize width: 1366, height: 768
browser_navigate to: http://localhost:3001/
browser_take_screenshot filename: quick-home-desktop.png
browser_navigate to: http://localhost:3001/tables
browser_take_screenshot filename: quick-tables-desktop.png
browser_navigate to: http://localhost:3001/tournaments
browser_take_screenshot filename: quick-tournaments-desktop.png
\`\`\`

### Test 2: Core Pages at Mobile (375x667)
\`\`\`
browser_resize width: 375, height: 667
browser_navigate to: http://localhost:3001/
browser_take_screenshot filename: quick-home-mobile.png
browser_navigate to: http://localhost:3001/tables
browser_take_screenshot filename: quick-tables-mobile.png
browser_navigate to: http://localhost:3001/tournaments
browser_take_screenshot filename: quick-tournaments-mobile.png
\`\`\`

### Test 3: Error Handling
\`\`\`
browser_navigate to: http://localhost:3001/game/fake-id-12345
browser_take_screenshot filename: quick-404-game.png
Verify error message appears
\`\`\`

### Test 4: Galaxy Fold (Stress Test)
\`\`\`
browser_resize width: 280, height: 653
browser_navigate to: http://localhost:3001/tables
browser_take_screenshot filename: quick-tables-fold.png
Check for severe layout breaks
\`\`\`

## Expected Bug Yield: 10-20 bugs
`;
}

// CLI handling
function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "generate";

  switch (command) {
    case "full":
      console.log(generateMonsterInstructions(DEFAULT_CONFIG));
      break;

    case "quick":
      console.log(generateQuickTestInstructions());
      break;

    case "responsive":
      console.log(
        generateResponsiveTestInstructions(
          BASE_URL,
          STANDARD_PAGES.map((p) => p.path),
          STANDARD_VIEWPORTS,
        ),
      );
      break;

    case "states":
      const combos = generatePairwiseCombinations(PLATFORM_STATES);
      console.log(generateStateTestInstructions(combos));
      break;

    case "overlaps":
      console.log(`
# Overlap Detection Tests

## Game Table Overlap Check

For a game table with players, check these element pairs:

### Per-Player Elements
1. Avatar (56x56px circle)
2. Name plate (95px min width)
3. Hole cards (2 mini cards)
4. Chip count display
5. Timer ring (when active)
6. Dealer button (if dealer)
7. Action badge (recent action)
8. All-in badge (if all-in)

### Overlap Scenarios

#### 9-Player Table (Most Critical)
At positions 3, 4, 5 (left side) and 7, 8, 9 (right side),
adjacent players' elements are closest.

Check:
- Position 3's cards vs Position 4's name
- Position 4's cards vs Position 5's name
- Position 7's cards vs Position 8's name
- Position 8's cards vs Position 9's name

#### 6-Player Table
Check positions 2-3 and 5-6 for potential overlaps.

#### 2-Player (Heads Up)
Usually safe, but check with very long names.

### Test Procedure
\`\`\`
1. Navigate to active game table
2. browser_snapshot to get element structure
3. For each player seat:
   browser_get_bounding_box element: "player avatar" ref: {ref}
   browser_get_bounding_box element: "player name" ref: {ref}
   browser_get_bounding_box element: "player cards" ref: {ref}
4. Calculate overlaps using bounding box intersection
5. Report any overlap > 10% of smaller element
\`\`\`
`);
      break;

    case "flows":
      console.log(`
# User Flow Tests

## Flow 1: New User Journey
1. Land on home page
2. Click "Create Account"
3. Verify registration form loads
4. Fill form with test data
5. Submit form
6. Verify success/confirmation

## Flow 2: Spectate a Game
1. Go to /tables
2. Click "Watch table" on any active table
3. Verify game view loads
4. Verify players visible
5. Click "Back to tables"
6. Verify navigation works

## Flow 3: Browse Tournaments
1. Go to /tournaments
2. Click "Active" filter
3. Click "Running" filter
4. Click on a tournament card
5. Verify tournament details load

## Flow 4: View Leaderboard
1. Go to /leaderboard
2. Click "This month" tab
3. Click "This week" tab
4. Verify data changes

## Flow 5: Bot Directory
1. Go to /bots
2. Wait for bots to load
3. Click on a bot card
4. Verify bot profile loads
`);
      break;

    case "errors":
      console.log(`
# Error State Tests

## 404 Errors
\`\`\`
browser_navigate to: http://localhost:3001/game/fake-id-12345
Expect: Error message, not blank screen
Expect: Back button or home link

browser_navigate to: http://localhost:3001/tournament/fake-id
Expect: Error message

browser_navigate to: http://localhost:3001/bot/fake-id  
Expect: Error message

browser_navigate to: http://localhost:3001/nonexistent-page
Expect: 404 page
\`\`\`

## API Errors
Test pages when backend returns errors:
- 500 Server Error
- 401 Unauthorized
- 403 Forbidden
- 429 Rate Limited

## Network Errors
Use browser DevTools to simulate:
- Offline mode
- Slow 3G
- Request timeout

## Form Validation
Submit forms with:
- Empty fields
- Invalid email format
- Short password
- Mismatched passwords
`);
      break;

    case "generate":
    default:
      console.log(generateMonsterInstructions(DEFAULT_CONFIG));
      break;
  }
}

main();
