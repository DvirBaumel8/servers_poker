# Testing Guide

This document describes the testing strategy and how to run tests for the Poker Platform.

## Testing Strategy Overview

The platform uses **three complementary testing layers**:

1. **Game Invariants** — Automated validation of poker game logic (unit/property-based)
2. **API & Integration** — Backend endpoint and service testing
3. **UI Bug Detection** — AI-powered visual regression and UX testing

---

## Game Invariant Testing

The core strength of the poker system is **chip conservation** and **game logic correctness**. This is validated by running complete simulated poker games and checking invariants after every action.

### What It Tests

Eight invariant validators check game correctness:

1. **Total chips conserved** — `sum(player.chips) + pot === expected_total`
2. **Pot equals stacked bets** — `mainPot ≈ sum(playerBetsThisRound)`
3. **Valid card counts** — Each player has exactly 0 or 2 hole cards
4. **Valid community cards** — Only 0, 3, 4, or 5 community cards allowed
5. **Valid active players** — Non-negative active player count
6. **No duplicate cards** — No card appears twice in the deck
7. **Valid bet sizes** — No negative bets
8. **Side pot math** — `sum(pots) === getTotalPot()` when multiple pots exist

See `src/testing/validators.ts` for full implementation.

### Running Game Tests

```bash
# Quick test: 20 games with 6 bots
npm run test:poker -- --games=20 --bots=6

# Thorough test: 100 games with 8 bots
npm run test:poker -- --games=100 --bots=8

# Full coverage: 500 games
npm run test:poker -- --games=500 --bots=6
```

**Output:**
- ✅ Pass/fail per game
- 📊 Coverage metrics (side pots, heads-up, split pots, eliminations, showdowns)
- 📋 `POKER_BUGS.md` — Auto-generated bug report (deduped, tracks new & resolved issues)
- 📄 `test-coverage.json` — Detailed scenario coverage

---

## UI Bug Detection (Gemini AI + Playwright)

Automated detection of visual bugs, layout issues, and UX problems during live gameplay using Google Gemini and Playwright screenshots.

### What It Tests

- Missing or broken UI elements
- Incorrect data displays (pot, chips, player counts, cards)
- Layout overlap and misalignment
- Color contrast and readability issues
- Animation/rendering glitches
- Z-index and layering problems
- Player state clarity (active, folded, waiting)

### Running UI Bug Detection

```bash
# One command: creates live game, captures screenshots, detects bugs
bash scripts/detect-ui-bugs.sh

# Time: ~2 minutes
# Output:
#   - 5 screenshots captured (5 second interval over 15 seconds)
#   - Analyzed via Gemini (3 parallel batches)
#   - POKER_BUGS.md auto-updated with findings
#   - ui-bug-reports/bugs-{gameId}-{timestamp}.md detailed report
```

**Performance optimized:**
- 30s → 15s duration (2.7x faster)
- 9 API calls → 3 parallel batches
- Single screenshot folder with auto-cleanup
- 70% less Google API quota per run

### Bug Tracking

Bugs are tracked in **POKER_BUGS.md** (auto-maintained):
- Grouped by severity (Critical, High, Medium, Low)
- Deduped (same bug not added twice)
- Shows last detection timestamp
- Tracks status (active vs resolved)
- Includes reproduction steps and expected behavior

## Test Structure

```
tests/
├── unit/                     # Unit tests (game logic, no external dependencies)
│   ├── hand-evaluator.spec.ts
│   ├── pot-manager.spec.ts
│   ├── betting.spec.ts
│   ├── chip-conservation.spec.ts
│   ├── edge-cases.spec.ts
│   └── edge-cases-tdd.spec.ts
├── integration/              # Integration tests (services with mocks)
│   ├── auth.integration.spec.ts
│   └── game-flow.integration.spec.ts
├── e2e/                      # End-to-end tests (requires database)
│   ├── auth.e2e.spec.ts
│   ├── bots.e2e.spec.ts
│   ├── games.e2e.spec.ts
│   ├── tournaments.e2e.spec.ts
│   ├── game-mechanics.e2e.spec.ts
│   └── websocket.e2e.spec.ts
├── qa/                       # QA automation tests
│   └── simulations/
│       ├── game-simulator.ts      # Play complete games, collect bugs
│       └── run-poker-tests.ts     # CLI: run bulk game tests
└── utils/                    # Test utilities
    ├── test-app.ts           # NestJS test app factory
    ├── test-helpers.ts       # Common test helpers (waitForCondition, createTestUser, etc.)
    └── strategy-bot-factory.ts # Factory for creating bots with strategies
```

See also:
- `src/testing/validators.ts` — Game invariant checkers
- `src/testing/ui-bug-detector.ts` — Gemini bug detection
- `scripts/detect-ui-bugs.sh` — UI bug detection CLI

## When to Use Each Test Type

| Situation | Use | Command |
|-----------|-----|---------|
| **Modifying game logic** (betting, pot, hand eval) | Game invariant tests | `npm run test:poker -- --games=50 --bots=6` |
| **Changing UI components** (cards, chips, layout) | Gemini UI detection | `bash scripts/detect-ui-bugs.sh` |
| **API endpoint changes** | E2E tests | `npm run test:e2e` |
| **Service/business logic** | Unit/integration tests | `npm test` |
| **Debugging a live issue** | Live game demo | `npm run game:watch` |
| **Quick feedback loop** | Type check + unit tests | `npm run ci:local:quick` |

---

## Test Types

### Unit Tests

Unit tests verify individual functions and classes in isolation without external dependencies.

**What they test:**
- Hand evaluation logic
- Pot calculations and side pots
- Betting rules and validation
- Chip conservation invariants
- Edge cases in game logic

**Run unit tests:**
```bash
npm run test:unit
```

### Integration Tests

Integration tests verify that multiple components work together correctly. They may use mock servers or services but don't require a database.

**What they test:**
- Game flow logic with mocked dependencies
- Input validation
- Authentication logic

**Run integration tests:**
```bash
npm run test:integration
```

### End-to-End Tests

E2E tests verify the complete system including API endpoints, database operations, and WebSocket connections. They require a running PostgreSQL database.

**What they test:**
- Full authentication flow (register, login, protected routes)
- Bot CRUD operations with database
- Game table creation and bot joining
- Tournament registration and management
- WebSocket connections and real-time events

**Run E2E tests:**
```bash
# Start PostgreSQL first (see below)
npm run test:e2e
```

## Running Tests

### Quick Local Test Suite

Lint + type check + unit tests (no database needed):

```bash
npm run ci:local:quick
```

Time: ~30 seconds. Use for quick feedback during development.

### Game Invariant Tests (Recommended for Game Logic Changes)

After modifying game logic, validate with automatic game simulation:

```bash
# Quick validation
npm run test:poker -- --games=20 --bots=6

# Thorough validation
npm run test:poker -- --games=100 --bots=8
```

Output: `POKER_BUGS.md` with any violations found.

### All Backend Tests (Excluding E2E)

Unit + integration tests:

```bash
npm test
```

### All Backend Tests Including E2E

Requires PostgreSQL:

```bash
npm run test:all
```

### With Coverage Report

```bash
npm run test:cov
```

### Watch Mode

```bash
npm run test:watch
```

### Live Game Demo

Start the full stack with a live game for manual testing:

```bash
npm run game:watch
```

Opens `http://localhost:5173/games/{gameId}` automatically. See [QUICKSTART.md](./guides/QUICKSTART.md) for details.

## Setting Up for E2E Tests

### Option 1: Docker Compose

The easiest way to run E2E tests with a database:

```bash
# Run tests in Docker with a test database
npm run test:e2e:docker
```

This command:
1. Starts a PostgreSQL container
2. Runs migrations
3. Executes all tests
4. Cleans up containers

### Option 2: Local PostgreSQL

If you have PostgreSQL installed locally:

```bash
# Create test database
createdb poker_test

# Set environment variables
export TEST_DB_HOST=localhost
export TEST_DB_PORT=5432
export TEST_DB_USERNAME=postgres
export TEST_DB_PASSWORD=your_password
export TEST_DB_NAME=poker_test

# Run E2E tests
npm run test:e2e
```

### Option 3: Docker PostgreSQL Only

```bash
# Start just the database
docker run -d \
  --name poker-test-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=poker_test \
  -p 5433:5432 \
  postgres:16-alpine

# Run tests against it
TEST_DB_PORT=5433 npm run test:e2e

# Cleanup
docker rm -f poker-test-db
```

## Test Utilities

### Strategy Bot Factory

For creating bots with specific strategies in tests:

```typescript
import { createStrategyBot, registerUserWithBot } from '../utils/strategy-bot-factory';

// Create a bot with a calling strategy
const bot = createStrategyBot({ personality: 'caller' });

// Register a user and bot in one step (for E2E tests)
const { user, bot } = await registerUserWithBot(app, {
  botName: 'TestBot',
  strategy: { tier: 'quick', aggression: 0.5 }
});
```

### Test Helpers

```typescript
import { 
  createTestUser, 
  createTestBot, 
  createTestTable,
  authHeader 
} from '../utils/test-helpers';

// Create authenticated user
const user = await createTestUser(app);

// Create bot
const bot = await createTestBot(app, user.accessToken);

// Create table
const table = await createTestTable(app, user.accessToken);

// Use auth header
await request(app.getHttpServer())
  .get('/api/v1/bots')
  .set(authHeader(user.accessToken));

// Poll until a condition is met (preferred over fixed sleep())
import { waitForCondition } from '../utils/test-helpers';
await waitForCondition(
  async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/games/${tableId}/state`)
      .set(authHeader(user.accessToken));
    return res.body.handNumber > 0;
  },
  { timeoutMs: 15000, label: 'game hand started' }
);
```

## Writing Tests

### Unit Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { bestHand } from '../../src/handEvaluator';

describe('Hand Evaluator', () => {
  it('should detect a flush', () => {
    const holeCards = [
      { rank: 'A', suit: 'hearts' },
      { rank: 'K', suit: 'hearts' },
    ];
    const community = [
      { rank: 'Q', suit: 'hearts' },
      { rank: 'J', suit: 'hearts' },
      { rank: '2', suit: 'hearts' },
      { rank: '7', suit: 'spades' },
      { rank: '3', suit: 'clubs' },
    ];
    
    const result = bestHand(holeCards, community);
    expect(result.rank).toBe(5); // Flush rank
    expect(result.name).toBe('Flush');
  });
});
```

### Integration Test Example

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { BotsService } from '../../src/modules/bots/bots.service';

describe('BotsService', () => {
  let service: BotsService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [BotsService, /* ... mock providers */],
    }).compile();

    service = module.get(BotsService);
  });

  it('should create a bot with strategy', async () => {
    const bot = await service.create({
      name: 'TestBot',
      strategy: { tier: 'quick', aggression: 0.5 },
    }, 'user-id');

    expect(bot.strategy).toBeDefined();
    expect(bot.name).toBe('TestBot');
  });
});
```

### E2E Test Example

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Auth E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should register a user', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'test@example.com',
        name: 'TestUser',
        password: 'SecurePassword123!',
      })
      .expect(201);

    expect(response.body.accessToken).toBeDefined();
  });
});
```

---

## Tournament System Testing (NEW)

Testing for tournament discovery, real-time registration, and access control features.

### Test Structure

```
tests/
├── unit/
│   ├── tournaments/
│   │   ├── tournaments-gateway.spec.ts       ← Socket.IO gateway
│   │   ├── tournaments-service.spec.ts       ← Business logic
│   │   └── tournaments-controller.spec.ts    ← HTTP endpoints
│   └── hooks/
│       └── useTournamentSocket.spec.ts       ← Frontend hook
│
├── integration/
│   ├── tournament-registration.spec.ts       ← Join flow
│   ├── tournament-realtime-updates.spec.ts   ← WebSocket broadcasts
│   └── tournament-access-control.spec.ts     ← Game spectating auth
│
└── e2e/
    ├── tournament-discovery.e2e.ts            ← Browse tournaments
    ├── tournament-registration.e2e.ts        ← Full join flow
    └── tournament-realtime.e2e.ts            ← Real-time updates
```

### What It Tests

**Frontend Hook (useTournamentSocket.ts):**
- ✅ WebSocket connection with JWT auth
- ✅ Auto-reconnect logic (5 attempts with exponential backoff)
- ✅ Subscribe/unsubscribe to tournament rooms
- ✅ State updates from server
- ✅ Player action tracking
- ✅ Connection error handling
- ✅ Cleanup on unmount

**Backend Gateway (TournamentsGateway):**
- ✅ JWT token verification on connect
- ✅ Disconnect clients without valid token
- ✅ Subscribe to tournament room
- ✅ Broadcast state updates to all subscribers
- ✅ Broadcast player actions (joined, busted)
- ✅ Broadcast notifications (blind increase, milestones)
- ✅ Handle reconnections

**Access Control:**
- ✅ Non-registered users blocked from live tournament games (403)
- ✅ Registered users can watch live games (200)
- ✅ Finished games are public (200 for anyone)
- ✅ Admin can watch any game (200)

**Registration Flow:**
- ✅ Fetch upcoming tournaments
- ✅ Select bot from modal
- ✅ Join tournament via API
- ✅ Verify registration in tournament
- ✅ Real-time participant count updates
- ✅ Success notifications

### Running Tournament Tests

```bash
# Unit tests
npm run test:unit -- tournaments

# Integration tests
npm run test:integration -- tournament

# E2E tests
npm run test:e2e -- tournament --no-file-parallelism

# All with coverage
npm run test -- tournaments --coverage

# Watch mode
npm run test -- tournaments --watch
```

### Test Scenarios

**Access Control Tests:**
```typescript
// Non-registered users blocked
GET /api/v1/games/live-game → 403 Forbidden

// Registered users allowed
GET /api/v1/games/live-game (with registration) → 200 OK

// Finished games public
GET /api/v1/games/finished-game (anyone) → 200 OK

// Admin override
GET /api/v1/games/any-game (admin) → 200 OK
```

**Real-Time Update Tests:**
```typescript
// WebSocket connects
io.connect('/tournament', { auth: { token } })
  → onConnect

// Subscribe to tournament
socket.emit('subscribe_tournament', { tournamentId })
  → room: tournament:123

// Receive state update
socket.on('tournament_state_updated', { registered_count, ... })
  → latestUpdate state updated

// Receive player action
socket.on('tournament_player_action', { botName, action, ... })
  → playerUpdates array updated

// Auto-reconnect on error
connection drops → retry every 1-5s → reconnects
```

### Coverage Targets

| Module | Target | Notes |
|--------|--------|-------|
| useTournamentSocket | 95%+ | Frontend hook |
| TournamentsGateway | 90%+ | WebSocket gateway |
| TournamentsService | 85%+ | Business logic |
| TournamentDetailPage | 80%+ | React page component |
| Integration flows | 85%+ | End-to-end scenarios |
| **Overall** | **85%+** | Combined coverage |

### Manual Testing Checklist

- [ ] **Phase 1 (Access Control)**
  - [ ] Non-registered user blocked from live game (403)
  - [ ] Registered user can watch live game (200)
  - [ ] Finished game is public (200)
  - [ ] Admin can watch any game (200)

- [ ] **Phase 2 (Real-Time)**
  - [ ] WebSocket connects successfully
  - [ ] Connection status shows 🟢 Live
  - [ ] Tournament state updates <100ms
  - [ ] Player action notifications instant
  - [ ] Participant count auto-updates
  - [ ] Auto-reconnect on disconnect
  - [ ] Multiple clients see same updates

- [ ] **Full Flow**
  - [ ] Browse tournament list
  - [ ] Open tournament detail
  - [ ] See live participant count
  - [ ] Register bot (modal)
  - [ ] Success message appears
  - [ ] Participant list updates
  - [ ] Real-time notifications

### Continuous Integration

Add to CI pipeline:

```yaml
- name: Tournament Tests
  run: |
    npm run test:unit -- tournaments
    npm run test:integration -- tournament
    npm run test:e2e -- tournament --no-file-parallelism
    npm run test -- tournaments --coverage --coverage-threshold=85
```

### See Also

- `TOURNAMENT_TESTING.md` — Full test suite implementation with code examples
- `TOURNAMENT_ARCHITECTURE.md` — Real-time architecture and design
- `TOURNAMENT_REALTIME_BACKEND.md` — Backend gateway implementation

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: poker_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit and integration tests
        run: npm test

      - name: Run E2E tests
        env:
          TEST_DB_HOST: localhost
          TEST_DB_PORT: 5432
          TEST_DB_USERNAME: postgres
          TEST_DB_PASSWORD: postgres
          TEST_DB_NAME: poker_test
        run: npm run test:e2e
```

## Test Coverage

Current coverage thresholds (enforced in CI) for **unit-testable code**:
- **Statements**: 80%
- **Branches**: 70%
- **Functions**: 85%
- **Lines**: 80%

### Files Excluded from Unit Test Coverage

The following are excluded because they're better suited for integration/E2E tests:

- **Controllers/Gateways/Entities/DTOs** - NestJS boilerplate, thin wrappers
- **Migrations/Workers/Simulation** - Database schema, worker threads, scripts
- **Repositories/Redis services** - External system dependencies
- **Passport strategies/Pipes** - Framework integration
- **Persistence/Manager services** - Complex external dependencies
- **Tournament director** - Complex state machine requiring integration tests

Run coverage report:
```bash
npm run test:cov
```

Coverage HTML report is generated at `coverage/index.html`.
