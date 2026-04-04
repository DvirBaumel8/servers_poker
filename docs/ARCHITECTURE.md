# Poker Engine — Architecture

## Overview

A No-Limit Texas Hold'em tournament platform where users build bots via the BotBuilder UI. Bots use in-process strategy evaluation — no external HTTP servers required. The game engine calls `StrategyEngineService.evaluateStrategy()` directly during gameplay.

```
┌───────────────────────────────────────────────────────────────┐
│                       NestJS Game Server                       │
│  POST /auth/register          — create account (UI flow)       │
│  POST /auth/register-developer — create account + bot (API)    │
│  POST /auth/login             — get JWT token                  │
│  POST /bots                   — register a bot                 │
│  GET  /tournaments            — list tournaments               │
│  POST /tournaments/:id/register — enter tournament             │
│  WS   /game                   — real-time push (Socket.IO)     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  StrategyEngineService (in-process bot evaluation)      │   │
│  │  Bot A strategy (JSONB) ──→ evaluateStrategy() → action │   │
│  │  Bot B strategy (JSONB) ──→ evaluateStrategy() → action │   │
│  └─────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Backend
- **Runtime:** Node.js 22+
- **Framework:** NestJS
- **Database:** PostgreSQL with TypeORM
- **Cache/State:** Redis (for horizontal scaling, WebSocket sync)
- **Authentication:** JWT (users)
- **WebSocket:** Socket.IO via @nestjs/websockets
- **Testing:** Vitest

### Frontend
- **Framework:** React 19 with TypeScript
- **State:** Zustand
- **Styling:** Tailwind CSS
- **Animations:** Framer Motion
- **Build:** Vite
- **Component docs:** Storybook
- **Frontend tests:** Vitest + Testing Library

---

## Directory Structure

```
servers_poker/
├── src/
│   ├── main.ts                      — Application bootstrap (NestJS entry)
│   ├── app.module.ts                — Root module
│   ├── config/
│   │   ├── database.config.ts       — TypeORM/PostgreSQL configuration
│   │   ├── typeorm.config.ts        — TypeORM CLI configuration
│   │   ├── tournaments.config.ts    — Tournament settings
│   │   └── app.config.ts            — Application settings
│   ├── domain/
│   │   ├── handEvaluator.ts         — Poker hand evaluation
│   │   ├── betting.ts               — Pot manager and betting round logic
│   │   └── deck.ts                  — Card deck utilities
│   ├── entities/
│   │   ├── user.entity.ts           — User account
│   │   ├── bot.entity.ts            — Bot registration
│   │   ├── bot-stats.entity.ts      — Bot performance statistics
│   │   ├── bot-event.entity.ts      — Bot activity events
│   │   ├── bot-subscription.entity.ts — Bot auto-registration subscriptions
│   │   ├── tournament.entity.ts     — Tournament definition
│   │   ├── tournament-entry.entity.ts — Tournament registrations
│   │   ├── tournament-table.entity.ts — Tournament table assignments
│   │   ├── tournament-seat.entity.ts — Tournament seat assignments
│   │   ├── tournament-seat-history.entity.ts — Seat movement history
│   │   ├── tournament-blind-level.entity.ts — Blind structure
│   │   ├── game.entity.ts           — Game session
│   │   ├── game-player.entity.ts    — Game player assignments
│   │   ├── table.entity.ts          — Table configuration
│   │   ├── table-seat.entity.ts     — Table seat assignments
│   │   ├── hand.entity.ts           — Individual hand
│   │   ├── hand-player.entity.ts    — Hand participant details
│   │   ├── hand-seed.entity.ts      — Provably fair hand seeds
│   │   ├── action.entity.ts         — Player action
│   │   ├── audit-log.entity.ts      — Request audit trail
│   │   ├── chip-movement.entity.ts  — Chip transaction log
│   │   ├── game-state-snapshot.entity.ts — Persisted game state for recovery
│   │   ├── analytics-event.entity.ts — Frontend event tracking
│   │   ├── platform-metrics.entity.ts — Daily platform statistics
│   │   └── daily-summary.entity.ts  — Daily email summary records
│   ├── common/
│   ├── repositories/
│   │   ├── base.repository.ts       — Abstract base with CRUD operations
│   │   ├── user.repository.ts       — User data access (extends BaseRepository)
│   │   ├── bot.repository.ts        — Bot data access (extends BaseRepository)
│   │   ├── tournament.repository.ts — Tournament data access (extends BaseRepository)
│   │   ├── game.repository.ts       — Game/hand data access (extends BaseRepository)
│   │   ├── table.repository.ts      — Table management (extends BaseRepository)
│   │   ├── game-state.repository.ts — Game state snapshots (extends BaseRepository)
│   │   ├── hand-seed.repository.ts  — Provably fair seeds (extends BaseRepository)
│   │   └── analytics.repository.ts  — Multi-entity analytics queries (standalone)
│   ├── modules/
│   │   ├── auth/                    — JWT authentication
│   │   ├── users/                   — User management
│   │   ├── bots/                    — Bot CRUD, strategy management, subscriptions
│   │   ├── tournaments/             — Tournament lifecycle (incl. TournamentDirectorService)
│   │   ├── games/                   — Tables, game joining, WebSocket
│   │   ├── analytics/               — Platform analytics and event tracking
│   │   ├── health/                  — Health check endpoints
│   │   ├── metrics/                 — Prometheus metrics collection
│   │   └── preview/                 — Preview/demo functionality
│   ├── services/
│   │   ├── game/
│   │   │   ├── live-game-manager.service.ts — Game state management (concurrency-safe, supports Redis sync)
│   │   │   ├── game-worker-manager.service.ts — Worker thread game isolation
│   │   │   ├── game-data-persistence.service.ts — Transactional state persistence to DB with retry
│   │   │   ├── game-state-persistence.service.ts — Game state snapshots
│   │   │   ├── game-recovery.service.ts — Auto-recovery on server restart
│   │   │   └── game-ownership.service.ts — Distributed locking for multi-instance
│   │   ├── redis/
│   │   │   ├── redis-game-state.service.ts — Redis state persistence
│   │   │   ├── redis-event-bus.service.ts — Cross-instance event pub/sub
│   │   │   ├── redis-health.service.ts — Redis health monitoring
│   │   │   └── redis-socket-state.service.ts — WebSocket connection state
│   │   ├── bot/
│   │   │   ├── bot-activity.service.ts — Real-time bot activity tracking
│   │   │   └── bot-auto-registration.service.ts — Auto-register bots in tournaments
│   │   ├── provably-fair.service.ts — HMAC commit-reveal deck shuffling
│   │   ├── hand-seed-persistence.service.ts — Persist seeds to database
│   │   ├── platform-analytics.service.ts — Platform-wide analytics
│   │   ├── daily-summary.service.ts — Daily email reports
│   │   └── email.service.ts         — Email sending service
│   ├── workers/
│   │   ├── game.worker.ts           — Isolated game execution in worker thread
│   │   └── messages.ts              — Worker message protocol types
│   ├── migrations/
│   │   └── 1742600000000-FullSchema.ts — Single merged migration (all tables, constraints, indexes)
│   ├── common/
│   │   ├── guards/                  — JWT, roles guards
│   │   ├── interceptors/            — Logging, audit, timeout
│   │   ├── filters/                 — Exception handling
│   │   ├── decorators/              — Custom decorators
│   │   ├── pipes/                   — Validation pipes
│   │   ├── validators/              — Custom validators
│   │   ├── redis/                   — Redis client infrastructure
│   │   │   ├── redis.module.ts      — NestJS module
│   │   │   ├── redis.service.ts     — Core Redis client wrapper
│   │   │   ├── redis-pubsub.service.ts — Pub/sub connections
│   │   │   └── redis-io.adapter.ts  — Socket.IO Redis adapter
│   │   └── security/                — Security services
│   ├── game/
│   │   ├── poker-game.service.ts    — Game engine (hardened)
│   │   └── invariants.ts            — Chip conservation checks
│   └── simulation/
│       ├── simulation-engine.ts     — Automated game testing
│       ├── simulation-reporter.ts   — Results analysis
│       └── runner.ts                — CLI entry point
├── frontend/                          — React SPA (Vite + TypeScript)
│   ├── src/
│   │   ├── App.tsx                  — Main router with shell split + route guards
│   │   ├── main.tsx                 — React entry point
│   │   ├── components/              — React components
│   │   │   ├── game/                — Gameplay HUD, table, seats, result surfaces
│   │   │   │   ├── common/              — PlayingCard, PokerChipStack, Timer, ErrorBoundary
│   │   │   ├── tournament/          — TournamentCard, LeaderboardTable
│   │   │   ├── ui/                  — Shared FE primitives
│   │   │   ├── auth/                — Authentication components
│   │   │   └── layout/              — Marketing, auth, product, and game shells
│   │   ├── pages/                   — Route pages
│   │   │   ├── Home.tsx             — Marketing landing page
│   │   │   ├── Tables.tsx           — Cash game lobby
│   │   │   ├── GameView.tsx         — Live game shell with HUD + side activity
│   │   │   ├── Tournaments.tsx      — Tournament lobby
│   │   │   ├── TournamentDetail.tsx — Tournament workspace
│   │   │   ├── Bots.tsx             — Bot directory + owned bot workspace
│   │   │   ├── BotBuilder.tsx       — No-code bot creation wizard (tier/personality/rules)
│   │   │   ├── BotProfile.tsx       — Bot performance + subscriptions workspace
│   │   │   ├── Leaderboard.tsx      — Rankings workspace
│   │   │   ├── Profile.tsx          — Account + bot ownership workspace
│   │   │   ├── AdminAnalytics.tsx   — Admin analytics workspace
│   │   │   ├── AdminTournaments.tsx — Admin tournament management
│   │   │   ├── Login.tsx            — Authentication
│   │   │   ├── Register.tsx         — Registration
│   │   │   ├── VerifyEmail.tsx      — Email verification
│   │   │   ├── ForgotPassword.tsx   — Password reset request
│   │   │   └── ResetPassword.tsx    — Password reset form
│   │   ├── hooks/                   — Custom hooks
│   │   │   ├── useWebSocket.ts      — Socket.IO connection to /game
│   │   │   └── useKeyboardNav.ts    — Cmd+1..4 keyboard shortcuts for nav
│   │   ├── stores/                  — Zustand stores
│   │   │   ├── authStore.ts         — JWT + user state (persisted)
│   │   │   ├── gameStore.ts         — Current game state
│   │   │   ├── tournamentStore.ts   — Tournament state
│   │   │   └── toastStore.ts        — Toast notification state + toast() helper
│   │   ├── api/                     — API clients
│   │   │   ├── client.ts            — Base fetch wrapper
│   │   │   ├── auth.ts              — Login/register/me
│   │   │   ├── games.ts             — Tables/state/history
│   │   │   ├── bots.ts              — Bot CRUD and subscriptions
│   │   │   ├── tournaments.ts       — Tournament CRUD
│   │   │   └── analytics.ts         — Analytics API client
│   │   ├── utils/
│   │   │   ├── logger.ts            — Frontend logging utility
│   │   │   ├── analytics.ts         — Event tracking utility
│   │   │   └── timing.ts            — Centralized timing constants for UI
│   │   ├── test/                    — Frontend test setup utilities
│   │   └── types/                   — TypeScript types
│   └── public/                      — Static assets
├── tests/
│   ├── unit/                        — Vitest unit tests
│   ├── integration/                 — Integration tests
│   ├── e2e/                         — End-to-end tests
│   └── qa/
│       ├── simulations/             — Game simulation tests
│       ├── performance/             — Load and performance tests
│       └── chaos/                   — Chaos engineering tests
├── docs/
│   ├── ARCHITECTURE.md              — This file
│   ├── KNOWLEDGE.md                 — Design decisions
│   ├── DATA_DICTIONARY.md           — Database schema
│   ├── API.md                       — API reference
│   ├── GAME_RULES.md                — Poker rules
│   ├── TOURNAMENT_RULES.md          — Tournament format
│   ├── TESTING.md                   — Test strategy
│   ├── TECH_DEBT.md                 — Technical debt tracking
│   ├── MONITORING.md                — Observability setup
│   ├── guides/
│   │   ├── QUICKSTART.md            — 5-minute getting started
│   │   ├── DEPLOYMENT.md            — Production deployment
│   │   ├── SECURITY.md              — Security architecture
│   │   ├── BOT_DEVELOPER_GUIDE.md   — Bot development guide
│   ├── adr/                         — Architecture Decision Records
│   ├── reports/                     — QA and audit reports
│   └── AI_CONTEXT.md                — Context for AI assistants
```

---

## Frontend Runtime Architecture

The redesigned frontend is organized around explicit shells:

- `MarketingLayout`
  - public landing experience
- `AuthLayout`
  - login, registration, verification, and password recovery
- `Layout`
  - main product workspace for lobbies, workspaces, profile, and admin analytics
- `GameLayout`
  - isolated gameplay surface for `/game/:tableId`

The shared FE design system lives in:

- `frontend/tailwind.config.js`
- `frontend/src/index.css`
- `frontend/src/components/ui/primitives.tsx`

This system centralizes:

- tokens for color, panel surfaces, lines, shadows, and status semantics
- shared page scaffolding (`PageShell`, `PageHeader`, `SurfaceCard`, `Breadcrumbs`)
- shared interaction patterns (`Button`, `TextField`, `SegmentedTabs`)
- shared state patterns (`LoadingBlock`, `EmptyState`, `AlertBanner`, `AppModal`, `ConfirmDialog`)
- skeleton loading screens (`Skeleton`, `SkeletonMetricCards`, `SkeletonPageHeader`, `SkeletonCard`, `SkeletonTable`)
- toast notification system (`ToastContainer`, `useToastStore`, `toast()` helper)
- page transition animations via framer-motion `AnimatePresence` in `Layout`
- keyboard navigation shortcuts (`useKeyboardNav` — Cmd/Ctrl+1..4 for main nav)

See `docs/FRONTEND_UI_SYSTEM.md` for the FE-specific rules and contribution model.

## Core Components

### Repository Pattern

All data access follows a consistent repository pattern:

```
┌─────────────────────────────────────────────────────────────┐
│                     BaseRepository<T>                        │
│  - findById(id, manager?)                                   │
│  - findAll(manager?)                                        │
│  - create(data, manager?)                                   │
│  - update(id, data, manager?)                               │
│  - delete(id, manager?)                                     │
│  - transaction(dataSource, operation)                       │
└─────────────────────────────────────────────────────────────┘
                              ▲
    ┌─────────────────────────┼─────────────────────────┐
    │                         │                         │
UserRepository          BotRepository          GameRepository
    │                         │                         │
    └─── findByEmail()        └─── findByUserId()       └─── getHandHistory()
                                    findActiveByUserId()      addGamePlayer()
```

**Key Principles:**
- Services inject custom repositories, never `@InjectRepository` directly
- All repositories extend `BaseRepository` for CRUD operations
- Exception: `AnalyticsRepository` is standalone (multi-entity queries)
- Optional `EntityManager` parameter enables transaction support

### NestJS Modules

#### AuthModule
Handles user authentication.
- JWT access token generation and validation (short-lived, configurable via `JWT_EXPIRES_IN`)
- Refresh token mechanism with rotation (7-day opaque tokens, SHA-256 hashed in DB)
- `POST /auth/refresh` — exchange refresh token for new access + refresh pair
- `POST /auth/logout` — revoke refresh token
- Password hashing with bcrypt (12 rounds)
- Email verification (2-step signup, `crypto.randomInt()` codes)
- Password reset flow
- Account lockout after 5 failed login attempts (15-minute lockout)
- Guards for route protection

#### UsersModule
User account management.
- Profile updates
- Role management (admin/user)
- Account deactivation

#### BotsModule
Internal strategy-based bot management.
- CRUD operations for bots
- Strategy-based bot creation via BotBuilder
- Stats tracking
- **BotsInternalController** (`bots-internal.controller.ts`, route prefix `bots/internal`):
  - `GET /presets` — public; returns `{ presets }` for bot-builder personality presets (8 presets)
  - `GET /condition-fields` — public; returns `{ fields }` for rule-builder condition definitions (19 fields)
  - `POST /` — JWT + `operate:bots` scope; creates an internal bot via `CreateInternalBotDto` and `BotsService.create()`; rate limited (10/hour)

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

#### AnalyticsModule
Platform-wide analytics and reporting.
- Platform statistics (public and admin)
- Frontend event tracking
- Daily summary emails
- Metrics history

#### HealthModule
Application health monitoring.
- `GET /health` — Overall health status
- Redis connectivity check
- Database connectivity check

#### MetricsModule
Prometheus metrics collection.
- `GET /metrics` — Prometheus-compatible metrics
- Request/response timing
- Game and tournament counters
- Bot performance metrics

#### PreviewModule
Demo and preview functionality for unauthenticated users.

### Game Engine (`src/game/`)

#### PokerGameService _(deprecated — superseded by GameInstance)_
The original poker engine. DB-free and tournament-agnostic. New games use `GameInstance` via the worker thread architecture; this service remains for reference but should not be used for new features.
- Auto-starts at 2+ players, runs until one player holds all chips
- Each hand: antes → blinds → pre-flop → flop → turn → river → showdown
- 3-strike fault tolerance with configurable timeout
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

### Worker Thread Architecture (`src/workers/`)

Optional game isolation using Node.js worker threads. Each game runs in a separate V8 isolate for fault tolerance and CPU distribution.

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Thread                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ GameWorkerManagerService                                 ││
│  │ - Spawns/manages worker threads                         ││
│  │ - Routes messages via MessagePort                        ││
│  │ - Handles crashes and recovery                          ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                  │
│              ┌────────────┼────────────┐                    │
│              ▼            ▼            ▼                    │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐     │
│  │ Worker 1      │ │ Worker 2      │ │ Worker N      │     │
│  │ (Game A)      │ │ (Game B)      │ │ (Game X)      │     │
│  │ - GameInstance│ │ - GameInstance│ │ - GameInstance│     │
│  │ - Strategy   │ │ - Strategy   │ │ - Strategy   │     │
│  │   evaluation │ │   evaluation │ │   evaluation │     │
│  └───────────────┘ └───────────────┘ └───────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

#### Message Protocol (`messages.ts`)
Type-safe communication between main thread and workers:
- **Commands (Main→Worker):** `ADD_PLAYER`, `REMOVE_PLAYER`, `STOP`, `GET_STATE`, `UPDATE_BLINDS`
- **Events (Worker→Main):** `STATE_UPDATE`, `HAND_STARTED`, `PLAYER_ACTION` (includes `chipsAfter` for persistence/clients), `HAND_COMPLETE`, `GAME_FINISHED`, `ERROR`, `LOG`

#### GameWorkerManagerService
Worker lifecycle management:
- `createGame(config, players?)` — Spawns new worker
- `addPlayer(tableId, player)` — Sends ADD_PLAYER command
- `stopGame(tableId)` — Graceful shutdown with termination fallback
- `getGameState(tableId)` — Returns cached state
- Automatic crash recovery via `game.workerCrash` event

#### Configuration
```bash
ENABLE_WORKER_THREADS=true   # Enable worker isolation (default: false)
MAX_CONCURRENT_GAMES=100     # Worker pool limit
WORKER_TIMEOUT=30000         # Worker termination timeout (ms)
```

#### Benefits
1. **Fault Isolation:** One game crash doesn't affect others
2. **CPU Distribution:** Games utilize multiple CPU cores, including strategy evaluation
3. **Memory Isolation:** Each worker has independent heap
4. **Foundation for Scaling:** Message-passing enables future Redis pub/sub

### GameInstance Concurrency Protection (`live-game-manager.service.ts`)

`GameInstance` (the per-game state object inside `LiveGameManagerService`) guards against mutations during active hands:

- **`handInProgress` flag** — set `true` while a hand is running.
- **`pendingMutations` queue** — `addPlayer()` and `removePlayer()` calls that arrive mid-hand are deferred and replayed after the hand completes.
- **`activePlayers()`** — filters out disconnected players so they don't receive actions or count toward quorum.
- **`removePlayer()` chip accounting** — adjusts `expectedTotalChips` to account for chips already committed to the pot, preventing false chip-conservation violations.
- **`RecoverySnapshot` interface** — typed replacement for the previous `snapshot: any`, with validation of required fields and automatic `expectedTotalChips` recalculation on recovery.
- **`setExpectedTotalChips()`** — explicit setter used by recovery and test code.

### Transactional Hand Persistence (`game-data-persistence.service.ts`)

- **`onHandStarted`** saves the `hand` row and all `hand_players` rows inside a single database transaction, preventing orphaned records if the write is interrupted.
- **`withRetry()` utility** — wraps retriable database operations (connection resets, serialization failures) with configurable attempts.
- **Blind/ante chip movements** are now `await`-ed with retry instead of fire-and-forget `.catch()`.
- **Post-hand chip movements** use `Promise.all` with per-movement retries instead of `Promise.allSettled`, so failures surface instead of being silently swallowed.

### Provably Fair RNG (`src/services/provably-fair.service.ts`)

The platform implements a cryptographically verifiable deck shuffling system using HMAC-SHA256 commit-reveal scheme. This ensures players can verify that each hand was shuffled fairly.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          Provably Fair Flow                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  BEFORE HAND (Commitment)                                                    │
│  ┌─────────────────────────────────────────────────────────────────┐         │
│  │ 1. Generate serverSeed (32 random bytes)                        │         │
│  │ 2. Generate clientSeed (16 random bytes)                        │         │
│  │ 3. Compute serverSeedHash = SHA256(serverSeed)                  │         │
│  │ 4. Share serverSeedHash + clientSeed with players               │         │
│  │    (serverSeed remains SECRET)                                  │         │
│  └─────────────────────────────────────────────────────────────────┘         │
│                              │                                               │
│                              ▼                                               │
│  DURING HAND (Shuffle)                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐         │
│  │ combinedHash = HMAC-SHA256(serverSeed, clientSeed + ":" + nonce)│         │
│  │ deckOrder = deterministic_shuffle(combinedHash)                 │         │
│  │ shuffledDeck = apply_order(standardDeck, deckOrder)             │         │
│  └─────────────────────────────────────────────────────────────────┘         │
│                              │                                               │
│                              ▼                                               │
│  AFTER HAND (Reveal)                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐         │
│  │ Reveal serverSeed + deckOrder to players                        │         │
│  │ Persist to hand_seeds table for audit                           │         │
│  └─────────────────────────────────────────────────────────────────┘         │
│                              │                                               │
│                              ▼                                               │
│  VERIFICATION (Player)                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐         │
│  │ 1. Check: SHA256(serverSeed) === serverSeedHash (commitment)    │         │
│  │ 2. Recompute: deckOrder from seeds                              │         │
│  │ 3. Verify: deckOrder matches what was used                      │         │
│  └─────────────────────────────────────────────────────────────────┘         │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

#### Key Components
- **ProvablyFairService** — Core HMAC/hashing logic and verification
- **HandSeedPersistenceService** — Event listener that persists seeds to database
- **HandSeedRepository** — Data access for seed storage/retrieval
- **HandSeed Entity** — Database schema for seed storage

#### API Endpoints
- `POST /api/v1/games/verify-hand` — Verify a hand with provided seeds
- `GET /api/v1/games/provably-fair/info` — Algorithm explanation
- `GET /api/v1/games/:gameId/seeds` — All seeds for a game
- `GET /api/v1/games/:gameId/seeds/:handNumber` — Specific hand seed

#### Security Properties
- Server cannot predict player actions when committing
- Server cannot change shuffle after commitment (hash binding)
- Players can independently verify without trusting server
- All seeds persisted for post-game audit

### Analytics & Reporting (`src/modules/analytics/`, `src/services/`)

Platform-wide analytics and daily reporting for investor metrics.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         Analytics Architecture                              │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌──────────────────────┐    ┌──────────────────────┐                     │
│  │ Frontend (React)     │    │ Email Recipients     │                     │
│  │ - Home page stats    │    │ - Daily summaries    │                     │
│  │ - Admin dashboard    │    │ - Admin alerts       │                     │
│  │ - Event tracking     │    └──────────────────────┘                     │
│  └──────────┬───────────┘               ▲                                  │
│             │                           │                                  │
│             ▼                           │                                  │
│  ┌──────────────────────────────────────┴───────────────────────────────┐ │
│  │                      AnalyticsController                              │ │
│  │  GET  /platform/stats         — Public platform statistics           │ │
│  │  GET  /admin/stats            — Admin-only detailed stats + history  │ │
│  │  POST /events                 — Record frontend events               │ │
│  │  POST /admin/trigger-summary  — Manual daily summary trigger         │ │
│  │  GET  /events/summary         — Event type counts                    │ │
│  │  GET  /metrics/history        — Historical metrics                   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                              │                                             │
│                              ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                    PlatformAnalyticsService                           │ │
│  │  - getLifetimeStats()     — Total users, bots, hands, tournaments    │ │
│  │  - getTodayStats()        — Daily metrics (new users, active bots)   │ │
│  │  - getLiveStats()         — Real-time (active games, hands/min)      │ │
│  │  - getHealthStats()       — Performance (response times, errors)     │ │
│  │  - getTopPerformers()     — Leaderboard by net chips                 │ │
│  │  - saveDailyMetrics()     — Persist daily snapshot                   │ │
│  │  - getMetricsHistory()    — Trend data for charts                    │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                              │                                             │
│                              ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                      DailySummaryService                              │ │
│  │  @Cron(EVERY_DAY_AT_8AM)  — Scheduled email trigger                  │ │
│  │  @Cron(EVERY_DAY_AT_MIDNIGHT) — Save daily metrics snapshot          │ │
│  │  sendDailySummary()       — Generate and send HTML/text emails       │ │
│  │  triggerManualSummary()   — Admin-triggered immediate send           │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

#### Entities
- **PlatformMetrics** — Daily snapshots of platform statistics for trend analysis
- **AnalyticsEvent** — Frontend event tracking (page views, user actions)
- **DailySummary** — Records of sent daily email summaries

#### Configuration
```bash
DAILY_SUMMARY_ENABLED=true              # Enable daily email summaries
DAILY_SUMMARY_RECIPIENTS=admin@co.com   # Comma-separated recipient list
DAILY_SUMMARY_HOUR=8                    # Hour (UTC) to send summary
ANALYTICS_RETENTION_DAYS=90             # Event retention period
```

#### Frontend Integration
- **Home Page** — Real platform stats (not hardcoded)
- **Admin Dashboard** (`/admin/analytics`) — Charts, KPIs, top performers
- **Event Tracking** — Automatic page views, user action tracking

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

## API Reference

### Public Endpoints
```
POST /auth/register     — Create account (returns verification prompt)
POST /auth/verify-email — Verify email, get JWT + refresh token
POST /auth/login        — Login, get JWT + refresh token
POST /auth/refresh      — Exchange refresh token for new token pair
POST /auth/forgot-password — Send password reset code
POST /auth/reset-password  — Reset password with code
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
| `registerBot` | `{ botId: string }` | Register bot for updates |
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
| Rate limiting (Throttler) | ✅ |
| Input validation (class-validator) | ✅ |
| RBAC (roles guard) | ✅ |
| Audit logging | ✅ |
| Chip movement tracking | ✅ |
| Password hashing (bcrypt) | ✅ |
| Email verification (2-step) | ✅ |
| TLS | ⚠️ Operator (nginx/Caddy) |

Full details: `SECURITY.md`
