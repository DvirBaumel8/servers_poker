# Testing Guide

This document describes the testing strategy and how to run tests for the Poker Platform.

## Frontend Testing

The frontend now has a dedicated UI-focused test setup under `frontend/`.

### Frontend Test Stack

- `Vitest` for FE test running
- `@testing-library/react` for rendering and interaction
- `@testing-library/jest-dom` for DOM assertions
- `jsdom` for browser-like test environment

### Frontend Test Files

Examples of FE test coverage now live in:

- `frontend/src/App.test.tsx` — route-to-shell mapping and access guards
- `frontend/src/components/ui/primitives.test.tsx` — shared primitives and interaction patterns
- `frontend/src/pages/Home.test.tsx` — marketing page rendering + stat loading
- `frontend/src/pages/Tables.test.tsx` — lobby rendering
- `frontend/src/pages/Tournaments.test.tsx` — tournament lobby rendering
- `frontend/src/pages/Bots.test.tsx` — bot workspace rendering and switching

### Frontend Test Setup

Core FE test configuration lives in:

- `frontend/vitest.config.ts`
- `frontend/src/test/setup.ts`
- `frontend/src/test/test-utils.tsx`

### Run Frontend Tests

```bash
cd frontend

# Watch mode
npm test

# Single run
npm run test:run

# Existing API contract checks against a running backend
npm run test:contracts
```

### Frontend Test Scope

Use frontend tests for:

- shell routing and access control
- primitive interaction contracts
- loading, empty, error, and modal states
- critical page rendering for redesigned surfaces

Do not use frontend unit tests as a substitute for:

- backend API correctness
- websocket protocol validation
- full-system database flows

Those remain covered by backend unit/integration/e2e testing.

## Test Structure

```
tests/
├── unit/                     # Unit tests (no external dependencies)
│   ├── hand-evaluator.spec.ts
│   ├── pot-manager.spec.ts
│   ├── betting.spec.ts
│   ├── chip-conservation.spec.ts
│   ├── edge-cases.spec.ts
│   └── critical-edge-cases.spec.ts
├── integration/              # Integration tests (may use mocks)
│   ├── auth.integration.spec.ts
│   └── game-flow.integration.spec.ts
├── e2e/                      # End-to-end tests (requires database)
│   ├── auth.e2e.spec.ts
│   ├── bots.e2e.spec.ts
│   ├── games.e2e.spec.ts
│   ├── tournaments.e2e.spec.ts
│   └── websocket.e2e.spec.ts
└── utils/                    # Test utilities
    ├── test-app.ts           # NestJS test app factory
    ├── test-helpers.ts       # Common test helpers
    ├── strategy-bot-factory.ts # Factory for creating bots with strategies
    └── index.ts              # Exports
```

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

### All Tests (Excluding E2E)

The default test command runs unit and integration tests:

```bash
npm test
```

### All Tests Including E2E

Requires a PostgreSQL database:

```bash
npm run test:all
```

For frontend UI tests, use the frontend-local commands above instead of root-level backend test scripts.

### With Coverage

```bash
npm run test:cov
```

### Watch Mode

```bash
npm run test:watch
```

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

## CI/CD Integration

Tests run automatically on every PR via GitHub Actions:

- **Unit Tests**: Run with coverage reporting
- **E2E Tests**: Run with PostgreSQL service container
- **Coverage Report**: Posted as PR comment

See `.github/workflows/ci.yml` for the full configuration.
