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
- Guards for JWT, API Key, and Role-based auth
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

Developers can register and create a bot without using the UI:

```bash
curl -X POST http://localhost:3000/api/v1/auth/register-developer \
  -H "Content-Type: application/json" \
  -d '{
    "email": "developer@example.com",
    "name": "Bot Developer",
    "password": "SecurePass123",
    "botName": "MyPokerBot",
    "botEndpoint": "http://localhost:3001/action",
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
  "bot": { "id": "...", "name": "MyPokerBot", "endpoint": "..." },
  "warnings": ["Using HTTP - HTTPS will be required in production"]
}
```

**Security Features:**
- Rate limited: 3 requests per IP per hour
- Health check required: Bot endpoint must respond before registration succeeds
- Input validation: Strict validation on all fields (email, password complexity, bot name format)
- Max 10 bots per account
- Email verification skipped (tracked in TECH_DEBT.md)
- Localhost/HTTP allowed in development only (tracked in TECH_DEBT.md)

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

**Key Services:**
- `RedisService` — Core Redis client wrapper (ioredis)
- `RedisPubSubService` — Dedicated pub/sub connections
- `GameOwnershipService` — Distributed locking for games/tournaments
- `RedisGameStateService` — State persistence (Hash per game)
- `RedisEventBusService` — Cross-instance event distribution

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

## Bot Protocol Decisions

### Raise amount = additional chips, not total bet
`{ type:"raise", amount:100 }` means raise 100 on top of the call. Bot puts in `toCall + 100` total. `maxRaise` = `player.chips - toCall` (max additional raise before all-in).

**Why:** More intuitive. Bot developers think "I want to raise by X", not "my total bet should be Y".

### `you.bestHand` only on flop onwards
Absent pre-flop (no community cards to evaluate). Present on flop, turn, river. Contains `{ name, cards }` — the hand name and 5 specific cards making it.

### Opponent hole cards never sent
`players[]` never includes opponent cards. Only revealed at showdown via `handResult` WebSocket event.

### Action validation is strict
Invalid actions result in automatic fold with a strike. Bots sending actions out of turn are rejected immediately.

### Response format
```json
{ "type": "fold" }
{ "type": "check" }
{ "type": "call" }
{ "type": "raise", "amount": 300 }
{ "type": "all_in" }
```

---

## Bot Connectivity & Resilience

### Timeout Mechanism
Every bot call has a configurable timeout (`BOT_TIMEOUT_MS`, default 10s):
- Game engine uses `Promise.race` to enforce timeout
- On timeout: automatic fold + strike
- 3 consecutive timeouts = disconnection

### Retry Logic (BotCallerService)
Transient failures are retried automatically:
- `BOT_MAX_RETRIES=1` (default) — one retry attempt
- Retryable errors: `ECONNRESET`, `ETIMEDOUT`, `socket hang up`, HTTP 502/503/504
- Non-retryable errors: invalid JSON, response too large, circuit breaker open
- Exponential backoff: `BOT_RETRY_DELAY_MS * attempt`

### Circuit Breaker Pattern
Prevents cascading failures when a bot is unhealthy:
- Opens after `BOT_CIRCUIT_BREAKER_THRESHOLD` consecutive failures (default 5)
- Half-opens after `BOT_CIRCUIT_BREAKER_RESET_MS` (default 30s) for retry
- Successful call resets the breaker
- Events emitted: `bot.circuitOpened`, `bot.callFailed`

### Health Check
Bots should expose `GET /health` returning HTTP 200:
- Called before game registration validation
- Pre-game health check runs on all bots before starting
- Unhealthy bots can be excluded from game start

### HTTP Keep-Alive (BotCallerService)
Connection pooling for reduced overhead:
- `http.Agent` and `https.Agent` with `keepAlive: true`
- `maxSockets: 100`, `maxFreeSockets: 20`
- Eliminates TCP handshake overhead for repeated calls to same bot
- Agents shared across all bot calls

### Periodic Health Checks (BotHealthSchedulerService)
Background monitoring of all registered bots:
- `BOT_HEALTH_CHECK_INTERVAL_MS=30000` for idle bots
- `BOT_ACTIVE_GAME_CHECK_INTERVAL_MS=10000` for in-game bots
- Events emitted: `bot.healthStateChanged`, `bot.healthCheckRoundCompleted`
- Pre-game registration via `registerBot(botId, endpoint)`

### Graceful Degradation (BotResilienceService)
Fallback strategies when bots fail:
- **conservative:** Check if possible, call small bets (<25% pot), else fold
- **aggressive:** May raise when can check, call medium bets (<50% pot)
- **random:** Random valid action (for testing)
- **check_fold:** Always check or fold (safest)

Configurable via `BOT_FALLBACK_STRATEGY` env var.

### Bot Metrics Gateway
Real-time WebSocket monitoring at `/metrics`:
- `getSnapshot` — current health/latency of all bots
- `getHealthHistory` — last health check round results
- `triggerHealthCheck` — manual health check
- Events: `snapshot`, `botStateChanged`, `circuitBreaker`, `activeGameAlert`

### Latency Tracking
Rolling window of last 100 response times per bot:
- Average latency available via `getAverageLatency(botId)`
- High latency bots (>3s average) flagged in validation reports
- Helps identify bots at risk of timeout

### Response Validation
Bot responses are validated before processing:
- Must be JSON object
- Must have `type` field (`fold`, `check`, `call`, `raise`, `bet`, `all_in`)
- `raise`/`bet` must include numeric positive `amount`
- Amount must be within `minRaise` and `maxRaise` bounds
- Invalid responses trigger automatic fold + strike

### Bot Validation Suite (BotValidatorService)
Comprehensive pre-registration validation with 13 scenarios:
- **Connectivity:** Health check endpoint
- **Basic:** Pre-flop, flop, river actions
- **Edge cases:** Short stack, all-in facing, heads-up, multi-way
- **Stress:** Response time, large numbers

Validation produces a weighted score (0-100):
- Connectivity: 30%
- Basic scenarios: 40%
- Edge cases: 20%
- Stress tests: 10%

---

## Game Engine Decisions

### Antes posted before blinds
All active players post ante first, then SB and BB. Matches standard tournament ante structure.

### 3-strike disconnection, not immediate
A bot failure (timeout, error, bad JSON) gets a strike and a penalty fold. After 3 **consecutive** failures it's disconnected. Strikes reset on any successful response.

### Penalty fold is recorded differently from intentional fold
`actions.is_penalty = true` when the server folded on the bot's behalf. Critical for detecting unstable bots vs conservative strategy.

### Auto-start deferred with `setImmediate`
`addPlayer()` triggers `startGame()` via `setImmediate` not synchronously. Allows tests to call `game.stop()` in the same tick before the loop starts.

### 4000ms sleep between hands
After each hand, the loop sleeps 4000ms. Gives the UI time to render the final state and prevents hands blurring in the log. Configurable via `sleepMs` in `GameInstance`.

---

## Security Services

### HMAC Bot Payload Signing (HmacSigningService)
Optional protection against fake game state injection:
- **Enable:** `ENABLE_BOT_HMAC_SIGNING=true`
- **Headers:** `X-Poker-Signature`, `X-Poker-Timestamp`, `X-Poker-Nonce`
- **Replay protection:** Signature includes timestamp, rejected if >5min old
- **Nonce tracking:** Prevents exact replay attacks

Bot servers should verify the signature using their shared secret.

### API Key Rotation (ApiKeyRotationService)
Secure key management with zero-downtime rotation:
- **Rotate:** `POST /users/:id/rotate-api-key` generates new key
- **Grace period:** Old key valid for 24h (configurable via `API_KEY_GRACE_PERIOD_MS`)
- **Status:** `GET /users/:id/api-key-status` shows legacy key expiration
- **Revoke:** `POST /users/:id/revoke-api-keys` (admin) immediately invalidates all keys

### Webhook Signing (WebhookSigningService)
Outgoing webhook authentication (for future event notifications):
- **Format:** Stripe-style `v1=<signature>` in `X-Poker-Webhook-Signature`
- **Includes:** Webhook ID and timestamp for client verification
- **Protection:** Timestamp validation prevents replay attacks

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

### API Key Authentication
- Keys stored as SHA-256 hashes
- Raw key returned once at registration, never stored
- Used for bot-to-server communication

### Rate Limiting
- Global rate limiting via @nestjs/throttler
- Configurable limits per endpoint
- Default: 100 requests per minute per IP

### Input Validation
- Strict DTO validation with class-validator
- Bot endpoints validated (no internal IPs)
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

## Developer Experience

### Philosophy: 5 Minutes to First Bot
The complexity of getting started directly impacts adoption. Goal: anyone can build and deploy a working bot in under 5 minutes.

### Documentation for AI Assistants
`docs/AI_CONTEXT.md` is specifically designed to be pasted into ChatGPT/Claude/etc. Contains complete request/response format, field explanations, working templates in both Node.js and Python, and common prompts.

**Why:** In 2026, most developers use AI to write code. Optimizing for AI-assisted development is critical.

### Zero-Config SDKs
Both JavaScript and Python SDKs (`bots/sdk/`) require zero setup:
- No npm install needed for Node.js
- No pip install needed for Python
- Single function to implement: `decide(state) -> action`
- Built-in logging, error handling, health endpoint

### Progressive Complexity
Examples (`bots/examples/`) are ordered by complexity:

**Beginner (4-15 lines):**
1. `01-check-fold.js` — 4 lines, never risks chips
2. `02-calling-station.js` — 4 lines, calls everything
3. `03-tight-passive.js` — 15 lines, premium hands only

**Intermediate (30-45 lines):**
4. `04-tight-aggressive.js` — 40 lines, classic TAG
5. `05-pot-odds-calculator.js` — 30 lines, math-based
6. `06-position-aware.js` — 45 lines, position exploits

**Advanced (100+ lines):**
7. `07-data-driven.js` — SQLite persistence, opponent tracking, player classification (LAG/TAG/LP/TP)
8. `08-monte-carlo.js` — Hand equity via 1000+ simulations, EV calculations
9. `09-adaptive-exploiter.js` — Real-time pattern detection, exploit strategies
10. `10-tournament-icm.js` — ICM calculations, bubble factor, push/fold ranges

### Testing Playground
`bots/playground/test-bot.js` lets developers test locally:
- 11 pre-built scenarios (preflop, flop, river, edge cases)
- Response validation
- Timing measurement
- Colored pass/fail output

### Strategy Helpers in SDK
Built-in functions reduce implementation complexity:
- `Strategy.preFlopStrength(holeCards, position)` — 0 to 1
- `Strategy.postFlopStrength(bestHand, opponentCount)` — 0 to 1
- `Strategy.shouldValueBet(state)` — boolean
- `Strategy.shouldCall(state, buffer)` — pot odds comparison
- `Action.potSized(pot, action)` — standard bet sizing

---

## Testing Strategy

### Three-Tier Test Structure

**Unit Tests** (`tests/unit/`):
- Pure game logic (hand evaluation, pot management, betting)
- No external dependencies or mocks
- 161+ tests covering all edge cases
- Run: `npm run test:unit`

**Integration Tests** (`tests/integration/`):
- Multiple components together with mocked services
- Mock HTTP servers for bot communication testing
- Service layer testing without database
- Run: `npm run test:integration`

**E2E Tests** (`tests/e2e/`):
- Full API testing with real PostgreSQL database
- WebSocket connection testing
- Complete user flows (register → create bot → join table)
- Run: `npm run test:e2e` (requires PostgreSQL)

### Test Utilities

- `MockBotServer` — Configurable HTTP server for simulating bots
- `createCallingBot/createFoldingBot/createAggressiveBot` — Pre-built bot behaviors
- `createSlowBot` — For timeout testing
- `createUnreliableBot` — For resilience testing

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
{
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

## Known Gaps / Future Work

- **Scheduled tournament start** — `type:'scheduled'` exists but no timer fires at `scheduled_start_at`
- **Tournament reset** — finished tournaments can't be restarted without manual DB changes
- **WebSocket authentication** — JWT validation on connection implemented, need refresh handling
- **Hand-for-hand bubble play** — not implemented for tournament bubble
- **Dead button rule** — need to choose and implement consistently
- **Client-provided seeds** — Players could provide their own client seed for extra transparency

For comprehensive edge case documentation, see `EDGE_CASES.md`.
