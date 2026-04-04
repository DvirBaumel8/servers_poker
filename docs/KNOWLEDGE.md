# Poker Engine — Knowledge Base

A running record of non-obvious design decisions, conventions, and gotchas.
Update this whenever a decision is made, reversed, or a new gotcha is discovered.

For data-specific decisions, see DATA_DICTIONARY.md.
For tournament rules, see GAME_RULES.md.
For security details, see SECURITY.md.

---

## Architecture Decisions

### NestJS Framework Migration (COMPLETE)
Fully migrated from custom HTTP server to NestJS. Old server code has been removed.

**Status**: Production-ready. All game logic runs through NestJS.

**Key Components**:
- `LiveGameManagerService` — In-memory game state, replaces `liveGames` object
- `TournamentDirectorService` — Tournament orchestration with scheduled starts
- `GamesGateway` — WebSocket for real-time updates, event-driven via EventEmitter2
- `GamesController` — REST endpoints for tables, joining, game state

**Migration Benefits**:
- Single entry point (`src/main.ts`)
- Dependency injection for clean service composition
- Guards for JWT and Role-based auth
- Interceptors for logging, audit, timeout handling
- Exception filters for standardized error responses
- WebSocket Gateway with Socket.IO for real-time game updates

### PostgreSQL Database Migration
Migrated from SQLite to PostgreSQL for production-grade data handling:
- `BIGINT` for all chip amounts (prevent overflow)
- `SERIALIZABLE` transactions for chip movements
- `JSONB` columns for flexible data storage (cards, hand details)
- `CHECK` constraints for chip amount validation (`chips >= 0`)
- Proper connection pooling via pg pool

### TypeORM Entity Layer
All database tables are TypeORM entities with:
- UUID primary keys (36-char strings)
- Proper foreign key relationships with CASCADE delete
- Indexed columns for common queries
- `created_at` and `updated_at` timestamps

### Repository Pattern
Consistent data access layer:
- `BaseRepository<T>` — abstract base with standard CRUD operations
- All entity repositories extend `BaseRepository` (User, Bot, Game, Table, Tournament, GameState)
- Exception: `AnalyticsRepository` is standalone (multi-entity aggregation queries)
- Services inject custom repositories, never `@InjectRepository` directly
- Optional `EntityManager` parameter enables transaction support

**Key Rule:** No service should use `@InjectRepository(Entity)`. Always use the corresponding repository class.

### `PokerGame` is DB-free and tournament-agnostic
No imports from database or tournament modules in the game engine. This keeps it testable in isolation. The `GameRecorder` attaches via callbacks to persist data.

### WebSocket Gateway replaces custom ws.js
The NestJS WebSocket Gateway using Socket.IO replaces the custom RFC 6455 implementation. Benefits:
- Room-based subscriptions per table
- Authenticated connections via JWT
- Type-safe event handling
- Built-in reconnection handling

### Frontend Integration
React SPA in `/frontend` connects to NestJS backend:

**API Connection:**
- Vite dev server proxies `/api/*` to `localhost:3000`
- Base path: `/api/v1` (set in backend via `app.setGlobalPrefix`)
- Auth via JWT Bearer tokens stored in localStorage (Zustand persist)

**WebSocket Connection:**
- Connects to `/game` namespace via Socket.IO
- Events: `gameState`, `handStarted`, `handResult`, `gameFinished`, `playerLeft`, `playerAction`
- Frontend hook: `useWebSocket(tableId, { token })` handles connection lifecycle

### API-Only Developer Registration

Developers can register and create an internal bot without using the UI:

```bash
curl -X POST http://localhost:3000/api/v1/auth/register-developer \
  -H "Content-Type: application/json" \
  -d '{
    "email": "developer@example.com",
    "name": "Bot Developer",
    "password": "SecurePass123",
    "botName": "MyPokerBot",
    "botDescription": "My first poker bot"
  }'
```

**Response:**
```json
{
  "accessToken": "jwt...",
  "expiresIn": 86400,
  "apiKey": "pk_...",
  "user": { "id": "...", "email": "...", "name": "..." },
  "bot": { "id": "...", "name": "MyPokerBot", "strategy": {} }
}
```

The bot is created with a default strategy and can be customized later via the BotBuilder UI at `/bots/build`.

**Security Features:**
- Rate limited: 3 requests per IP per hour
- Input validation: Strict validation on all fields (email, password complexity, bot name format)
- Max 10 bots per account
- Email verification skipped (tracked in TECH_DEBT.md)

**Development:**
- `npm run dev:all` — Runs both backend (3000) and frontend (3001) concurrently
- `npm run build:all` — Builds both for production

**Production:**
- Frontend served as static files (nginx or backend serving `/frontend/dist`)
- Or deployed separately (Vercel, Netlify) with API URL in env var

### Chip Conservation Invariants
Runtime assertions that run in production:
- `ChipInvariantChecker` validates total chips after every action
- `TransactionAuditLog` records all chip movements
- Violations throw `ChipConservationError` and halt the game

### Game State Persistence & Recovery
Server restarts no longer lose active games:

**Persistence (`GameStatePersistenceService`):**
- Game state saved to `game_state_snapshots` table every 5 seconds
- Configurable via `GAME_STATE_PERSIST_INTERVAL_MS`
- Stores: players, chips, hole cards, community cards, pot, stage, action log
- Each server instance gets unique ID for multi-server tracking

**Recovery (`GameRecoveryService`):**
- On startup, checks for recoverable games (< 30 min old by default)
- Validates: bots still active, enough players, state not stale
- Automatically recreates `GameInstance` from snapshot
- Notifies bots of recovery via optional `/recovery` endpoint
- Configuration: `GAME_AUTO_RECOVER=true`, `GAME_STATE_RECOVERY_WINDOW_MINUTES=30`

**Snapshot Lifecycle:**
- `active` → game in progress
- `recovered` → game restored on new server instance
- `completed` → game finished normally
- `orphaned` → recovery failed, game abandoned
- Old snapshots cleaned up after 7 days

### Redis State Synchronization (Horizontal Scaling)
Multi-instance deployment with shared game state:

**Architecture:**
- Single executor model: one instance owns each game's execution loop
- Other instances sync state via Redis and broadcast to their WebSocket clients
- Ownership uses distributed locking (Redis SET NX EX pattern)
- On owner failure, another instance can acquire ownership and recover
- Socket.IO uses Redis adapter for cross-instance WebSocket broadcasting

**Key Services:**
- `RedisService` — Core Redis client wrapper (ioredis)
- `RedisPubSubService` — Dedicated pub/sub connections
- `GameOwnershipService` — Distributed locking for games/tournaments
- `RedisGameStateService` — State persistence (Hash per game)
- `RedisEventBusService` — Cross-instance event distribution
- `RedisSocketStateService` — WebSocket connection state tracking
- `RedisIoAdapter` — Socket.IO Redis adapter for cross-instance broadcasts

**Socket.IO Redis Adapter:**
The `@socket.io/redis-adapter` enables WebSocket broadcasts to reach clients connected to any server instance. Without it, `server.to('room').emit()` only reaches clients on the same instance.

- Configured in `main.ts` via `RedisIoAdapter`
- Uses separate pub/sub Redis connections
- Falls back to in-memory adapter if Redis is unavailable
- No sticky sessions required (any client → any server → correct delivery)

**WebSocket State in Redis:**
- `poker:socket:{socketId}` → Socket metadata (instanceId, userId, botId)
- `poker:player:socket:{botId}` → Socket ID for bot messaging
- `poker:table:subscribers:{tableId}` → Hash of subscribed sockets
- `poker:bot:activity:subscribers:{botId}` → Hash of activity subscribers

**Redis Key Patterns:**
- `poker:game:ownership:{tableId}` → instance ID (with TTL)
- `poker:game:state:{tableId}` → Hash with snapshot, metadata
- `poker:tournament:ownership:{tournamentId}` → instance ID
- `poker:tournament:state:{tournamentId}` → Hash with tournament state
- `poker:events:{eventType}` → Pub/sub channels

**Timing:**
- Ownership TTL: 10 seconds
- Ownership renewal: every 3 seconds
- State TTL: 24 hours (cleanup of orphaned games)
- Socket state TTL: 1 hour (auto-refresh while connected)

**Configuration:**
```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=           # optional
REDIS_DB=0
REDIS_KEY_PREFIX=poker:
INSTANCE_ID=              # auto-generated UUID if not set
GAME_OWNERSHIP_TTL_MS=10000
GAME_OWNERSHIP_RENEWAL_MS=3000
```

**Backward Compatibility:**
- Works without Redis (falls back to in-memory mode)
- Redis services are optional injections
- `LiveGameManagerService.setRedisServices()` enables Redis mode at runtime
- Socket.IO falls back to in-memory adapter with warning logged

### Database Migrations
TypeORM migrations manage schema changes:
- `npm run migration:run` — Execute pending migrations
- `npm run migration:generate` — Auto-generate from entity changes
- `npm run migration:revert` — Rollback last migration
- **Never use `synchronize: true` in production**

### Worker Thread Game Isolation
Optional architecture where each game runs in a separate worker thread:

**Motivation:**
- Single-threaded Node.js can't utilize multiple CPU cores for game logic
- One buggy bot or game crash could affect all games on server
- Memory pressure from many concurrent games in single heap

**Implementation:**
- `GameWorkerManagerService` manages worker lifecycle
- `game.worker.ts` runs isolated `GameInstance` per thread
- Typed message protocol (`messages.ts`) for communication
- Feature flag: `ENABLE_WORKER_THREADS=false` (default off)

**Trade-offs:**
- Workers have higher memory overhead (~10MB per isolate)
- Message serialization cost for state updates
- Workers can't share NestJS DI container (use standalone HTTP client)
- More complex debugging (separate thread stacks)

**When to enable:**
- High concurrent game count (>50 games)
- CPU-bound game logic causing event loop delays
- Need fault isolation for untrusted bot interactions
- Multi-core server optimization

### One Bot Per Player Rule
A user can only have one bot in any given table or tournament:

**Tables:**
- When joining a table, if another bot owned by the same user is already seated, the join is rejected
- Error: "You already have a bot (BotName) seated at this table. Only one bot per player allowed."
- Enforced in `TableRepository.atomicJoinTable()` within SERIALIZABLE transaction

**Tournaments:**
- When registering for a tournament, if another bot owned by the same user is already registered, registration is rejected
- Error: "You already have a bot (BotName) registered in this tournament. Only one bot per player allowed."
- Enforced in `TournamentsService.register()` with bot ownership verification

**Rationale:**
- Prevents collusion between bots owned by the same player
- Ensures fair competition
- Simplifies chip conservation tracking per player

---

## Game Engine Decisions

### Antes posted before blinds
All active players post ante first, then SB and BB. Matches standard tournament ante structure.

### 3-strike disconnection, not immediate
A bot failure (timeout, error, invalid action) gets a strike and a penalty fold. After 3 **consecutive** failures it's disconnected. Strikes reset on any successful action.

### Penalty fold is recorded differently from intentional fold
`actions.is_penalty = true` when the server folded on the bot's behalf. Critical for detecting unstable bots vs conservative strategy.

### Auto-start deferred with `setImmediate`
`addPlayer()` triggers `startGame()` via `setImmediate` not synchronously. Allows tests to call `game.stop()` in the same tick before the loop starts.

### 4000ms sleep between hands
After each hand, the loop sleeps 4000ms. Gives the UI time to render the final state and prevents hands blurring in the log. Configurable via `sleepMs` in `GameInstance`.

---

## Edge Case Handling

### Cash Game: Last player standing
When only 2 players remain and one leaves:
- Game immediately stops
- Remaining player's chips are preserved
- Game status set to "finished"
- WebSocket broadcasts final state

### Player leaves during hand
When a player leaves mid-hand:
- Automatic fold applied
- Strike counter incremented
- If 3 strikes: disconnected status set
- If last 2 players and one disconnects: immediate hand completion

### Tournament: Single table with 2 players, one leaves
- Remaining player declared winner
- Tournament status set to "finished"
- Payouts calculated and distributed
- All entries updated with finish positions

### Tournament: Multi-table, one table down to 1 player
- Player moved to another table with available seats
- Table broken (status set to "broken")
- Seat history recorded
- If no other tables have room: final table formation triggered

### Out-of-turn action requests
When a bot sends an action but it's not their turn:
- Request rejected with error response
- No strike applied (could be race condition)
- Current player's turn continues normally
- WebSocket state shows correct `currentPlayerId`

### Simultaneous disconnections
When multiple bots disconnect at once:
- Each processed sequentially via `_handLock`
- Bust order determined by chip count at disconnection
- Tournament continues with remaining players

---

## Tournament Decisions

### Global hand count for blind advancement
Blind levels advance every 10 hands counted across ALL active tables simultaneously.

### Table breaking threshold is 4 players
When a table falls to ≤4 players AND another can absorb them without exceeding 9, it breaks.

### Final table = table_number 99
Convention for easy querying. When `activeBots.size ≤ 9` and `tables.size > 1`, all tables break and table 99 is created.

### Late entries receive full starting stack
Even at level 4, late entrants get full `starting_chips`. They're severely disadvantaged but that's intentional.

### `_handLock` prevents race conditions
Multiple tables complete hands near-simultaneously. `_handLock` prevents concurrent `_onHandComplete` calls from racing on bust detection and rebalancing.

---

## Security Decisions

### JWT Authentication
- Access tokens with configurable expiration (default 24h)
- Token validation on every authenticated request
- User context injected into request via decorator

### Rate Limiting
- Global rate limiting via @nestjs/throttler
- Configurable limits per endpoint
- Default: 100 requests per minute per IP

### Input Validation
- Strict DTO validation with class-validator
- Body size limit enforced
- SQL injection prevention via TypeORM parameters

### Audit Logging
- All requests logged with user, IP, action
- Sensitive fields redacted (passwords, API keys)
- Chip movements tracked separately

---

## Simulation System

### Deterministic mode
Seeded RNG allows reproducible simulations for debugging.

### Bot personalities
- `caller` - Calls most bets (VPIP 60%)
- `folder` - Folds frequently (VPIP 15%)
- `maniac` - Raises aggressively (VPIP 90%)
- `random` - Random valid actions
- `smart` - Position-aware decisions
- `crasher` - Tests error handling (high error rate)
- `slow` - Tests timeout handling

### Anomaly detection
Simulation tracks and reports:
- Chip conservation violations (CRITICAL)
- Bot timeouts and errors
- Invalid actions
- Statistical anomalies in hand distribution

---

## Conventions

### Card format
Internal: `{ value, suit }` where value is 2–14 (Ace=14).
Display: `"A♠"`, `"10♦"`, `"K♥"`. Hidden: `"??"`.

### Dealer rotation
`dealerIndex` advances by 1 each hand (`% players.length`). Broke/disconnected players skipped.

### Side pots
`PotManager.calculatePots()` runs at end of each betting street. Each pot has `eligiblePlayerIds`. Showdown awards each pot independently.

### Split Pot Odd Chip Distribution
`PotManager.distributePot(potAmount, winners, playerOrder, dealerIndex)` handles split pots with proper odd chip distribution:
- Odd chips go to players closest to the dealer button (dealer + 1 first)
- Example: $101 split 2 ways = $51 + $50, not $50.50 each
- Works for 2-way, 3-way, 4-way+ splits

### Short All-In Does Not Reopen Betting
When a player goes all-in for less than the minimum raise:
- `BettingRound.wasLastRaiseFull()` returns `false`
- `BettingRound.canReraise(playerId)` returns `false` for players who already acted
- `BettingRound.getValidActionsForPlayer(player)` excludes "raise" option
- Only call/fold allowed after short all-in

### Hand Cancellation/Rollback
`PokerGameService.rollbackHand()` restores game to start-of-hand state:
- Player chips restored from snapshot taken at `startHand()`
- Pot reset to zero, folded/allIn status cleared
- Emits `game.handCancelled` event
- Use case: server error, all players disconnect mid-hand

### Dead Button Rule
Button movement skips eliminated players:
- `advanceDealer()` skips disconnected players with 0 chips
- `getBlindPositions()` returns proper SB/BB positions relative to active players
- Heads-up: dealer is also small blind (`dealerSmallBlind` property)
- Ensures BB always advances (dead button rule, not moving button)

### All timestamps are ISO 8601
Stored as `TIMESTAMP WITH TIME ZONE` in PostgreSQL. Converted to ISO strings for API responses.

---

## Testing Strategy

### Simulation Test Framework

Integration tests that run real games through the actual backend services.

**Tiers:**
| Tier | Players | Duration | Run When |
|------|---------|----------|----------|
| Basic | 2 | ~30s | Every commit |
| Single-Table | 9 | ~2-5min | Daily/PR |
| Multi-Table | 30 | ~10-15min | Weekly/Release |

**Commands:**
```bash
npm run sim:basic    # Fast check
npm run sim:single   # Tournament mechanics
npm run sim:multi    # Full lifecycle
npm run sim:all      # Complete suite
npm run sim:ci       # CI mode (basic only, fail fast)
```

**Location:** `tests/qa/simulations/`

**Key Assertions:**
- Chip conservation: Total chips remain constant
- State consistency: DB matches in-memory
- Event propagation: Tournament tracks eliminations
- Error handling: Graceful recovery
- Completion: Proper end state reached

### Three-Tier Test Structure

**Unit Tests** (`tests/unit/`):
- Pure game logic (hand evaluation, pot management, betting)
- No external dependencies or mocks
- 161+ tests covering all edge cases
- Run: `npm run test:unit`

**Integration Tests** (`tests/integration/`):
- Multiple components together with mocked services
- Service layer testing without database
- Run: `npm run test:integration`

**E2E Tests** (`tests/e2e/`):
- Full API testing with real PostgreSQL database
- WebSocket connection testing
- Complete user flows (register → create bot → join table)
- Run: `npm run test:e2e` (requires PostgreSQL)

### Test Utilities

- `createStrategyBot()` — Factory for creating bots with specific strategies in tests
- `registerUserWithBot()` — Helper to register a user and create an internal bot in one step

### Running Tests

```bash
# Default: unit + integration tests
npm test

# All tests including E2E (requires PostgreSQL)
npm run test:all

# With coverage report
npm run test:cov

# E2E with Docker (spins up PostgreSQL automatically)
npm run test:e2e:docker
```

See `docs/TESTING.md` for complete testing documentation.

---

## Provably Fair RNG

### Overview
The platform implements a provably fair deck shuffling system using HMAC-SHA256 commit-reveal scheme. This allows players to verify that the shuffle was truly random and not manipulated after the fact.

### How It Works

1. **Before Each Hand (Commitment Phase)**:
   - Server generates a random 32-byte `serverSeed`
   - Server generates a random 16-byte `clientSeed`
   - Server computes `serverSeedHash = SHA256(serverSeed)`
   - Server shares the `serverSeedHash` (commitment) with players BEFORE dealing cards
   - The `serverSeed` remains secret during the hand

2. **Deck Shuffle (Deterministic)**:
   - `combinedHash = HMAC-SHA256(serverSeed, clientSeed + ":" + handNumber)`
   - The deck is shuffled deterministically using `combinedHash` as the random seed
   - Fisher-Yates shuffle with seeded RNG ensures reproducibility

3. **After Hand (Reveal Phase)**:
   - Server reveals the `serverSeed` along with `deckOrder`
   - This data is persisted in the `hand_seeds` table

4. **Verification**:
   - Players can verify `SHA256(serverSeed) === serverSeedHash` (proves commitment)
   - Players can recompute the deck order and verify it matches
   - Verification endpoint: `POST /api/v1/games/verify-hand`

### Key Files
- `src/services/provably-fair.service.ts` — Core HMAC/hashing/verification logic
- `src/services/hand-seed-persistence.service.ts` — Persists seeds to database
- `src/entities/hand-seed.entity.ts` — Database entity for seed storage
- `src/repositories/hand-seed.repository.ts` — Data access for seeds

### API Endpoints
- `POST /api/v1/games/verify-hand` — Verify a hand's fairness
- `GET /api/v1/games/provably-fair/info` — Get explanation of the algorithm
- `GET /api/v1/games/:gameId/seeds` — Get all hand seeds for a game
- `GET /api/v1/games/:gameId/seeds/:handNumber` — Get specific hand seed

### WebSocket Events
- `handStarted` — Includes `provablyFair.serverSeedHash` commitment
- `handResult` — Includes full `provablyFair` verification data

### Security Properties
- Server cannot predict player actions, so shuffling before commitment is fair
- Server cannot change the shuffle after commitment (hash binding)
- Players can independently verify without trusting the server
- All seeds are persisted for post-game audit

---

## Bot Activity Dashboard & Auto-Registration

### Bot Activity Tracking
Real-time visibility into bot participation across games and tournaments:

**API Endpoints:**
- `GET /bots/:id/activity` — Get activity for a specific bot
- `GET /bots/my/activity` — Get activity for all user's bots (authenticated)
- `GET /bots/active` — Get all currently active bots (public)

**Activity Data Includes:**
- Active games: table ID, game status, hand number, chips, position
- Active tournaments: tournament name/status, chips, position in standings
- Tournament registration status
- Last activity timestamp

**WebSocket Events:**
- `subscribeBotActivity` — Subscribe to real-time updates for a specific bot
- `subscribeActiveBots` — Subscribe to all active bots updates
- `botActivity` — Emitted when bot activity changes

**Service Architecture:**
- `BotActivityService` — Aggregates activity from `LiveGameManagerService` and tournament repositories
- Polls live game state and tournament seats for real-time data
- Efficient: only queries for requested bots, caches results

### Auto-Registration Subscriptions
Bots can be configured to automatically register for tournaments:

**Entity: `BotSubscription`**
```typescript
interface BotSubscription {
  bot_id: string;              // Bot to auto-register
  tournament_id?: string;      // Specific tournament (or null for filters)
  tournament_type_filter?: "rolling" | "scheduled";
  min_buy_in?: number;
  max_buy_in?: number;
  priority: number;            // 1-100, higher = processed first
  status: "active" | "paused" | "expired";
  expires_at?: Date;
}
```

**API Endpoints:**
- `GET /bots/:botId/subscriptions` — List all subscriptions
- `POST /bots/:botId/subscriptions` — Create new subscription
- `PUT /bots/:botId/subscriptions/:id` — Update subscription
- `DELETE /bots/:botId/subscriptions/:id` — Delete subscription
- `POST /bots/:botId/subscriptions/:id/pause` — Pause subscription
- `POST /bots/:botId/subscriptions/:id/resume` — Resume subscription
- `GET /bots/:botId/subscriptions/stats` — Get subscription statistics

**Auto-Registration Service:**
- `BotAutoRegistrationService` — Background service that processes subscriptions
- Listens for `tournament.created` and `tournament.statusChanged` events
- Runs scheduled job every minute to process pending registrations
- Respects tournament rules (max players, one bot per user)
- Tracks successful/failed registration attempts per subscription
- Cleans up expired subscriptions automatically

**Matching Logic:**
1. When tournament opens for registration:
   - Find subscriptions with matching `tournament_id`
   - Find subscriptions with matching filters (type, buy-in range)
   - Process in priority order (highest first)
2. For each matching subscription:
   - Verify bot is active
   - Verify tournament has space
   - Verify user doesn't have another bot in tournament
   - Register bot if all checks pass

**Frontend Integration:**
- Bot profile page shows active games/tournaments in real-time
- Subscription management UI in bot profile
- "Active Now" panel on Bots page shows currently playing bots
- Navbar badge shows count of active bots

---

## Bot Builder (Primary Bot Creation)

### Overview
All bots on the platform are created through the BotBuilder UI at `/bots/build` or via the `register-developer` API (which creates a bot with a default strategy). There are no external bot servers — all bot strategy evaluation happens in-process via `StrategyEngineService`.

### Bot Entity
Bots are stored with the following key fields:
- `name` — Bot display name
- `description` — Optional description
- `active` — Whether the bot is active
- `strategy` — JSONB column (NOT NULL) containing the strategy definition
- `user_id` — Owner of the bot

### Tiers
- **Quick Bot** — Personality sliders (aggression, bluff frequency, risk tolerance) + presets
- **Strategy Builder** — Visual IF/THEN rule builder with conditional blocks
- **Pro Builder** — Full range chart editor with per-position control

### Architecture
- **Frontend**: `BotBuilder.tsx` page with step-based wizard (tier → personality → rules → review)
- **Components**: `TierSelector`, `PersonalitySliders`, `PersonalityPresets`, `RuleBuilder`, `RangeChart`, `PositionOverrides`, `WhatIfSimulator`
- **Store**: `botBuilderStore.ts` (Zustand) manages wizard state
- **Backend**: `StrategyEngineService` evaluates the strategy JSON at game-time in-process
- **Route**: `/bots/build` (requires authentication, lazy-loaded)

### Strategy Evaluation
During gameplay, the game loop calls `StrategyEngineService.evaluateStrategy(strategy, gameState)` to determine each bot's action. This runs in the same process (or worker thread) as the game engine — no HTTP calls are made.

### Design Decisions
- Route placed before `/bots/:id` in router to avoid param conflict
- Requires authentication (no guest access) since created bots are tied to user accounts
- Strategy JSON validated by `strategy.validator.ts` before persistence
- `register-developer` API creates bots with a default strategy (no endpoint parameter)

---

## Frontend UX Features

### Skeleton Loading Screens
All data-fetching pages (Tables, Tournaments, Bots, Leaderboard) use skeleton placeholders instead of spinner-only loading states. Reusable components: `Skeleton`, `SkeletonMetricCards`, `SkeletonPageHeader`, `SkeletonCard`, `SkeletonTable` in `primitives.tsx`.

### Page Transitions
`Layout` wraps `<Outlet>` with framer-motion `AnimatePresence` for smooth fade+slide transitions between pages (200ms ease-in-out).

### Breadcrumbs
`PageHeader` accepts an optional `breadcrumbs` prop (`BreadcrumbItem[]`). When provided, it renders a navigation breadcrumb trail instead of the back button. Used on BotProfile, TournamentDetail, and BotBuilder pages.

### Toast Notifications
Global toast system via `toastStore.ts` (Zustand). Import `toast("message", "success")` anywhere. `ToastContainer` renders in Layout. Supports success/error/warning/info tones with auto-dismiss.

### Keyboard Navigation
`useKeyboardNav` hook in Layout: Cmd/Ctrl+1 = Tables, Cmd/Ctrl+2 = Tournaments, Cmd/Ctrl+3 = Bots, Cmd/Ctrl+4 = Leaderboard.

### Game View Animations
- Hole cards: spring-based scale-in with staggered delay per card
- Community cards: drop-in from above with spring physics and 150ms stagger
- Win celebration: confetti burst (24 particles) + flying chips + winner banner with glow
- Player actions: animated action badges with position-aware placement

---

## Platform Analytics & Reporting

### Overview
Comprehensive analytics system for tracking platform health, user engagement, and bot performance. Designed to provide investor-ready metrics and daily operational reports.

### Key Components

**PlatformAnalyticsService:**
- Aggregates metrics from multiple data sources (users, bots, games, tournaments)
- Caches frequently accessed counts (hand count cached for 1 minute)
- Provides lifetime, daily, live, and health statistics
- Calculates top performers by net chip gains

**DailySummaryService:**
- Scheduled via `@nestjs/schedule` cron jobs
- Runs at configurable hour (default 8 AM UTC)
- Generates both HTML and plain text email content
- Tracks sent summaries in `daily_summaries` table for audit
- Supports manual trigger via admin endpoint

**Frontend Event Tracking:**
- Automatic page view tracking on route changes
- User action tracking (bot creation, tournament joins, etc.)
- Session-based tracking with UUID session IDs
- IP hashing for privacy (SHA-256, truncated)
- Batched event sending (every 5 seconds or 10 events)

### Data Flow

```
Frontend Events → POST /analytics/events → analytics_events table
                                               ↓
                           AnalyticsController aggregates
                                               ↓
Admin Dashboard ← GET /admin/stats ← PlatformAnalyticsService
Home Page ← GET /platform/stats ←      (queries across entities)
                                               ↓
                           DailySummaryService
                                               ↓
                      @Cron(EVERY_DAY_AT_8AM)
                                               ↓
                           Email recipients
```

### Entities

**PlatformMetrics:**
- One row per day (date is unique key)
- Stores: total_users, new_users, active_users, total_bots, new_bots, active_bots
- Stores: games_played, hands_dealt, tournaments_completed
- Stores: total_chip_volume, avg_bot_response_ms, bot_timeout_count, bot_error_count
- Stores: peak_concurrent_games

**AnalyticsEvent:**
- Tracks frontend user interactions
- Fields: user_id (nullable), event_type, event_data (JSONB), session_id
- Fields: ip_hash, user_agent, page_url, referrer
- Indexed on: user_id, event_type, session_id, created_at

**DailySummary:**
- Records of sent daily email summaries
- Fields: summary_date, status, recipients, metrics_snapshot (JSONB)
- Fields: sent_at, error_message, retry_count

### API Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /analytics/platform/stats` | Public | Real-time platform statistics |
| `GET /analytics/admin/stats` | Admin | Detailed stats with history and top performers |
| `POST /analytics/events` | Public | Record frontend analytics events |
| `POST /analytics/admin/trigger-summary` | Admin | Manually send daily summary |
| `POST /analytics/admin/save-metrics` | Admin | Force save daily metrics snapshot |
| `GET /analytics/events/summary` | Admin | Event counts by type |
| `GET /analytics/metrics/history` | Admin | Historical metrics for charts |

### Configuration

```bash
DAILY_SUMMARY_ENABLED=true              # Enable scheduled daily summaries
DAILY_SUMMARY_RECIPIENTS=a@x.com,b@x.com  # Comma-separated recipient list
DAILY_SUMMARY_HOUR=8                    # Hour (UTC) to send summary
ANALYTICS_RETENTION_DAYS=90             # Days to keep analytics events
```

### Frontend Integration

**Home Page (`/`):**
- Fetches real stats from `/analytics/platform/stats`
- Shows: total hands, total bots, total tournaments, live games
- Loading state with skeleton placeholders

**Admin Dashboard (`/admin/analytics`):**
- Requires admin role (redirects non-admins)
- KPI cards with lifetime and daily metrics
- Line/Area charts for trends (Recharts)
- Bar chart for games over time
- Top performers leaderboard
- Performance metrics (response time, errors)
- Manual summary trigger button

**Event Tracking (`utils/analytics.ts`):**
- Singleton `Analytics` class with batched sending
- Automatic session management
- Helper methods: `trackPageView`, `trackBotCreated`, `trackTournamentJoined`, etc.
- `usePageTracking()` hook for route change tracking

---

## Tournament Director Improvements (2026-03)

### Proper Table Creation
Tables are now correctly created in the database before seating players:
- `TournamentDirectorService.createTable()` calls `tournamentRepository.createTable()` first
- Creates `tournament_tables` record with proper UUID
- Then creates `tournament_seats` records (satisfies FK constraint)
- Uses `crypto.randomUUID()` for all IDs (fits varchar(36))

### Leaderboard Synchronization
Tournament leaderboard now reflects live chip counts:
- Seats created when players added to tables via `tournamentRepository.seatBot()`
- Chips synced periodically via `syncChipsToDatabase()` in game loop
- Busted players marked via `tournamentRepository.bustSeat()`

### Game Error Recovery
Tournament director now recovers from game errors:
- `checkAndRecoverErroredGames()` runs in game loop
- Detects tables in "error" status
- Recreates game instance with current chip counts
- Moves players from broken tables if < 2 active
- Logs recovery attempts

### Player Bust Handling
Busted players are now properly removed from games:
- `checkForBustedPlayers()` calls `tableEntry.game.removePlayer()`
- Updates `tournament_entries` with `finish_position` and `bust_level`
- Updates `tournament_seats` with `busted: true`
- Emits `tournament.playerBusted` event

---

## Visual & AI-Powered Testing Framework (2026-03)

### Overview
Comprehensive testing framework that enables AI agents to act as QA testers, automatically finding visual bugs, layout issues, and UI problems.

### Test Categories

**1. Visual Regression Testing**
- Detects CSS/layout bugs like element overlaps
- Uses browser MCP tools for automation
- Takes screenshots for visual evidence

**2. DOM Overlap Detection**
- Programmatic detection of overlapping elements
- Specifically designed to catch card/name overlaps at 9-player tables
- Configurable overlap thresholds

**3. WebSocket Real-time Tests**
- Verifies UI updates correctly on WebSocket events
- Tests: player joins, bets, folds, cards dealt, winner declared
- Uses browser_snapshot with includeDiff for change detection

**4. Responsive Viewport Tests**
- Tests layout at various screen sizes
- Desktop, tablet, and mobile viewports
- Touch target size verification

**5. Error State Tests**
- Verifies error handling UI
- Tests: 404/500, network offline, WebSocket disconnect, form validation

**6. Performance/Load Tests**
- Backend stress testing
- Concurrent API requests, WebSocket connections
- Concurrent game simulation

**7. Network Resilience Tests**
- Bot timeout handling
- Slow response handling
- Disconnection recovery

### Usage

```bash
# Generate AI instructions for any test suite
npm run test:visual -- ai "Game Table Visual"

# Run load tests
npm run test:load
npm run test:load:ws
npm run test:load:games

# Run Storybook for component testing
cd frontend && npm run storybook
```

### Key Files

| File | Purpose |
|------|---------|
| `tests/qa/visual/run-visual-tests.ts` | Main runner, generates AI instructions |
| `tests/qa/visual/dom-overlap-detector.ts` | Overlap detection algorithms |
| `tests/qa/visual/game-table-visual.test.ts` | Game table visual tests |
| `tests/qa/performance/load-test.ts` | Load testing |
| `frontend/src/components/game/Table.stories.tsx` | Storybook visual tests |

### Storybook Stories

Key test cases for visual regression:
- `NinePlayers` - 9-player full table (overlap stress test)
- `NinePlayersLongNames` - Maximum length names
- `AllInMultiway` - Multiple all-ins
- `MixedPlayerStates` - Folded, all-in, disconnected players

---

### Poker Invariants (Critical Rules)

These rules must **NEVER** be violated:

**Money:**
- `chip_conservation`: Total chips = constant
- `no_negative_stacks`: All chips >= 0
- `bet_within_stack`: Bets <= player's chips

**Cards:**
- `unique_cards_in_play`: No duplicates
- `community_cards_count`: 0, 3, 4, or 5 cards
- `hole_cards_count`: Exactly 2 per player

**Actions:**
- `correct_turn`: Only active player acts
- `folded_player_cannot_act`: Folded = out

---

## Admin Tournament Dashboard

A comprehensive admin UI for tournament management, accessible at `/admin/tournaments`.

### Features

**Tournament Creation:**
- Create both rolling and scheduled tournaments
- Configure all tournament parameters:
  - Name, buy-in, starting chips
  - Min/max players, players per table
  - Turn timeout, late registration level
  - Rebuy settings
  - For scheduled: datetime picker for auto-start

**Tournament Management:**
- List all tournaments with status filtering (All, Active, Registering, Finished)
- Start/cancel tournaments
- Edit scheduled start times inline
- View registered player counts

**Scheduler Configuration:**
- View scheduler status (running/stopped)
- Edit cron expression at runtime
- See next/last check timestamps
- Understanding of scheduler behavior

### Frontend Components

| Component | Purpose |
|-----------|---------|
| `AdminTournaments.tsx` | Main admin page |
| `TournamentCard` | Individual tournament display with actions |
| `CreateTournamentForm` | Modal form for new tournaments |
| `SchedulerStatusCard` | Scheduler configuration panel |

### API Integration

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/tournaments` | GET | List all tournaments |
| `/tournaments` | POST | Create tournament |
| `/tournaments/:id/start` | POST | Start tournament |
| `/tournaments/:id/cancel` | POST | Cancel tournament |
| `/tournaments/:id/schedule` | PATCH | Update scheduled start |
| `/tournaments/admin/scheduler` | GET | Get scheduler status |
| `/tournaments/admin/scheduler` | PATCH | Update scheduler config |
| `/tournaments/scheduled/upcoming` | GET | List upcoming scheduled |

### Access Control

- Route protected by `RequireAdmin` wrapper
- All admin endpoints check `user.role === "admin"`
- Non-admin users redirected to home page

### Navigation

- "Manage" link appears in nav for admin users
- Available in both desktop and mobile navigation
- Quick link from Admin Analytics page

---

## Known Gaps / Future Work

- **Tournament reset** — finished tournaments can't be restarted without manual DB changes
- **WebSocket authentication** — JWT validation on connection implemented, need refresh handling
- **Hand-for-hand bubble play** — not implemented for tournament bubble
- **Dead button rule** — need to choose and implement consistently
- **Client-provided seeds** — Players could provide their own client seed for extra transparency
- **Duplicate results entries** — Race condition can cause same player to appear twice in results
- **Game records not created** — Tournament games not persisted to `games` table (FK violations for hand_seeds)
- **Missing finish positions** — Some eliminations don't record finish_position correctly

For comprehensive edge case documentation, see `EDGE_CASES.md`.

---

## Tournament Scheduling

Scheduled tournaments automatically start when their `scheduled_start_at` time is reached.

### Configuration

Environment variables:
- `TOURNAMENT_SCHEDULER_ENABLED` — Enable/disable scheduler (default: true)
- `TOURNAMENT_SCHEDULER_CRON` — Cron expression for check frequency (default: "*/30 * * * * *")

### Admin API

- `GET /api/v1/tournaments/admin/scheduler` — Get scheduler status
- `PATCH /api/v1/tournaments/admin/scheduler` — Update scheduler config (cron expression)
- `PATCH /api/v1/tournaments/:id/schedule` — Update tournament scheduled start time
- `GET /api/v1/tournaments/scheduled/upcoming` — List upcoming scheduled tournaments

### How It Works

1. Scheduler runs on cron schedule (default: every 30 seconds)
2. Finds tournaments with `type: "scheduled"` and `status: "registering"`
3. If `scheduled_start_at <= now` and enough players registered → starts tournament
4. If not enough players → cancels tournament

---

## Leaderboard & Stats

### Endpoints

- `GET /api/v1/games/leaderboard?period=all|month|week&limit=20` — Global leaderboard
- `GET /api/v1/tournaments/:id/leaderboard` — Tournament leaderboard

### Stats Tracked

| Stat | Description | Updated |
|------|-------------|---------|
| `total_hands` | Hands played | Per hand |
| `hands_won` | Hands won | Per hand |
| `total_tournaments` | Tournaments entered | On tournament finish |
| `tournament_wins` | Tournament 1st places | On tournament finish |
| `total_net` | Net profit/loss | Per hand + tournament payouts |
