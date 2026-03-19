# Poker Engine — Architecture

## Overview

A No-Limit Texas Hold'em tournament platform where developers build bot servers that compete against each other. The game server orchestrates everything — bots are HTTP servers that receive game state and return an action.

```
┌───────────────────────────────────────────────────────────────┐
│                       NestJS Game Server                       │
│  POST /auth/register          — create account                 │
│  POST /auth/login             — get JWT token                  │
│  POST /bots                   — register a bot                 │
│  GET  /tournaments            — list tournaments               │
│  POST /tournaments/:id/register — enter tournament             │
│  WS   /game                   — real-time push (Socket.IO)     │
└──────────────────┬────────────────────────┬───────────────────┘
                   │  POST /action           │  POST /action
                   ▼                         ▼
           ┌───────────────┐         ┌───────────────┐
           │  Bot Server A │         │  Bot Server B │
           │ (player code) │         │ (player code) │
           └───────────────┘         └───────────────┘
```

---

## Technology Stack

### Backend
- **Runtime:** Node.js 22+
- **Framework:** NestJS
- **Database:** PostgreSQL with TypeORM
- **Authentication:** JWT (users), API Key (bots)
- **WebSocket:** Socket.IO via @nestjs/websockets
- **Testing:** Vitest

### Frontend
- **Framework:** React 18 with TypeScript
- **State:** Zustand
- **Styling:** Tailwind CSS
- **Animations:** Framer Motion
- **Build:** Vite

---

## Directory Structure

```
servers_poker/
├── src/
│   ├── main.ts                      — Application bootstrap (NestJS entry)
│   ├── app.module.ts                — Root module
│   ├── config/
│   │   ├── database.config.ts       — TypeORM/PostgreSQL configuration
│   │   └── app.config.ts            — Application settings
│   ├── entities/
│   │   ├── user.entity.ts           — User account
│   │   ├── bot.entity.ts            — Bot registration
│   │   ├── tournament.entity.ts     — Tournament definition
│   │   ├── game.entity.ts           — Game session
│   │   ├── table.entity.ts          — Table configuration
│   │   ├── table-seat.entity.ts     — Table seat assignments
│   │   ├── hand.entity.ts           — Individual hand
│   │   ├── action.entity.ts         — Player action
│   │   ├── audit-log.entity.ts      — Request audit trail
│   │   ├── chip-movement.entity.ts  — Chip transaction log
│   │   └── game-state-snapshot.entity.ts — Persisted game state for recovery
│   ├── repositories/
│   │   ├── user.repository.ts       — User data access
│   │   ├── bot.repository.ts        — Bot data access
│   │   ├── tournament.repository.ts — Tournament data access
│   │   ├── game.repository.ts       — Game/hand data access
│   │   ├── table.repository.ts      — Table management
│   │   ├── analytics.repository.ts  — Stats and leaderboards
│   │   └── game-state.repository.ts — Game state snapshots
│   ├── modules/
│   │   ├── auth/                    — JWT & API key auth
│   │   ├── users/                   — User management
│   │   ├── bots/                    — Bot registration/validation
│   │   ├── tournaments/             — Tournament lifecycle (incl. TournamentDirectorService)
│   │   └── games/                   — Tables, game joining, WebSocket
│   ├── services/
│   │   ├── live-game-manager.service.ts — In-memory game state management
│   │   ├── game-state-persistence.service.ts — Periodic state persistence to DB
│   │   ├── game-recovery.service.ts — Auto-recovery on server restart
│   │   ├── bot-caller.service.ts    — Resilient bot API calls
│   │   ├── bot-resilience.service.ts — Fallback strategies
│   │   ├── bot-health-scheduler.service.ts — Periodic health checks
│   │   └── bot-metrics.gateway.ts   — Real-time bot monitoring
│   ├── migrations/
│   │   ├── 1710864000000-InitialSchema.ts — Initial database schema
│   │   ├── 1710864001000-AddGameStateSnapshots.ts — Game state persistence
│   │   └── run.ts                   — Migration runner script
│   ├── common/
│   │   ├── guards/                  — JWT, API key, roles guards
│   │   ├── interceptors/            — Logging, audit, timeout
│   │   ├── filters/                 — Exception handling
│   │   ├── decorators/              — Custom decorators
│   │   ├── pipes/                   — Validation pipes
│   │   └── validators/              — Custom validators
│   ├── game/
│   │   ├── poker-game.service.ts    — Game engine (hardened)
│   │   └── invariants.ts            — Chip conservation checks
│   └── simulation/
│       ├── simulation-engine.ts     — Automated game testing
│       ├── simulation-reporter.ts   — Results analysis
│       └── runner.ts                — CLI entry point
├── frontend/                          — React SPA (Vite + TypeScript)
│   ├── src/
│   │   ├── App.tsx                  — Main router with auth
│   │   ├── main.tsx                 — React entry point
│   │   ├── components/              — React components
│   │   │   ├── game/                — Table, PlayerSeat, Card
│   │   │   ├── common/              — ChipStack, Timer
│   │   │   ├── tournament/          — TournamentCard, LeaderboardTable
│   │   │   └── layout/              — Layout with nav + auth
│   │   ├── pages/                   — Route pages
│   │   │   ├── Home.tsx             — Landing page
│   │   │   ├── Tables.tsx           — Cash game tables list
│   │   │   ├── GameView.tsx         — Live game view with WebSocket
│   │   │   ├── Tournaments.tsx      — Tournament list
│   │   │   ├── TournamentDetail.tsx — Single tournament
│   │   │   ├── Bots.tsx             — Bot management
│   │   │   ├── Leaderboard.tsx      — Rankings
│   │   │   ├── Login.tsx            — Authentication
│   │   │   └── Register.tsx         — Registration
│   │   ├── hooks/                   — Custom hooks
│   │   │   └── useWebSocket.ts      — Socket.IO connection to /game
│   │   ├── stores/                  — Zustand stores
│   │   │   ├── authStore.ts         — JWT + user state (persisted)
│   │   │   ├── gameStore.ts         — Current game state
│   │   │   └── tournamentStore.ts   — Tournament state
│   │   ├── api/                     — API clients
│   │   │   ├── client.ts            — Base fetch wrapper
│   │   │   ├── auth.ts              — Login/register/me
│   │   │   ├── games.ts             — Tables/state/history
│   │   │   ├── bots.ts              — Bot CRUD
│   │   │   └── tournaments.ts       — Tournament CRUD
│   │   └── types/                   — TypeScript types
│   └── public/                      — Static assets
├── tests/
│   ├── unit/                        — Vitest unit tests
│   └── e2e/                         — End-to-end tests
├── docs/
│   ├── ARCHITECTURE.md              — This file
│   ├── KNOWLEDGE.md                 — Design decisions
│   ├── DATA_DICTIONARY.md           — Database schema
│   ├── API.md                       — API reference
│   ├── GAME_RULES.md                — Poker rules
│   ├── SECURITY.md                  — Security architecture
│   ├── DEPLOYMENT.md                — Production deployment
│   ├── QUICKSTART.md                — 5-minute getting started
│   └── AI_CONTEXT.md                — Context for AI assistants
└── bots/
    ├── bot.js                       — Node.js full boilerplate
    ├── bot.py                       — Python full boilerplate
    ├── sdk/
    │   ├── javascript/index.js      — Zero-config Node.js SDK
    │   └── python/poker_sdk.py      — Zero-config Python SDK
    ├── examples/
    │   ├── 01-check-fold.js         — Simplest bot (4 lines)
    │   ├── 02-calling-station.js    — Call everything
    │   ├── 03-tight-passive.js      — Premium hands only
    │   ├── 04-tight-aggressive.js   — Classic TAG strategy
    │   ├── 05-pot-odds-calculator.js — Math-based decisions
    │   ├── 06-position-aware.js     — Position exploits
    │   └── README.md                — Examples guide
    └── playground/
        └── test-bot.js              — Local testing CLI
```

---

## Core Components

### NestJS Modules

#### AuthModule
Handles user authentication and API key management.
- JWT token generation and validation
- API key hashing and verification
- Password hashing with bcrypt
- Guards for route protection

#### UsersModule
User account management.
- Profile updates
- Role management (admin/user)
- Account deactivation

#### BotsModule
Bot registration and validation.
- CRUD operations for bots
- Endpoint validation (blocks internal IPs)
- 13-scenario validation suite
- Stats tracking
- **Connectivity Controller** (`/bots/connectivity/*`):
  - `GET /health/summary` — overall health summary (admin)
  - `GET /health/all` — all bot health statuses (admin)
  - `GET /health/:botId` — single bot health
  - `POST /health/:botId/check` — trigger health check
  - `POST /health/check-all` — check all bots (admin)
  - `GET /validate/:botId` — full validation suite
  - `GET /validate/:botId/quick` — quick validation
  - `POST /circuit-breaker/:botId/reset` — reset circuit breaker (admin)
  - `GET /latency/:botId` — average response latency

#### TournamentsModule
Tournament lifecycle management.
- Tournament creation (admin)
- Player registration
- Status transitions
- Results and payouts

#### GamesModule
Game engine and real-time communication.
- WebSocket Gateway for live updates
- Action processing
- Hand history retrieval

### Game Engine (`src/game/`)

#### PokerGameService
The core poker engine. DB-free and tournament-agnostic.
- Auto-starts at 2+ players, runs until one player holds all chips
- Each hand: antes → blinds → pre-flop → flop → turn → river → showdown
- 3-strike bot fault tolerance with configurable timeout
- Chip conservation validation after every action
- `rollbackHand()` — Restores all players to start-of-hand state
- `advanceDealer()` — Dead button rule, skips eliminated players
- `getBlindPositions()` — Returns dealer/SB/BB with heads-up handling

#### PotManager
Side pot calculation and distribution.
- `calculatePots()` — Creates side pots from all-in contributions
- `distributePot()` — Splits pot with odd chip to player closest to button

#### BettingRound
Single betting round management.
- `canReraise(playerId)` — Checks if player can re-raise (false after short all-in)
- `wasLastRaiseFull()` — Returns false if last raise was short all-in
- `getValidActionsForPlayer(player)` — Legal actions considering short all-in rules

#### ChipInvariantChecker
Runtime integrity validation.
- `assertChipConservation()` — total chips must equal initial
- `assertNonNegativeChips()` — no negative chip counts
- `assertValidPotDistribution()` — pot equals eligible player contributions
- `validateAction()` — action is legal given game state

#### TransactionAuditLog
Immutable record of all chip movements.
- Tracks every bet, win, ante, blind, refund
- Stores balance before and after
- Used for reconciliation and debugging

### Bot Connectivity Services (`src/services/`)

#### BotCallerService
HTTP client with resilience features.
- **Keep-Alive:** HTTP/HTTPS agents with connection pooling
- **Retry Logic:** Automatic retry on transient failures (ECONNRESET, timeout)
- **Circuit Breaker:** Opens after N consecutive failures, auto-resets
- **Latency Tracking:** Rolling window of response times

#### BotValidatorService
Comprehensive bot validation with 13 scenarios.
- **Categories:** Connectivity, Basic, Edge Case, Stress
- **Weighted Scoring:** 0-100 with category weights
- **Quick Mode:** Connectivity + Basic only

#### BotHealthSchedulerService
Background health monitoring.
- Periodic health checks on all registered bots
- More frequent checks for bots in active games
- Event emission on state changes

#### BotResilienceService
Fallback action generation when bots fail.
- **conservative:** Check/call small/fold
- **aggressive:** May raise when checking
- **check_fold:** Safest fallback
- Action validation and normalization

#### BotMetricsGateway
Real-time WebSocket monitoring at `/metrics`.
- Current snapshot of all bot health
- Health check round history
- Manual health check trigger
- Live events: state changes, circuit breakers, failures

### Simulation Engine (`src/simulation/`)

#### SimulationEngine
Automated game testing with configurable parameters.
- Multiple bot personalities (caller, folder, maniac, random, smart, crasher)
- Deterministic mode with seeded RNG
- Chip conservation validation
- Anomaly detection and recording

#### SimulationReporter
Generates human-readable reports from simulation runs.
- Statistical summaries
- Bot performance analysis
- Anomaly breakdown
- Recommendations

### Developer Experience (`bots/`)

#### Zero-Config SDKs
Both JavaScript and Python SDKs allow bot creation with minimal code:
```javascript
const { createBot, Action } = require('./sdk/javascript');
createBot({
  port: 3001,
  decide: (state) => state.action.canCheck ? Action.check() : Action.fold()
});
```

Features:
- Automatic HTTP server setup
- Health endpoint (`GET /health`)
- Logging with timing
- Error handling (returns fold on error)
- Strategy helpers (`preFlopStrength`, `postFlopStrength`)

#### Testing Playground
`bots/playground/test-bot.js` provides local testing:
- 11 pre-built scenarios
- Health check validation
- Response validation (action type, raise amounts)
- Timing measurement
- Colored pass/fail output

Usage:
```bash
node test-bot.js http://localhost:3001/action --all
node test-bot.js http://localhost:3001/action --scenario preflop_premium
```

#### Example Bots
Progressive complexity from 4 lines to 200+ lines:

**Beginner:**
1. Check/Fold — Never risks chips
2. Calling Station — Calls everything
3. Tight-Passive — Premium hands only

**Intermediate:**
4. Tight-Aggressive — Classic TAG strategy
5. Pot Odds Calculator — Math-based decisions
6. Position-Aware — Exploits position

**Advanced:**
7. Data-Driven — SQLite persistence, opponent modeling (VPIP/PFR/AF)
8. Monte Carlo — Hand equity simulation, EV calculations
9. Adaptive Exploiter — Real-time pattern detection, exploit strategies
10. Tournament ICM — Independent Chip Model, bubble factor, push/fold

---

## Edge Case Handling

### Cash Game: Last Player Standing
When only 2 players remain in a cash game and one leaves:
1. `handlePlayerLeave()` detects single remaining player
2. Game status set to "finished"
3. Remaining player's chips preserved
4. WebSocket broadcasts `gameFinished` event
5. Final state persisted to database

### Player Leaves During Hand
When a player disconnects or times out mid-hand:
1. Automatic fold applied via `handleBotTimeout()`
2. Strike counter incremented
3. If 3 consecutive strikes: `disconnected = true`
4. If last 2 players and one disconnects:
   - Hand immediately completed
   - Pot awarded to remaining player
   - Game finishes

### Tournament: Single Table, 2 Players, One Leaves
When down to 2 players on the final table and one busts/disconnects:
1. Remaining player declared tournament winner
2. `finishTournament()` called
3. Payouts calculated and distributed
4. All entries updated with finish positions
5. Tournament status → "finished"

### Tournament: Multi-Table Rebalancing
When a table drops to 1 player:
1. `_onTableNeedsRebalance()` triggered
2. Find tables with available seats
3. Move player to table with most empty seats
4. If no seats available: wait for other tables
5. Record move in `tournament_seat_history`
6. Original table status → "broken"

### Out-of-Turn Action Requests
When a bot sends an action but it's not their turn:
1. WebSocket receives `action` event
2. Check `game.currentPlayerId === bot.id`
3. If mismatch: emit `error` event with `InvalidTurnError`
4. No strike applied (could be network race)
5. Current player's turn continues normally
6. Client receives `currentPlayerId` in next state update

---

## Tournament Lifecycle

```
Server startup
  └─→ Tournaments loaded from database

Bot developer:
  POST /auth/register  →  JWT token
  POST /bots           →  bot_id  (validation runs)
  POST /tournaments/:id/register  →  entry confirmed

TournamentDirector.start() [triggered at min_players]
  └─→ Random seat assignment
  └─→ Blind level 1
  └─→ GameRecorder attached to each table

  Every hand (all tables):
    antes posted → SB/BB posted → deal → bet → showdown
    recorder captures everything → bot_stats updated

  Every 10 global hands:
    blind level advances → all tables updated

  When table ≤ 4 players + absorb room:
    table breaks → players redistributed

  When activeBots.size ≤ 9 and tables.size > 1:
    final table (table_number=99) → status='final_table'

  When activeBots.size === 1:
    payouts calculated → status='finished'
```

---

## Bot Protocol

### Request (server → bot)
```json
{
  "gameId": "uuid",
  "handNumber": 42,
  "stage": "flop",
  "you": {
    "name": "Bot Alpha",
    "chips": 4200,
    "holeCards": [{ "value": 14, "suit": "spades" }, { "value": 13, "suit": "hearts" }],
    "bet": 100,
    "position": "CO",
    "bestHand": { "name": "ONE_PAIR", "cards": [...] }
  },
  "action": {
    "canCheck": false,
    "toCall": 200,
    "minRaise": 400,
    "maxRaise": 4000
  },
  "table": {
    "pot": 850,
    "currentBet": 300,
    "communityCards": [...],
    "smallBlind": 75,
    "bigBlind": 150,
    "ante": 25
  },
  "players": [...]
}
```

### Response (bot → server)
```json
{ "type": "fold" }
{ "type": "check" }
{ "type": "call" }
{ "type": "raise", "amount": 300 }
{ "type": "all_in" }
```

### Fault Handling
| Situation | Behavior |
|-----------|----------|
| Timeout / error / invalid | Strike + penalty fold |
| 3rd consecutive strike | Disconnect — sits out all future hands |
| Any successful response | Strikes reset to 0 |

---

## API Reference

### Public Endpoints
```
POST /auth/register     — Create account
POST /auth/login        — Get JWT token
GET  /bots              — List bots
GET  /bots/:id          — Get bot details
GET  /tournaments       — List tournaments
GET  /tournaments/:id   — Get tournament details
GET  /leaderboard       — Global leaderboard
GET  /health            — Health check
```

### Protected Endpoints (JWT Required)
```
GET    /users/me          — Current user profile
PATCH  /users/me          — Update profile
POST   /bots              — Register bot
PATCH  /bots/:id          — Update bot
DELETE /bots/:id          — Deactivate bot
POST   /bots/:id/validate — Run validation
POST   /tournaments/:id/register  — Enter tournament
GET    /games/:id/hands   — Hand history
```

### Admin Endpoints (Admin Role Required)
```
GET    /users             — List all users
PATCH  /users/:id         — Update any user
POST   /tournaments       — Create tournament
DELETE /tournaments/:id   — Cancel tournament
```

---

## WebSocket Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `subscribe` | `{ tableId: string }` | Join table room |
| `unsubscribe` | `{ tableId: string }` | Leave table room |
| `registerBot` | `{ botId: string, apiKey: string }` | Authenticate bot |
| `action` | `{ type, amount? }` | Send action |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `gameState` | Full game state | Broadcast after every action |
| `privateState` | Hole cards, best hand | Sent only to owning bot |
| `handResult` | Winners, pot distribution | After showdown |
| `playerAction` | Player's action | After action processed |
| `tournamentUpdate` | Tournament state | Status changes |
| `error` | Error details | Invalid action, etc. |

---

## Testing Strategy

### Unit Tests (Vitest)
```bash
npm run test           # Run all tests
npm run test:watch     # Watch mode
npm run test:cov       # Coverage report
```

Test coverage:
- Hand evaluator (all ranks, edge cases)
- Pot manager (side pots, odd chips)
- Betting round (action validation)
- Chip invariants (conservation checks)

### Simulation Testing
```bash
npm run simulate                    # Default 9-bot simulation
npm run simulate -- --bots=18      # 18-bot multi-table
npm run simulate -- --deterministic # Reproducible run
```

Options:
- `--bots=N` — Number of bots (default: 9)
- `--hands=N` — Max hands to play (default: 1000)
- `--deterministic` — Seeded RNG for reproducibility
- `--personalities=a,b,c` — Bot mix to use

### CI Pipeline
```yaml
jobs:
  lint-and-test:
    - npm run lint
    - npm run typecheck
    - npm run test
  build-docker:
    - docker build
  security-scan:
    - npm audit
```

---

## Security Summary

| Control | Status |
|---------|--------|
| JWT authentication | ✅ |
| API key hashing (SHA-256) | ✅ |
| Rate limiting (Throttler) | ✅ |
| Input validation (class-validator) | ✅ |
| RBAC (roles guard) | ✅ |
| Audit logging | ✅ |
| Chip movement tracking | ✅ |
| Bot endpoint validation | ✅ |
| TLS | ⚠️ Operator (nginx/Caddy) |
| HMAC bot payload signing | 🔲 Planned |

Full details: `SECURITY.md`
