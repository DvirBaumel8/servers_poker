# E2E Test Coverage Analysis & Expansion Plan

**Status:** April 2, 2026  
**Purpose:** Comprehensive review of existing e2e tests and recommendations for expansion, with focus on bot creation flows and extended test scenarios.

---

## Executive Summary

The project has **solid foundational e2e test coverage** with 10 test suites covering authentication, games, bots, tournaments, mechanics, security, and performance. However, **bot creation flows lack depth** — they're validated only at the API level with basic CRUD tests. Recommended additions include:

1. ✅ **Extended bot creation flows** — Complex strategy scenarios, bulk operations, edge cases
2. ✅ **Bot strategy performance testing** — Various strategy combinations, behavior validation
3. ✅ **Cross-flow integration tests** — Bot creation → game join → tournament → play
4. ✅ **Bot lifecycle scenarios** — Reactivation, strategy updates, performance tracking
5. ✅ **Resilience & recovery** — Bot crashes, disconnections, mid-game recovery

---

## Current E2E Test Inventory (10 Suites)

### 1. **bots.e2e.spec.ts** — Bot Management (9 tests)

**Current Coverage:**
- ✅ Bot CRUD (create, list, get by ID, update, deactivate)
- ✅ Input validation (missing name, missing strategy, duplicate names)
- ✅ Ownership & isolation (cross-user protection)

**Gaps:**
- No tests for strategy complexity validation (invalid strategy JSON)
- No tests for bot reactivation after deactivation
- No tests for bulk bot creation
- No tests for bot updates after game participation
- No tests for concurrent bot creation
- No tests for strategy switching on existing bots
- No tests for bot description/metadata updates beyond basic case

---

### 2. **games.e2e.spec.ts** — Game/Table Management (11 tests)

**Current Coverage:**
- ✅ Table CRUD operations
- ✅ Bot join table validation (single bot, multiple bots, inactive bot, duplicate, non-existent)
- ✅ Game state retrieval
- ✅ Leaderboard & health check

**Gaps:**
- No tests for game creation with specific bot strategies
- No tests for game flow from creation → bot joins → game starts
- No tests for invalid strategy specifications in game creation
- No tests for concurrent bot joins to same table
- No tests for bot performance impact on table creation time

---

### 3. **tournaments.e2e.spec.ts** — Tournament Management (14 tests)

**Current Coverage:**
- ✅ Tournament CRUD & validation
- ✅ Tournament registration flow
- ✅ Tournament status tracking
- ✅ Full flow: Creation → Registration → Countdown → Start → Play
- ✅ Bot elimination scenarios
- ✅ Edge cases (insufficient players, cancellation, results)

**Status:** Well-covered, mature test suite

---

### 4. **game-mechanics.e2e.spec.ts** — Game Rules & Logic (6 tests)

**Current Coverage:**
- ✅ Heads-up mechanics
- ✅ All-in scenarios
- ✅ Chip conservation
- ✅ Folding mechanics
- ✅ Betting rounds

**Status:** Solid, but could add more complex scenarios (split pots, side pots, exotic situations)

---

### 5. **auth.e2e.spec.ts** — Authentication & Authorization (11 tests)

**Status:** Comprehensive, covers registration, login, protected routes, validation

---

### 6. **security.e2e.spec.ts** — Security Controls (16 tests)

**Status:** Comprehensive, covers auth bypass, IDOR, injection, mass assignment, enumeration, resource limits

---

### 7. **websocket.e2e.spec.ts** — WebSocket Communication (6 tests)

**Current Coverage:**
- ✅ Connection management
- ✅ Table subscription & unsubscription
- ✅ Multiple client handling
- ✅ Error handling for invalid tables/messages

**Gaps:**
- No tests for bot strategy evaluation over WebSocket
- No tests for rapid game state updates with different bot types
- No tests for WebSocket message ordering guarantees

---

### 8. **performance-load.e2e.spec.ts** — Performance & Load (6 tests)

**Current Coverage:**
- ✅ Response time baselines
- ✅ Concurrent registrations
- ✅ Concurrent table operations
- ✅ Rapid API calls
- ✅ In-process bot strategy evaluation performance

**Status:** Good baseline, but bot strategy variance not tested

---

### 9. **recovery.e2e.spec.ts** — Session & Resource Recovery (1 test)

**Current Coverage:**
- ✅ Token validity across requests
- ✅ Expired token rejection
- ✅ Resource cleanup on player leave

**Status:** Minimal, could be expanded

---

### 10. **provably-fair.e2e.spec.ts** — Fairness & Cryptography (7 tests)

**Status:** Comprehensive, covers fairness mechanism validation

---

## 🎯 Recommended New E2E Test Suites

### 1. **bot-creation-flows.e2e.spec.ts** ⭐ NEW (HIGH PRIORITY)

**Purpose:** Comprehensive end-to-end testing of bot creation with various strategies, edge cases, and integration scenarios.

**Test Scenarios (12-15 tests):**

#### A. Strategy Validation & Complexity
```typescript
describe("Bot Creation with Complex Strategies", () => {
  it("should create bot with minimal valid strategy")
  it("should create bot with full-featured strategy (all decision types)")
  it("should create bot with nested decision trees")
  it("should reject bot with circular strategy references")
  it("should reject bot with missing required fields in strategy")
  it("should handle strategy with 100+ decision points")
  it("should validate hand ranges in strategy")
  it("should validate position-based strategy rules")
})
```

#### B. Concurrent Creation & Bulk Operations
```typescript
describe("Bot Creation Concurrency & Bulk Operations", () => {
  it("should handle 5 concurrent bot creations from same user")
  it("should handle 10 bots created by different users simultaneously")
  it("should enforce duplicate name constraint under concurrent load")
  it("should maintain bot uniqueness after batch creation")
})
```

#### C. Lifecycle & State Transitions
```typescript
describe("Bot Creation Lifecycle & State Transitions", () => {
  it("should create → deactivate → reactivate bot")
  it("should create bot → update strategy → verify new strategy in game")
  it("should create bot → play game → update bot metadata")
  it("should create bot → join tournament → create new bot → both play")
  it("should prevent deletion of bot actively playing")
})
```

#### D. Strategy Performance Validation
```typescript
describe("Bot Creation with Strategy Performance", () => {
  it("should measure strategy evaluation time during bot creation")
  it("should create bot and verify it makes valid decisions in game")
  it("should create bots with extreme strategies (tight/loose) and verify behavior")
  it("should compare decision consistency across multiple hands")
})
```

**Expected Tests:** 15-20 tests

---

### 2. **bot-game-integration.e2e.spec.ts** ⭐ NEW (HIGH PRIORITY)

**Purpose:** Complete flows from bot creation → game join → gameplay with various bot combinations.

**Test Scenarios (10-12 tests):**

```typescript
describe("Bot Creation to Game Integration", () => {
  // Full flow tests
  it("should create bot → join game → complete hand → verify results")
  it("should create 6 bots → populate table → run complete game")
  it("should create bots with different strategies → observe behavior in same game")
  it("should create weak strategy bot → strong strategy bot → verify win rates")
  
  // Multi-strategy scenarios
  it("should handle mix of aggressive and conservative bots in same game")
  it("should handle mix of random and decision-tree bots in same game")
  it("should verify all-in scenarios with diverse bot types")
  
  // Performance under load
  it("should create 20 bots → run concurrent games with different tables")
  it("should handle bot creation failure and retry without corruption")
})
```

**Expected Tests:** 10-12 tests

---

### 3. **bot-tournament-flow.e2e.spec.ts** ⭐ NEW (MEDIUM PRIORITY)

**Purpose:** Bot creation → tournament registration → multi-table play with strategy validation.

**Test Scenarios (8-10 tests):**

```typescript
describe("Bot Creation & Tournament Integration", () => {
  it("should create bot → register in tournament → play from table assignment")
  it("should create 16 bots → register in 16-player tournament → run to completion")
  it("should create bots with different skill levels → verify elimination order correlates with strength")
  it("should handle mid-tournament bot strategy changes (if allowed)")
  it("should verify bot decisions are logged during tournament play")
})
```

**Expected Tests:** 8-10 tests

---

### 4. **bot-strategy-variants.e2e.spec.ts** ⭐ NEW (MEDIUM PRIORITY)

**Purpose:** Bot creation with various strategy types and verify behavior consistency.

**Test Scenarios (12-15 tests):**

```typescript
describe("Bot Strategy Variants", () => {
  // Preset strategy tests
  it("should create 'Tight-Aggressive' bot and verify betting behavior")
  it("should create 'Loose-Passive' bot and verify decision patterns")
  it("should create 'Balanced' bot and verify adaptation")
  
  // Custom strategy tests
  it("should create custom strategy bot from template")
  it("should create bot with hand-crafted decision tree")
  it("should create bot with GTO-inspired strategy")
  
  // Edge case strategies
  it("should create bot with always-fold strategy (doesn't crash)")
  it("should create bot with always-call strategy (works correctly)")
  it("should create bot with always-all-in strategy (handles risk)")
  
  // Strategy persistence
  it("should create bot → save strategy → load and verify identical behavior")
  it("should create bot → export strategy → import into new bot → compare decisions")
})
```

**Expected Tests:** 12-15 tests

---

### 5. **bot-resilience.e2e.spec.ts** ⭐ NEW (LOWER PRIORITY)

**Purpose:** Bot creation resilience, recovery, and error handling.

**Test Scenarios (8-10 tests):**

```typescript
describe("Bot Creation Resilience & Recovery", () => {
  it("should handle bot creation failure during strategy compilation")
  it("should recover from database connection loss during bot creation")
  it("should verify bot was not partially created on error")
  it("should allow retry of failed bot creation")
  it("should handle strategy parsing failure gracefully")
  it("should validate bot state consistency after creation")
  it("should verify bot can be deleted and recreated with same name")
  it("should handle very large strategy payloads (size limits)")
})
```

**Expected Tests:** 8-10 tests

---

### 6. **bot-access-control.e2e.spec.ts** ⭐ NEW (MEDIUM PRIORITY)

**Purpose:** Bot creation access control, sharing, and visibility.

**Test Scenarios (8-10 tests):**

```typescript
describe("Bot Creation & Access Control", () => {
  it("should create bot and verify only owner can modify")
  it("should create bot and verify visibility to other users")
  it("should create bot and prevent unauthorized strategy viewing (if private)")
  it("should allow user to create unlimited bots (or verify limit enforcement)")
  it("should verify created bots are searchable/discoverable by type")
  it("should prevent account from creating duplicate bot names")
  it("should verify deleted bot cannot be accessed")
})
```

**Expected Tests:** 8-10 tests

---

## 🔧 Expansion of Existing Test Suites

### Expand **games.e2e.spec.ts**
Add 5-7 new tests:
- Game creation with specific bot strategy requirements
- Game with maximum player capacity filled with created bots
- Game creation timeout/resource cleanup validation
- Game creation with invalid strategy specifications

### Expand **game-mechanics.e2e.spec.ts**
Add 8-10 new tests:
- Side pot calculations with multiple all-in scenarios
- Split pot scenarios (multiple winners, kicker comparisons)
- Complex position dynamics with diverse bot types
- Hand history validation for created bots
- Decision consistency across multiple hands

### Expand **websocket.e2e.spec.ts**
Add 5-7 new tests:
- Strategy evaluation events over WebSocket
- Message ordering guarantees during rapid actions
- Bot state updates through WebSocket with different strategies
- Concurrent WebSocket subscribers with multiple bot states

### Expand **recovery.e2e.spec.ts**
Add 5-8 new tests:
- Bot creation and graceful shutdown recovery
- Game state recovery with multiple bots
- Tournament recovery with bot-specific state
- WebSocket reconnection with bot state consistency

---

## 📊 Coverage Summary

| Category | Current Tests | Recommended New | Priority |
|----------|---------------|-----------------|----------|
| Bot Creation (basic) | 9 | 15-20 (bot-creation-flows.e2e) | 🔴 HIGH |
| Bot-Game Integration | 11 | 10-12 (bot-game-integration.e2e) | 🔴 HIGH |
| Bot Tournament Flow | 14 | 8-10 (bot-tournament-flow.e2e) | 🟡 MEDIUM |
| Strategy Variants | 0 | 12-15 (bot-strategy-variants.e2e) | 🟡 MEDIUM |
| Bot Access Control | 0 | 8-10 (bot-access-control.e2e) | 🟡 MEDIUM |
| Bot Resilience | 0 | 8-10 (bot-resilience.e2e) | 🟢 LOW |
| Expand existing suites | - | 28-32 additional tests | 🟡 MEDIUM |
| **TOTAL** | **63** | **89-119** | - |

---

## 🎬 Implementation Roadmap

### Phase 1: High-Priority Bot Creation Flows (Week 1)
1. **bot-creation-flows.e2e.spec.ts** (15-20 tests)
   - Strategy validation with edge cases
   - Concurrent creation & bulk operations
   - Lifecycle & state transitions
   - Strategy performance validation

2. **bot-game-integration.e2e.spec.ts** (10-12 tests)
   - Full flow: creation → join → play
   - Multi-strategy scenarios
   - Concurrent games with various bot types

3. Expand **games.e2e.spec.ts** (5-7 new tests)
   - Game creation with strategy requirements
   - Full table with created bots
   - Resource cleanup validation

### Phase 2: Strategy & Tournament Integration (Week 2)
4. **bot-strategy-variants.e2e.spec.ts** (12-15 tests)
   - Preset & custom strategies
   - Edge case strategies
   - Strategy persistence & migration

5. **bot-tournament-flow.e2e.spec.ts** (8-10 tests)
   - Creation → registration → multi-table play
   - Tournament completion with diverse strategies

6. Expand **game-mechanics.e2e.spec.ts** (8-10 tests)
   - Side pots, split pots, complex scenarios
   - Hand history validation

### Phase 3: Resilience & Access Control (Week 3)
7. **bot-resilience.e2e.spec.ts** (8-10 tests)
   - Error handling & recovery
   - Database failure scenarios
   - Large payload handling

8. **bot-access-control.e2e.spec.ts** (8-10 tests)
   - Ownership & isolation
   - Sharing & visibility
   - Deletion & cleanup

9. Expand **websocket.e2e.spec.ts** (5-7 tests)
   - Strategy evaluation over WebSocket
   - Message ordering & bot state consistency

10. Expand **recovery.e2e.spec.ts** (5-8 tests)
    - Bot-specific recovery scenarios
    - Multi-bot state consistency

---

## 🛠️ Key Testing Utilities Needed

### 1. **Bot Factory Helpers**
Create test utilities in `tests/e2e/shared/bot-factory.ts`:
```typescript
export async function createBotWithStrategy(
  user: TestUser,
  strategy: BotStrategy | 'aggressive' | 'conservative' | 'random'
): Promise<Bot>

export async function createMultipleBots(
  user: TestUser,
  count: number,
  strategies?: BotStrategy[]
): Promise<Bot[]>

export async function verifyBotDecision(
  bot: Bot,
  gameState: GameState,
  expectedActionType: ActionType
): Promise<boolean>
```

### 2. **Strategy Validation Helpers**
```typescript
export function createValidStrategy(): BotStrategy { }
export function createMinimalStrategy(): BotStrategy { }
export function createComplexStrategy(): BotStrategy { }
export function strategyWithErrors(type: 'circular' | 'missing_field' | 'invalid_range'): BotStrategy { }
```

### 3. **Game Flow Helpers**
```typescript
export async function runGameWithBots(
  app: INestApplication,
  bots: Bot[],
  options: { smallBlind, bigBlind, maxPlayers }
): Promise<GameResult>

export async function runTournamentWithBots(
  app: INestApplication,
  bots: Bot[],
  tournamentOptions: any
): Promise<TournamentResult>
```

### 4. **Strategy Comparison Helpers**
```typescript
export async function compareStrategyBehavior(
  bot1: Bot,
  bot2: Bot,
  scenarios: GameScenario[]
): Promise<ComparisonReport>

export function calculateWinRateCorrelation(
  strategyStrength: number,
  winRate: number
): boolean
```

---

## 🎯 Success Criteria

Each new test suite should:
- ✅ Cover happy path + edge cases + error scenarios
- ✅ Use factory helpers for consistent test data
- ✅ Include performance assertions where relevant
- ✅ Document test purpose & scenario in comments
- ✅ Use meaningful assertion messages
- ✅ Run in under 5s per test (or document why longer)
- ✅ Clean up test data (bots, games, tournaments)
- ✅ Be independent (no ordering dependencies)

---

## 📝 Notes

1. **Current bots.e2e.spec.ts is solid** for basic CRUD but lacks depth in:
   - Strategy complexity validation
   - Concurrent operations
   - Integration with games/tournaments
   - Lifecycle transitions

2. **Bot creation is critical** because:
   - It's the first step in bot workflow
   - Strategy validation happens here
   - Performance impact is immediate
   - Used by all downstream tests

3. **Strategy testing is under-covered** — need dedicated suite to validate:
   - Strategy parsing & compilation
   - Decision consistency
   - Performance with complex strategies
   - Behavior variance across scenarios

4. **Resilience testing is missing** — important for:
   - Production stability
   - Graceful error recovery
   - Data consistency after failures
   - User experience under errors

---

## Next Steps

1. **Review & Approve** this analysis
2. **Prioritize** which suites to implement first
3. **Create** bot-factory test utilities
4. **Implement** Phase 1 test suites (high priority)
5. **Measure** coverage improvement with test reports
6. **Iterate** based on gaps found during implementation

