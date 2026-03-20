# Bot Examples

A collection of example bots from simple to advanced. Each file is self-contained and runnable.

## Quick Start

```bash
# Run any example
node 01-check-fold.js

# Test with playground
node ../playground/test-bot.js http://localhost:3001/action --all
```

## Examples Overview

### Beginner (4-15 lines)
| # | Name | Strategy | Lines |
|---|------|----------|-------|
| 01 | Check/Fold | Never risks chips | 4 |
| 02 | Calling Station | Calls everything | 4 |
| 03 | Tight-Passive | Premium hands only | 15 |

### Intermediate (30-45 lines)
| # | Name | Strategy | Lines |
|---|------|----------|-------|
| 04 | Tight-Aggressive | Classic TAG | 40 |
| 05 | Pot Odds Calculator | Math-based | 30 |
| 06 | Position-Aware | Position exploits | 45 |

### Advanced (100+ lines)
| # | Name | Strategy | Features |
|---|------|----------|----------|
| 07 | Data-Driven | SQLite persistence | Opponent tracking, player types, session stats |
| 08 | Monte Carlo | Hand equity simulation | 1000+ simulations per decision |
| 09 | Adaptive Exploiter | Real-time adaptation | Pattern detection, exploit strategies |
| 10 | Tournament ICM | Bubble awareness | ICM calculations, push/fold charts |

## Learning Path

### Week 1: Fundamentals
1. **01-check-fold.js** — Understand the basic structure
2. **02-calling-station.js** — See how simple bots work
3. **03-tight-passive.js** — Learn hand selection

### Week 2: Core Strategy
4. **04-tight-aggressive.js** — The most important strategy
5. **05-pot-odds-calculator.js** — Add mathematical rigor
6. **06-position-aware.js** — Exploit position

### Week 3: Advanced Concepts
7. **07-data-driven.js** — Persist data, track opponents
8. **08-monte-carlo.js** — Calculate precise equity

### Week 4: Expert Level
9. **09-adaptive-exploiter.js** — Real-time adaptation
10. **10-tournament-icm.js** — Tournament-specific play

## Key Concepts

### Hand Strength (Pre-flop)
```javascript
// Use the SDK's built-in calculator
const strength = Strategy.preFlopStrength(you.holeCards, you.position);
// Returns 0-1: 0.95+ = premium, 0.65+ = strong, 0.50+ = playable
```

### Hand Strength (Post-flop)
```javascript
// Uses your bestHand object
const strength = Strategy.postFlopStrength(you.bestHand, opponentCount);
// Returns 0-1: 0.70+ = strong, 0.50+ = medium
```

### Pot Odds
```javascript
// How much of the pot you need to invest
const potOdds = action.toCall / (table.pot + action.toCall);
// If your equity > potOdds, calling is profitable
```

### Position
```javascript
// Late position = act last = information advantage
you.inPosition()  // true for BTN, CO, BTN/SB
```

## Building Your Own

Start with this template:

```javascript
const { createBot, Action, Strategy } = require('../sdk/javascript');

createBot({
  port: 3001,
  name: 'MyBot',
  decide: (state) => {
    const { you, action, table } = state;
    
    // Your strategy here
    
    return Action.check(); // or fold, call, raise(amount)
  }
});
```

## Tips for Winning

1. **Fold more pre-flop** — Most players play too many hands
2. **Be aggressive with strong hands** — Betting > calling
3. **Use position** — Play more hands on the button
4. **Watch stack sizes** — Short stacks should push/fold
5. **Don't bluff too much** — Bots call a lot

## Advanced Bot Features

### Data Persistence (07-data-driven.js)
```javascript
// SQLite tables created:
// - opponents: VPIP, PFR, 3-bet%, c-bet%, fold to c-bet
// - hand_history: Every action with context
// - session_stats: Per-session performance

// Player types detected:
// - LAG (Loose-Aggressive)
// - LP (Loose-Passive)
// - TAG (Tight-Aggressive)
// - TP (Tight-Passive)
```

### Monte Carlo Simulation (08-monte-carlo.js)
```javascript
// Calculates exact equity by simulating outcomes
const equity = mc.calculateEquity(holeCards, board, numOpponents);
// Returns: 0.723 (72.3% chance to win)

// Then calculates EV:
const ev = (equity * pot) - ((1 - equity) * toCall);
// Positive EV = profitable call
```

### Pattern Detection (09-adaptive-exploiter.js)
```javascript
// Detected patterns and exploits:
// - OVER_FOLDER: bluff_more
// - CALLING_STATION: value_bet_thin
// - MANIAC: trap_and_call
// - NIT: steal_blinds
// - SMALL_BETTER: raise_light
// - POLARIZED: fold_medium_call_strong
```

### ICM Calculations (10-tournament-icm.js)
```javascript
// Bubble Factor = Risk / Reward
// > 1 means losing is worse than winning is good
// On bubble with short stack: BF might be 3-5x

// Adjusts push ranges:
// Normal: Push top 30% from button
// BF=2.0: Push top 20% from button
// BF=3.0: Push top 15% from button
```

## Testing Your Bot

```bash
# Run the test suite
node ../playground/test-bot.js http://localhost:3001/action --all

# Run specific scenario
node ../playground/test-bot.js http://localhost:3001/action --scenario preflop_premium
```

## Dependencies

| Bot | Dependencies | Install |
|-----|-------------|---------|
| 01-06 | None | — |
| 07 | better-sqlite3 | `npm install better-sqlite3` |
| 08-10 | None | — |
