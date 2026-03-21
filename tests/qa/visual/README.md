# Visual & AI-Powered Testing Framework

A comprehensive testing framework that enables AI agents (like Cursor/Claude) to act as QA testers, finding visual bugs, layout issues, and UI problems automatically.

## Overview

This framework provides:

1. **Visual Regression Testing** - Detect CSS/layout bugs like element overlaps
2. **DOM Overlap Detection** - Programmatic detection of overlapping elements
3. **WebSocket Real-time Tests** - Verify live updates work correctly
4. **Responsive Viewport Tests** - Test different screen sizes
5. **Error State Tests** - Verify error handling UI
6. **Performance/Load Tests** - Backend stress testing
7. **Network Resilience Tests** - Bot timeouts and disconnections

## Quick Start

### For AI Agents (Cursor/Claude)

```bash
# Generate AI instructions for any test suite
npx ts-node tests/visual/run-visual-tests.ts ai "Game Table Visual"
npx ts-node tests/visual/run-visual-tests.ts ai "Responsive Viewport"
npx ts-node tests/visual/run-visual-tests.ts ai "Error States"

# List available test suites
npx ts-node tests/visual/run-visual-tests.ts list

# Get quick start guide
npx ts-node tests/visual/run-visual-tests.ts quickstart
```

### Using NPM Scripts

```bash
# Run visual tests
npm run test:visual -- list
npm run test:visual -- ai "Game Table Visual"

# Run load tests
npm run test:load
npm run test:load:ws
npm run test:load:games

# Run Storybook for component testing
cd frontend && npm run storybook
```

## Test Suites

### 1. Game Table Visual Tests
**File:** `game-table-visual.test.ts`

Tests the poker table UI for visual issues:
- Player card/name overlaps (the bug you mentioned!)
- Element visibility at various player counts (2, 6, 9 players)
- Layout integrity at different viewports

**AI Instructions:** Run tests using browser MCP tools:
```
1. browser_navigate to game table
2. browser_snapshot to get DOM structure
3. browser_get_bounding_box for each element
4. Check for overlaps using provided algorithms
5. browser_take_screenshot for visual evidence
```

### 2. DOM Overlap Detector
**File:** `dom-overlap-detector.ts`

Programmatic detection of element overlaps:
```typescript
import { detectCardNameOverlaps, generateOverlapReport } from './dom-overlap-detector';

// Get bounding boxes from browser_get_bounding_box
const cardNameOverlaps = detectCardNameOverlaps(playerCards, playerNames, 10);
console.log(generateOverlapReport(cardNameOverlaps, ...));
```

### 3. WebSocket Real-time Tests
**File:** `websocket-realtime.test.ts`

Tests that UI updates correctly when:
- Player joins table
- Player bets/calls/folds
- Community cards dealt
- Turn changes
- Winner declared

### 4. Responsive Viewport Tests
**File:** `responsive-viewport.test.ts`

Tests layout at:
- Desktop: 1920x1080, 1366x768, 1280x800
- Tablet: 1024x768, 768x1024
- Mobile: 428x926, 375x667, 320x568

### 5. Error State Tests
**File:** `error-states.test.ts`

Tests error handling:
- 404/500 API errors
- Network offline
- WebSocket disconnection
- Form validation errors
- Session expiration

### 6. Performance/Load Tests
**File:** `../performance/load-test.ts`

Backend stress testing:
- Concurrent API requests
- WebSocket connection load
- Concurrent game simulation

### 7. Network Resilience Tests
**File:** `../performance/network-resilience.test.ts`

Tests system behavior under:
- Bot timeouts
- Slow responses
- Disconnections
- Invalid responses

## Storybook Component Tests

Visual component tests using Storybook:

```bash
cd frontend
npm run storybook
```

### Available Stories

- `Game/Table` - Poker table at various player counts
- `Game/PlayerSeat` - Individual player seat states

Key test cases:
- 9 players with long names (overlap stress test)
- All-in situations
- Mixed player states
- Timer nearly expired

## How AI Agents Use This

### 1. Read Test Instructions
```
Read the test instructions file to understand what to test:
npx ts-node tests/visual/run-visual-tests.ts ai "Game Table Visual"
```

### 2. Execute Tests Using Browser MCP

The AI uses browser MCP tools:
- `browser_navigate` - Navigate to pages
- `browser_snapshot` - Get DOM accessibility tree
- `browser_take_screenshot` - Capture visuals
- `browser_get_bounding_box` - Get element positions
- `browser_resize` - Test different viewports

### 3. Analyze and Report

AI generates reports in markdown:
```markdown
## Visual Test Report

### Critical Issues
- Player 3's cards overlap Player 4's name by 25%

### Screenshots
- overlap-issue.png: Shows card/name overlap

### Recommendations
- Increase spacing between player seats
- Reduce card size at 9-player tables
```

## File Structure

```
tests/
├── visual/
│   ├── README.md                    # This file
│   ├── run-visual-tests.ts          # Main runner
│   ├── visual-test-runner.ts        # Core framework
│   ├── dom-overlap-detector.ts      # Overlap detection
│   ├── game-table-visual.test.ts    # Game table tests
│   ├── websocket-realtime.test.ts   # WebSocket tests
│   ├── responsive-viewport.test.ts  # Viewport tests
│   └── error-states.test.ts         # Error state tests
├── performance/
│   ├── load-test.ts                 # Load testing
│   └── network-resilience.test.ts   # Resilience tests
└── simulations/                     # Backend simulations
    └── ...

frontend/src/components/game/
├── Table.stories.tsx                # Table Storybook stories
└── PlayerSeat.stories.tsx           # PlayerSeat stories
```

## Adding New Tests

### Adding a Visual Test

1. Create test file in `tests/visual/`
2. Export `generateAITestInstructions()` function
3. Add to `TEST_SUITES` in `run-visual-tests.ts`

### Adding a Storybook Story

1. Create `*.stories.tsx` next to component
2. Add multiple states to test
3. Document known issues in story descriptions

## Integration with CI

```yaml
# Example GitHub Actions workflow
- name: Run Visual Tests
  run: |
    npm run test:visual -- all > visual-test-instructions.md
    
- name: Run Load Tests
  run: npm run test:load

- name: Upload Screenshots
  uses: actions/upload-artifact@v3
  with:
    name: visual-test-screenshots
    path: screenshots/
```

## Known Issues Being Tested

Based on previous simulations, these issues should be caught:

1. **Card/Name Overlap** - At 9-player tables, cards may overlap adjacent player names
2. **Chip Stack Overlap** - Bet displays may overlap pot display
3. **Responsive Breakpoints** - Layout may break at tablet sizes
4. **Long Name Truncation** - Very long names may break layout
5. **All-In Badge Position** - May conflict with timer or dealer button

## Troubleshooting

### Browser MCP Not Working
Ensure the browser MCP server is running and tools are available.

### Storybook Won't Start
```bash
cd frontend
npm install
npm run storybook
```

### Load Tests Timeout
Increase timeout or reduce concurrent connections in config.
