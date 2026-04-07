# Bot Decision Engine — Reference Guide

This document is the single source of truth for everything related to **how bots decide what action to take**. It covers the code, the types, the configuration, and every test layer that validates correctness.

---

## Table of Contents

1. [Overview](#overview)
2. [Evaluation Order](#evaluation-order)
3. [Module Map](#module-map)
4. [Domain Types](#domain-types)
5. [GameContext Field Reference](#gamecontext-field-reference)
6. [Strategy Tiers](#strategy-tiers)
7. [Evaluators In Detail](#evaluators-in-detail)
8. [Hard Invariants (Must Never Violate)](#hard-invariants-must-never-violate)
9. [Test Coverage Map](#test-coverage-map)
10. [How to Add New Tests](#how-to-add-new-tests)

---

## Overview

The decision engine is a **pure, stateless function** that takes a `BotPayload` (a snapshot of one action point in a live game) and returns a `StrategyEvaluation` containing the chosen action, an explanation, and the source of the decision.

It does **not** interact with the database, network, or game state — all inputs are provided by `LiveGameManagerService` which builds the payload from the live game snapshot.

```
BotPayload  →  evaluateHydrated(hydratedStrategy, payload)  →  StrategyEvaluation
```

Entry point for game play: `src/services/game/live-game-manager.service.ts` → `getPlayerActionSafe()`
Entry point for Scenario Lab: `src/modules/bots/bots.service.ts` → `evaluateScenario()`
Core engine: `src/modules/bot-strategy/strategy-engine.service.ts` → `evaluateHydrated()`

---

## Evaluation Order

For every decision, the engine tries these layers in order, returning the **first match**:

```
1. Position Override  (Pro tier only)
   └── If the bot has a position-specific config for the current seat:
       a. Position Range Chart  → preflop O(1) LUT lookup
       b. Position Rules        → priority-ordered rule scan
       c. Position Personality  → weight-based fallback

2. Global Range Chart  (Strategy + Pro tier)
   └── Preflop only: 169-cell Uint8Array LUT keyed by hand notation

3. Global Rules  (Strategy + Pro tier)
   └── Priority-ordered scan; first rule whose conditions all match wins

4. Personality Evaluator  (ALL tiers — final fallback)
   └── Weight-based action distribution using sigmoid-mapped sliders
       Pre-flop: tightness × positionMultiplier → play/fold threshold
       Post-flop: hand quality × equity gate → fold/call/raise weights
```

If none of the above produces a clear signal (e.g., range chart has null for this hand), the personality evaluator always produces an action.

---

## Module Map

### Strategy Engine

| File | Purpose |
|------|---------|
| `src/modules/bot-strategy/strategy-engine.service.ts` | Main entry point. `hydrateStrategy()`, `evaluateHydrated()`, `buildGameContext()`. 256-entry LRU hydration cache. |
| `src/modules/bot-strategy/strategy-tunables.ts` | All numeric constants (weights, thresholds, multipliers, EV params). Change here, not in evaluators. |
| `src/modules/bot-strategy/presets/personality-presets.ts` | 8 named personality archetypes (Shark, Rock, Maniac, etc.). |

### Evaluators

| File | Purpose |
|------|---------|
| `src/modules/bot-strategy/evaluators/equity.service.ts` | Win probability (heuristic Rule of 2/4 + Monte Carlo). EV math. `isBoardPlays()` guard. |
| `src/modules/bot-strategy/evaluators/hand-analyzer.ts` | Classify hole cards and made hands (premium → strong → playable → weak). |
| `src/modules/bot-strategy/evaluators/board-analyzer.ts` | Board texture (dry / wet / monotone / paired). |
| `src/modules/bot-strategy/evaluators/range-chart.evaluator.ts` | Preflop 13×13 grid → `Uint8Array(169)` LUT. `holeCardsToIndex()`. |
| `src/modules/bot-strategy/evaluators/rule.evaluator.ts` | Postflop rules with recursive AND/OR condition trees. |
| `src/modules/bot-strategy/evaluators/personality.evaluator.ts` | Sigmoid-mapped weight-based action selection. Position multipliers. Equity gate. |

### Domain Types & Validation

| File | Purpose |
|------|---------|
| `src/domain/bot-strategy/strategy.types.ts` | All core types: `BotStrategy`, `HydratedStrategy`, `GameContext`, `Rule`, `Condition`, `ConditionGroup`, `CONDITION_FIELDS` (36 fields). |
| `src/domain/bot-strategy/strategy.validator.ts` | Validates `BotStrategy` JSON on save. Tier constraints, rule structure, condition fields. |
| `src/domain/bot-strategy/strategy-conflict.detector.ts` | Detects logically contradictory rule pairs. Advisory, used by UI. |
| `src/domain/handEvaluator.ts` | `bestHand(holeCards, communityCards)` — 5-card best hand from 7 cards. Used by `isBoardPlays()`. |

---

## Domain Types

### BotStrategy (persisted in `bots.strategy` JSONB)

```typescript
interface BotStrategy {
  version: 1;
  tier: "quick" | "strategy" | "pro";
  personality: Personality;             // always required
  rules?: StreetRules;                  // strategy + pro only
  rangeChart?: RangeChart;              // strategy + pro only
  positionOverrides?: Record<Position, PositionOverride>;  // pro only
}

interface Personality {
  aggression: number;      // 0-100 | how often to raise vs call
  bluffFrequency: number;  // 0-100 | raise weight on weak/draw hands
  riskTolerance: number;   // 0-100 | willingness to call large bets
  tightness: number;       // 0-100 | preflop hand selection threshold
}
```

### HydratedStrategy (compiled, cached in memory)

```typescript
interface HydratedStrategy {
  base: HydratedPosition;                          // global defaults
  positions: Record<Position, HydratedPosition>;   // per-position overrides
  strategyKey: string;                             // fingerprint for eval cache
}

interface HydratedPosition {
  personality: Readonly<Personality>;
  rules: Rule[][];         // pre-sorted by priority, indexed by street
  rangeChart: { lut: Uint8Array } | null;   // Uint8Array(169), O(1) lookup
}
```

### BotPayload (input to evaluateHydrated)

```typescript
interface BotPayload {
  gameId: string;
  handNumber: number;
  decisionSeed: string;   // SHA-256 hex for PRNG reproducibility
  stage: "preflop" | "flop" | "turn" | "river";
  you: {
    name: string;
    chips: number;
    holeCards: string[];  // e.g. ["As", "Kh"]
    bet: number;
    position: string;
    bestHand?: { name: string };  // pre-computed for postflop accuracy
  };
  action: {
    canCheck: boolean;
    toCall: number;
    minRaise: number;
    maxRaise: number;
  };
  table: {
    pot: number;
    currentBet: number;
    communityCards: string[];
    smallBlind: number;
    bigBlind: number;
    ante: number;
  };
  players: Player[];   // all other players (chips, bet, folded, allIn, position)
}
```

### StrategyEvaluation (output)

```typescript
interface StrategyEvaluation {
  action: StrategyAction;    // { type: "fold"|"check"|"call"|"raise"|"all_in", amount?: number }
  source: "position_override" | "range_chart" | "rule" | "personality";
  explanation: string;       // human-readable, shown in Scenario Lab
  handNotation?: string;     // set when range chart matched (e.g. "AKs")
  ruleId?: string;           // set when a rule matched
}
```

---

## GameContext Field Reference

`buildGameContext(payload)` computes these 36 fields for rule condition evaluation:

### Hand Fields
| Field | Type | Tier | Description |
|-------|------|------|-------------|
| `handStrength` | enum | quick | "high_card" → "royal_flush" |
| `pairType` | enum | quick | "none" / "top" / "middle" / "bottom" / "over" |
| `hasFlushDraw` | boolean | quick | 4 suited cards |
| `hasStraightDraw` | boolean | quick | OESD or gutshot |
| `holeCardRank` | enum | quick | "premium" / "strong" / "playable" / "weak" |

### Board Fields
| Field | Type | Tier | Description |
|-------|------|------|-------------|
| `communityCardCount` | number | quick | 0 / 3 / 4 / 5 |
| `boardTexture` | enum | quick | "dry" / "wet" / "monotone" / "paired" |

### Opponent Fields
| Field | Type | Tier | Description |
|-------|------|------|-------------|
| `facingBet` | boolean | quick | toCall > 0 |
| `facingRaise` | boolean | quick | toCall > currentBet |
| `facingAllIn` | boolean | quick | opponent bet all chips |
| `activePlayerCount` | number | quick | players not folded |
| `playersToAct` | number | quick | players left to act this street |

### Position Fields
| Field | Type | Tier | Description |
|-------|------|------|-------------|
| `myPosition` | enum | quick | "BTN" / "SB" / "BB" / "UTG" / etc. |
| `isInPosition` | boolean | quick | acting after most opponents |

### Stack Fields
| Field | Type | Tier | Description |
|-------|------|------|-------------|
| `myStackBB` | number | strategy | stack in big blinds |
| `effectiveStackBB` | number | strategy | min(hero, shortest opponent) in BBs |

### Pot Fields
| Field | Type | Tier | Description |
|-------|------|------|-------------|
| `potSizeBB` | number | strategy | pot in big blinds |
| `potOdds` | number | strategy | toCall / (pot + toCall) ratio |
| `equity` | number | **pro** | estimated win probability 0-1 |

### Action Fields
| Field | Type | Tier | Description |
|-------|------|------|-------------|
| `canCheck` | boolean | quick | toCall = 0 |
| `toCall` | number | quick | chips to call |
| `minRaise` | number | quick | minimum raise amount |
| `maxRaise` | number | quick | maximum raise (hero chips) |
| `street` | enum | quick | "preflop" / "flop" / "turn" / "river" |
| `bigBlind` | number | quick | table big blind size |

---

## Strategy Tiers

### Quick Tier
- Only personality sliders (aggression, bluffFrequency, riskTolerance, tightness)
- Personality evaluator handles everything
- Position multipliers applied automatically (BTN = looser, UTG = tighter)

### Strategy Tier
- Adds `rules` (per-street condition → action rules)
- Adds `rangeChart` (preflop 13×13 hand grid)
- Rules evaluated before personality
- Range chart evaluated before rules (preflop only)

### Pro Tier
- Adds `positionOverrides` — per-position personality + rules + rangeChart
- Position override is evaluated first; if the current position has an override, that override's range chart / rules / personality are used exclusively for that position
- `equity` condition field available (requires `buildGameContext` to compute equity)

---

## Evaluators In Detail

### Equity Service (`equity.service.ts`)

**`estimateEquityHeuristic(holeCards, communityCards, opponents)`**
- Preflop: lookup table based on hole card rank (AA=84%, 72o=32%, etc.)
- Postflop: Rule of 2/4 applied to outs count; scaled by opponent count via multi-way discount
- Multi-way discount: `equity^(base + scale * opponents/8)` — configurable in `strategy-tunables.ts`

**`isBoardPlays(holeCards, communityCards)`** _(exported)_
- Returns `true` if neither hole card appears in the 5-card best hand
- Uses `bestHand()` from `handEvaluator.ts`
- Only meaningful at river (`communityCards.length === 5`)
- When true: equity = `0.12^exponent` ≈ 0.21 (can only split or lose)

**`estimatePostflopEquity()`** — internal, called by `estimateEquityHeuristic`
- Checks `isBoardPlays` first; returns lowered equity if true
- Falls back to `inferHandStrength` classification

### Personality Evaluator (`personality.evaluator.ts`)

**Weight-based action distribution:**
1. Start from base weights `{ fold, call, raise }` per hand category (premium/strong/playable/weak/draw)
2. Apply sigmoid-mapped slider modifiers (S-curve with k=6, centered at 50)
3. Aggression: shifts call→raise weight, gated by `equity >= 0.4`
4. Bluff frequency: adds raise weight for weak/draw hands (taken from fold weight)
5. Risk tolerance: reduces fold weight when facing bets
6. Tightness: for preflop, multiplies play threshold by `positionMultiplier[position]`
7. Normalize weights to sum=1.0
8. Roll seeded PRNG against cumulative weights

**Position multipliers** (`strategy-tunables.ts`):
```
BTN: 0.50  (loosest — plays 2× wider range)
CO:  0.65
HJ:  0.75
MP:  0.85
UTG+1: 0.95
UTG: 1.00  (tightest — reference)
SB:  0.90
BB:  0.90
```

### Rule Evaluator (`rule.evaluator.ts`)

- `evaluatePreSortedRules(rules, context)` — O(n) scan, returns first matching rule
- Rules pre-sorted by priority (ascending) during hydration
- Each rule's `conditions: ConditionNode[]` evaluated as AND by default
- `ConditionGroup { operator: "AND"|"OR", rules: ConditionNode[] }` enables nesting
- Recursion depth > 10 returns `false` (safety guard)

### Hard Guard (in `strategy-engine.service.ts` `evaluateHydrated`)

> **Implementation note:** The guard counts active players from `payload.players` directly.
> `payload.players` **must include the hero** (the decision-making bot) — this matches how
> the live game builds `BotPayload`. If only opponents are passed, a 3-player game looks
> like heads-up and the guard incorrectly allows raises. This invariant is enforced by the
> regression test `"board-plays guard fires with exactly 3 entries in players"`.


Applied **after** all evaluation, before returning:

```
IF (action is raise or all_in)
   AND (5 community cards on board)
   AND (isBoardPlays(holeCards, communityCards))
   AND (NOT heads-up: activePlayers > 2)
   AND (NOT free bet: canCheck = false)
THEN override action to fold
```

This is the final safety net — fires regardless of any configured rules or overrides.

---

## Hard Invariants (Must Never Violate)

These are engine-level guarantees that must hold for **any** strategy, tier, or configuration:

| # | Invariant | Why |
|---|-----------|-----|
| 1 | **Never fold when toCall=0** (canCheck) | Folding for free is an illegal poker action |
| 2 | **Raise amount ≥ minRaise** | Violates table rules; game will reject the action |
| 3 | **Never fold when all-in** (chips=0) | Nothing left to surrender; no decision to make |
| 4 | **Never raise with board-plays hand in multi-player pot** (3+ active, facing bet) | Raising when you can only tie or lose is irrational and user-visible |

Invariants 1-3 are **hard failures** (`illegal_move`) in the bot auditor — they cause exit code 1 and must be fixed before deployment. Invariant 4 is enforced by the hard guard in `evaluateHydrated`.

---

## Test Coverage Map

### Unit Tests (`tests/unit/bot-strategy/`)

| File | What it covers | Tests |
|------|---------------|-------|
| `strategy-engine.spec.ts` | `buildGameContext`, `evaluateStrategy`, all tiers, all presets | ~30 |
| `equity.service.spec.ts` | Heuristic equity, outs, Monte Carlo, EV math, `isBoardPlays`, board-plays equity correction | 39 |
| `hand-analyzer.spec.ts` | `parseCardString`, hand classification, hand strength | ~20 |
| `range-chart-evaluator.spec.ts` | LUT compilation, O(1) lookup, null=fold default, action sizing | ~15 |
| `strategy-engine-hydration.spec.ts` | Hydration cache (LRU), pre-sorted rules, position override merge, all `evaluateHydrated` paths, pro-tier river guards | 22 |
| `strategy-engine-null-override.spec.ts` | Position override with null range chart inherits from global | ~5 |
| `strategy-validator.spec.ts` | Structure validation, tier constraints, condition field types, AND/OR nesting | 40+ |
| `strategy-types.spec.ts` | `generateAllHandNotations`, constants, `CONDITION_FIELDS` integrity | ~15 |
| `strategy-tunables.spec.ts` | Numeric ranges, position multiplier ordering | ~8 |

**Run:** `npx vitest run tests/unit/bot-strategy/`

### Bot Auditor (`src/testing-utilities/bot-auditor.ts`)

Injects synthetic `BotPayload` directly into the engine; asserts logical soundness across 11 scenarios × 10 bots (8 quick-tier presets + 2 pro-tier configs).

| # | Scenario | Category | Asserts |
|---|----------|----------|---------|
| 1 | `neverFoldOnCheck` | illegal_move | toCall=0 → action ≠ fold |
| 2 | `minRaiseCompliance` | illegal_move | raise.amount ≥ minRaise |
| 3 | `neverFoldAllIn` | illegal_move | chips=0 → action ≠ fold |
| 4 | `neverCallZeroEquity` | strategy_sanity | equity=24.7% vs potOdds=70% → action = fold |
| 5 | `strongHandValidation` | strategy_sanity | Full House river, small bet → action ≠ fold |
| 6 | `potOddsAwareness` | strategy_sanity | Nut flush draw, good pot odds → action ≠ fold |
| 7 | `bluffFrequencyBound` | strategy_sanity | Bluff rate not exceeding personality config |
| 8 | `boardPlaysNeverRaise` | strategy_sanity | 8s6s on KsAh9d9cAc, 3 players → action ≠ raise |
| 9 | `pairedBoardWeakKicker` | strategy_sanity | 2s3d on AAKQJ river, 3 players → action ≠ raise |
| 10 | `tripsBoardFoldLargeBet` | strategy_sanity | 3h4d on KKKAcJd river → action ≠ raise |
| 11 | `freePremiumMustNotFold` | illegal_move | AhKh, toCall=0 → action ≠ fold |

**Run:** `npm run audit:bots`

### E2E Tests (`tests/e2e/scenario-lab.e2e.spec.ts`)

Full HTTP round-trip tests against the running NestJS app. Tests the `/api/v1/bots/:id/scenario` endpoint.

**Coverage areas (30 scenarios):**

| Area | What it proves |
|------|---------------|
| Illegal move guards | Engine never folds when free, never raises below minRaise, board-plays guard works end-to-end |
| All poker streets | Preflop / flop / turn / river each return a valid action |
| All 8 personality presets | Quick-tier bots each return coherent actions |
| Strategy tier rules | Named rules with conditions fire and override personality |
| Pro tier position overrides | Position-specific personality changes behavior vs other positions |
| Preflop range chart | Specific hands (AA, 72o) mapped to configured actions |
| Player count effects | 2-player vs 8-player same scenario → no illegal moves either way |
| DTO validation errors | Invalid card counts (1, 2), missing fields → 400 |
| Auth / ownership | No token → 401, wrong user → 403, bad bot ID → 404 |

**Run:** `npx vitest run tests/e2e/scenario-lab.e2e.spec.ts --config vitest.e2e.config.ts`

### Audit Script (`scripts/audit-bots.ts`)

CLI wrapper that runs the Bot Auditor against:
- All 8 `PERSONALITY_PRESETS` (quick-tier)
- 2 pro-tier bots with aggressive position overrides (UTG Aggressor, BTN Aggressor)

**Run:** `npm run audit:bots`

---

## How to Add New Tests

### Adding a unit test for a new engine behavior

1. Find the relevant spec file in `tests/unit/bot-strategy/`
2. Add a `describe` block or a new `it` in the most relevant existing block
3. Build a `BotPayload` directly (no HTTP, no DB) and call `evaluateHydrated(hydrateStrategy(strategy), payload)` 
4. Assert on `result.action.type`, `result.source`, and `result.explanation`
5. Run `npx vitest run tests/unit/bot-strategy/` to confirm

### Adding a bot auditor scenario

1. Open `src/testing-utilities/bot-auditor.ts`
2. Add a new `scenario*` method following the existing pattern:
   - Build a `BotPayload` via `makePayload()` helper
   - Define `assertions: AssertionFn[]` (returns `{ passed, message, context }`)
   - Register in `constructor` via `this.scenarios.push(this.scenarioYourName.bind(this))`
3. Update the constructor comment listing all N scenarios
4. Run `npm run audit:bots` to see results

### Adding an e2e test scenario

1. Open `tests/e2e/scenario-lab.e2e.spec.ts`
2. Choose the appropriate `describe` block (Illegal Move Guards / Strategy Correctness / etc.)
3. Create a bot via `POST /api/v1/bots/internal` with the strategy under test
4. Call `POST /api/v1/bots/:id/scenario` with the game state you want to test
5. Assert on `response.body.primaryAction.type`, `response.body.source`, `response.body.distribution`
6. Run `npx vitest run tests/e2e/scenario-lab.e2e.spec.ts --config vitest.e2e.config.ts`

### What makes a good scenario to test

A scenario should encode one of these:
- **Invariant enforcement**: Engine must NEVER produce action X in situation Y (illegal moves, board-plays raises)
- **Strategy correctness**: Bot with config Z should MOSTLY produce action X (distribution-based, not deterministic)
- **Source routing**: A specific configuration should produce action from source "rule" / "range_chart" / "position_override"
- **Regression guard**: A specific bug that was found and fixed (add a test that would have caught it)

For non-deterministic checks, use the `distribution` field — e.g., assert `distribution.raise >= 60` for an aggressive bot with premium cards, rather than asserting `primaryAction.type === 'raise'` (which could flake based on seed).
